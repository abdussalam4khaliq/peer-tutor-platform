import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ReferralShare from "@/components/referral-share";
import { computeTopicStates, pickResumeIndex } from "@/lib/topic-lock";
import { summarizeCourse, accessStatus } from "@/lib/progress";
import { quizPhase, PHASE_BADGE } from "@/lib/quiz";
import { formatDate, formatDateTime, formatPoints } from "@/lib/format";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/complete-profile");

  if ((profile.role === "student" || profile.role === "tutor") && !profile.department_id) {
    const { data: pendingRequest } = await supabase
      .from("structure_requests")
      .select("*")
      .eq("requester_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return (
      <main className="app-container app-container--narrow">
        <AppHeader profile={profile} />
        <h1>Welcome, {profile.full_name}</h1>
        {pendingRequest?.status === "pending" && (
          <p>
            We&apos;re setting up <strong>{pendingRequest.requested_school}</strong> ({pendingRequest.requested_faculty} — {pendingRequest.requested_department}) for you.
            This usually takes a day or two — check back soon.
          </p>
        )}
        {pendingRequest?.status === "rejected" && (
          <p>
            Your request wasn&apos;t approved: {pendingRequest.admin_note || "no reason given"}.
            Please email <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.
          </p>
        )}
        {!pendingRequest && <p>Your account doesn&apos;t have a department set yet. Please email <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.</p>}
      </main>
    );
  }

  if (profile.role === "tutor") {
    const { data: myCourses } = await supabase
      .from("courses")
      .select("id")
      .eq("tutor_id", user.id);

    if ((myCourses || []).length === 0) {
      return (
        <main className="app-container app-container--narrow">
          <AppHeader profile={profile} />
          <h1>Welcome, {profile.full_name}</h1>
          {profile.tutor_status === "pending" && (
            <p>Your Tutor application is under review. Check back soon.</p>
          )}
          {profile.tutor_status === "rejected" && (
            <>
              <p>Your Tutor application wasn&apos;t approved this time.</p>
              <a href="/apply-tutor">Apply again</a>
            </>
          )}
          {!profile.tutor_status && (
            <>
              <p>You haven&apos;t applied to teach a course yet.</p>
              <a href="/apply-tutor">Apply to become a Tutor</a>
            </>
          )}
        </main>
      );
    }
  }

  const isAdmin = profile.role === "admin" || profile.role === "super_admin";
  const isTutor = profile.role === "tutor";
  const isStudent = profile.role === "student";
  const now = new Date();

  // ---- stats (student_stats for students, tutor_stats for tutors) ----
  let stats = null;
  if (isStudent) {
    const { data } = await supabase.from("student_stats").select("*").eq("student_id", user.id).maybeSingle();
    stats = data;
  } else if (isTutor) {
    const { data } = await supabase.from("tutor_stats").select("*").eq("tutor_id", user.id).maybeSingle();
    stats = data;
  }

  const { data: credits } = await supabase
    .from("referral_credits")
    .select("amount, reward_days")
    .eq("referrer_id", user.id);
  const totalEarned = (credits || []).reduce((sum, c) => sum + Number(c.amount), 0);
  const totalDays = (credits || []).reduce((sum, c) => sum + Number(c.reward_days || 0), 0);

  // ---- learning: the student's own courses (tutors can learn too) ----
  const { data: enrollmentRows } = isAdmin
    ? { data: [] }
    : await supabase
        .from("enrollments")
        .select("id, course_id, trial_ends_at, paid_until, course:courses(id, code, title)")
        .eq("student_id", user.id);
  const enrollments = (enrollmentRows || []).filter((e) => e.course && e.course.id);
  const learnCourseIds = enrollments.map((e) => e.course_id);

  const { data: learnTopics } = learnCourseIds.length
    ? await supabase
        .from("topics")
        .select("id, course_id, title, order_index, question_count, hidden")
        .in("course_id", learnCourseIds)
        .order("order_index", { ascending: true })
    : { data: [] };
  const learnTopicIds = (learnTopics || []).map((t) => t.id);

  const { data: learnAttempts } = learnTopicIds.length
    ? await supabase
        .from("test_attempts")
        .select("topic_id, score_percent, passed, created_at")
        .eq("student_id", user.id)
        .in("topic_id", learnTopicIds)
    : { data: [] };

  const courseCards = enrollments
    .map((enrollment) => {
      const course = enrollment.course;
      const topics = (learnTopics || []).filter((t) => t.course_id === course.id);
      const topicSet = new Set(topics.map((t) => t.id));
      const attempts = (learnAttempts || []).filter((a) => topicSet.has(a.topic_id));
      const summary = summarizeCourse(topics, attempts);
      const passed = new Set(attempts.filter((a) => a.passed).map((a) => a.topic_id));
      const states = computeTopicStates(topics, passed);
      const resumeIndex = pickResumeIndex(states);
      const resumeTopic = topics[resumeIndex];
      const finished = summary.testCount > 0 && summary.passedCount === summary.testCount;
      return {
        enrollment,
        course,
        summary,
        resumeTopic,
        access: accessStatus(enrollment, now),
        label: finished ? "Review course" : summary.totalAttempts === 0 ? "Start learning" : "Continue",
        sortKey: summary.lastActivity || "",
      };
    })
    .sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));

  // ---- open and upcoming quizzes in the student's courses ----
  const { data: quizRows } = learnCourseIds.length
    ? await supabase
        .from("quizzes")
        .select("id, course_id, title, opens_at, closes_at, duration_minutes")
        .in("course_id", learnCourseIds)
        .eq("published", true)
        .gt("closes_at", now.toISOString())
        .order("closes_at", { ascending: true })
        .limit(4)
    : { data: [] };
  const upcomingQuizzes = quizRows || [];
  const { data: myQuizAttempts } = upcomingQuizzes.length
    ? await supabase
        .from("quiz_attempts")
        .select("quiz_id, status, deadline_at")
        .eq("student_id", user.id)
        .in("quiz_id", upcomingQuizzes.map((q) => q.id))
    : { data: [] };
  const attemptByQuiz = new Map((myQuizAttempts || []).map((a) => [a.quiz_id, a]));
  const courseById = new Map(enrollments.map((e) => [e.course.id, e.course]));

  // ---- tutor panel ----
  let teachCards = [];
  let toMarkTotal = 0;
  if (isTutor) {
    const { data: taught } = await supabase
      .from("courses")
      .select("id, code, title")
      .eq("tutor_id", user.id)
      .order("code", { ascending: true });
    const taughtIds = (taught || []).map((c) => c.id);

    const { data: taughtTopics } = taughtIds.length
      ? await supabase.from("topics").select("id, course_id").in("course_id", taughtIds)
      : { data: [] };
    const { data: taughtQuizzes } = taughtIds.length
      ? await supabase.from("quizzes").select("id, course_id, title").in("course_id", taughtIds).eq("published", true)
      : { data: [] };
    const { data: pendingAttempts } = (taughtQuizzes || []).length
      ? await supabase
          .from("quiz_attempts")
          .select("quiz_id, pending_manual")
          .in("quiz_id", taughtQuizzes.map((q) => q.id))
          .gt("pending_manual", 0)
      : { data: [] };

    const quizCourse = new Map((taughtQuizzes || []).map((q) => [q.id, q.course_id]));
    teachCards = (taught || []).map((c) => {
      const toMark = (pendingAttempts || []).filter((a) => quizCourse.get(a.quiz_id) === c.id).length;
      toMarkTotal += toMark;
      return {
        course: c,
        topicCount: (taughtTopics || []).filter((t) => t.course_id === c.id).length,
        quizCount: (taughtQuizzes || []).filter((q) => q.course_id === c.id).length,
        toMark,
      };
    });
  }

  // ---- latest notifications ----
  const { data: recentNotifications } = await supabase
    .from("notifications")
    .select("id, title, body, link, read, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(4);

  const firstName = (profile.full_name || "").trim().split(/\s+/)[0] || "there";
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(now)
  );
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const streak = Number(stats?.current_streak || 0);
  const league = stats?.current_league || "bronze";

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />

      {/* ---------- hero ---------- */}
      <section className="dash-hero">
        <div>
          <p className="dash-hero__eyebrow">{profile.school}</p>
          <h1 className="dash-hero__title">{greeting}, {firstName}</h1>
          <p className="dash-hero__sub">
            {isAdmin
              ? "Here's your admin overview."
              : streak > 0
                ? `🔥 ${streak}-day streak. Do something today to keep it alive.`
                : "Pass a topic test or take a quiz today to start a streak."}
          </p>
        </div>
        {isAdmin && <a className="btn btn-sm" href="/admin">Open admin panel</a>}
      </section>

      {(isStudent || isTutor) && (
        <section className="dash-stats" aria-label="Your stats">
          <div className="stat-tile">
            <span className="stat-tile__label">Total EXP</span>
            <span className="stat-tile__value">{formatPoints(stats?.total_exp || 0)}</span>
          </div>
          <div className="stat-tile">
            <span className="stat-tile__label">Day streak</span>
            <span className="stat-tile__value">🔥 {streak}</span>
          </div>
          <div className="stat-tile">
            <span className="stat-tile__label">League</span>
            <span className="stat-tile__value" style={{ textTransform: "capitalize" }}>{league}</span>
          </div>
        </section>
      )}

      {/* ---------- tutor panel ---------- */}
      {isTutor && (
        <section className="dash-section dash-section--tutor">
          <div className="dash-section__head">
            <span className="nav-chip" style={{ background: "var(--ink-900)" }}>Tutor</span>
            <h2>Your classes</h2>
            {toMarkTotal > 0 && <span className="badge badge-amber">{toMarkTotal} submission{toMarkTotal === 1 ? "" : "s"} to mark</span>}
          </div>
          <div className="dash-cards">
            {teachCards.map((t) => (
              <article key={t.course.id} className="tile-card">
                <h3>{t.course.code}</h3>
                <p className="tile-card__sub">{t.course.title}</p>
                <p className="tile-card__meta">
                  {t.topicCount} topic{t.topicCount === 1 ? "" : "s"} · {t.quizCount} quiz{t.quizCount === 1 ? "" : "zes"}
                  {t.toMark > 0 && <> · <strong>{t.toMark} submission{t.toMark === 1 ? "" : "s"} to mark</strong></>}
                </p>
                <div className="action-row">
                  <a className="btn btn-sm" href={`/tutor/courses/${t.course.id}`}>Manage</a>
                  <a className="btn btn-outline btn-sm" href={`/courses/${t.course.id}/forum`}>Forum</a>
                  <a className="btn btn-outline btn-sm" href={`/tutor/courses/${t.course.id}/quizzes`}>Quizzes</a>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ---------- learning ---------- */}
      {!isAdmin && (
        <section className="dash-section dash-section--student">
          <div className="dash-section__head">
            {isTutor && <span className="nav-chip" style={{ background: "var(--moss)" }}>Student</span>}
            <h2>{courseCards.length ? "Continue learning" : "Start learning"}</h2>
          </div>

          {courseCards.length === 0 ? (
            <div className="tile-card">
              <p style={{ margin: "0 0 12px" }}>You haven&apos;t enrolled in a course yet. Every course has a free preview and a 7-day trial.</p>
              <a className="btn btn-sm" href="/courses">Browse courses</a>
            </div>
          ) : (
            <div className="dash-cards">
              {courseCards.map((c) => (
                <article key={c.course.id} className="tile-card">
                  <div className="tile-card__top">
                    <h3>{c.course.code}</h3>
                    <span className={`badge ${c.access.className}`}>{c.access.label}</span>
                  </div>
                  <p className="tile-card__sub">{c.course.title}</p>
                  <div className="bar"><span style={{ width: `${c.summary.percent}%` }} /></div>
                  <p className="tile-card__meta">
                    {c.summary.testCount > 0
                      ? `${c.summary.passedCount} of ${c.summary.testCount} tests passed`
                      : "No tests yet"}
                    {c.resumeTopic && c.label !== "Review course" && <> · next: {c.resumeTopic.title}</>}
                  </p>
                  <div className="action-row">
                    {c.access.until || c.label === "Review course" ? (
                      <a className="btn btn-sm" href={`/courses/${c.course.id}${c.resumeTopic ? `?topic=${c.resumeTopic.id}` : ""}`}>
                        {c.label} →
                      </a>
                    ) : (
                      <a className="btn btn-sm" href="/payment-info">Renew access</a>
                    )}
                    <a className="btn btn-outline btn-sm" href={`/progress/${c.course.id}`}>Report</a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ---------- quizzes + notifications ---------- */}
      <div className="dash-two">
        {!isAdmin && (
          <section>
            <h2>Quizzes</h2>
            {upcomingQuizzes.length === 0 ? (
              <div className="tile-card"><p style={{ margin: 0, color: "var(--ink-600)" }}>No open or upcoming quizzes.</p></div>
            ) : (
              upcomingQuizzes.map((q) => {
                const phase = quizPhase(q, attemptByQuiz.get(q.id), now);
                const badge = PHASE_BADGE[phase];
                return (
                  <a key={q.id} className="list-row" href={`/courses/${q.course_id}/quizzes/${q.id}`}>
                    <span>
                      <strong>{q.title}</strong>
                      <small>{courseById.get(q.course_id)?.code} · closes {formatDateTime(q.closes_at)}</small>
                    </span>
                    <span className={`badge ${badge.className}`}>{badge.label}</span>
                  </a>
                );
              })
            )}
          </section>
        )}

        <section>
          <div className="dash-section__head" style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Recent notifications</h2>
            <a href="/notifications" style={{ fontSize: 13 }}>View all</a>
          </div>
          {(recentNotifications || []).length === 0 ? (
            <div className="tile-card"><p style={{ margin: 0, color: "var(--ink-600)" }}>Nothing new yet.</p></div>
          ) : (
            recentNotifications.map((n) => (
              <a key={n.id} className="list-row" href={n.link || "/notifications"}>
                <span>
                  <strong>{!n.read && <span className="dot" aria-label="unread" />}{n.title}</strong>
                  {n.body && <small>{n.body}</small>}
                </span>
                <small>{formatDate(n.created_at)}</small>
              </a>
            ))
          )}
        </section>
      </div>

      {/* ---------- shortcuts ---------- */}
      <h2>Shortcuts</h2>
      <div className="quick-grid">
        {!isAdmin && <a href="/courses">Courses</a>}
        {!isAdmin && <a href="/progress">My progress</a>}
        {!isAdmin && <a href="/leaderboards">Leaderboards</a>}
        {!isAdmin && <a href="/leagues">Leagues</a>}
        {!isAdmin && <a href="/payment-info">Pay / renew</a>}
        {isTutor && <a href="/tutor/courses">My courses</a>}
        {isAdmin && <a href="/admin">Admin panel</a>}
        <a href="/payouts">Payouts</a>
      </div>

      {/* ---------- referral ---------- */}
      <h2>Invite a friend</h2>
      <div className="card">
        <div className="field-row">
          <span className="field-row__label">Your code</span>
          <span className="field-row__value" style={{ fontFamily: "var(--font-mono)" }}>
            {profile.referral_code || "—"}
          </span>
        </div>
        {(isTutor || totalEarned > 0) && (
          <div className="field-row">
            <span className="field-row__label">Cash bonuses</span>
            <span className="field-row__value">₦{totalEarned}</span>
          </div>
        )}
        <div className="field-row">
          <span className="field-row__label">Bonus access days earned</span>
          <span className="field-row__value">{totalDays}</span>
        </div>
        <p style={{ fontSize: 13, margin: "8px 0 0" }}>
          When someone you refer subscribes, tutors get a cash bonus paid straight to their payout account. Everyone else gets extra days of access.
        </p>
      </div>
      <ReferralShare referralCode={profile.referral_code} />
    </main>
  );
}
