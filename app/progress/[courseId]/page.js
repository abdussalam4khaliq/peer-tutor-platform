import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import { summarizeCourse, accessStatus } from "@/lib/progress";
import { computeTopicStates } from "@/lib/topic-lock";
import { quizPhase, PHASE_BADGE } from "@/lib/quiz";
import { formatDate, formatDateTime, formatPoints } from "@/lib/format";

export default async function CourseProgressPage({ params }) {
  const { courseId } = params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/complete-profile");

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("trial_ends_at, paid_until, course:courses(id, code, title, tutor:profiles(full_name))")
    .eq("student_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!enrollment?.course) notFound();
  const course = enrollment.course;

  const { data: topics } = await supabase
    .from("topics")
    .select("id, title, order_index, question_count, hidden")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });
  const topicList = topics || [];
  const topicIds = topicList.map((t) => t.id);

  const { data: attempts } = topicIds.length
    ? await supabase
        .from("test_attempts")
        .select("topic_id, score_percent, passed, created_at")
        .eq("student_id", user.id)
        .in("topic_id", topicIds)
        .order("created_at", { ascending: false })
    : { data: [] };
  const attemptList = attempts || [];

  const summary = summarizeCourse(topicList, attemptList);
  const passedSet = new Set(attemptList.filter((a) => a.passed).map((a) => a.topic_id));
  const states = computeTopicStates(topicList, passedSet);
  const topicTitle = new Map(topicList.map((t) => [t.id, t.title]));
  const access = accessStatus(enrollment);
  const now = new Date();

  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, title, opens_at, closes_at")
    .eq("course_id", courseId)
    .eq("published", true)
    .order("closes_at", { ascending: false });
  const quizList = quizzes || [];
  const { data: quizAttempts } = quizList.length
    ? await supabase
        .from("quiz_attempts")
        .select("quiz_id, status, deadline_at, total_points, auto_points, manual_points, pending_manual")
        .eq("student_id", user.id)
        .in("quiz_id", quizList.map((q) => q.id))
    : { data: [] };
  const attemptByQuiz = new Map((quizAttempts || []).map((a) => [a.quiz_id, a]));

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />
      <p><a href="/progress">← All my progress</a></p>
      <h1>{course.code} — {course.title}</h1>
      <p style={{ color: "var(--ink-600)" }}>
        Taught by {course.tutor?.full_name || "a Tutor"} · <span className={`badge ${access.className}`}>{access.label}</span>
        {access.until && <> until {formatDate(access.until)}</>}
      </p>

      <div className="card">
        <div className="reader__progress-bar"><span style={{ width: `${summary.percent}%` }} /></div>
        <p style={{ margin: "8px 0 14px", color: "var(--ink-600)" }}>
          {summary.testCount > 0
            ? `${summary.passedCount} of ${summary.testCount} topic tests passed (${summary.percent}%)`
            : "No topic tests in this course yet"}
        </p>
        <div className="field-row"><span className="field-row__label">Average best score</span><span className="field-row__value">{summary.avgBest === null ? "—" : `${summary.avgBest}%`}</span></div>
        <div className="field-row"><span className="field-row__label">Total test attempts</span><span className="field-row__value">{summary.totalAttempts}</span></div>
        <div className="field-row"><span className="field-row__label">Last activity</span><span className="field-row__value">{summary.lastActivity ? formatDateTime(summary.lastActivity) : "—"}</span></div>
      </div>

      {!access.until && (
        <p style={{ color: "var(--ink-600)" }}>
          Your access has ended, so only the free preview topics are listed here. Your progress is saved.{" "}
          <a href="/payment-info">Unlock full access →</a>
        </p>
      )}

      <h2>Topics</h2>
      {topicList.length === 0 && <p>No topics yet.</p>}
      {topicList.map((topic, i) => {
        const state = states[i];
        const info = summary.byTopic.get(topic.id);

        let badge;
        if (!state.hasTest) badge = { label: "No test", className: "badge-grey" };
        else if (state.passed) badge = { label: "Passed ✓", className: "badge-green" };
        else if (state.locked) badge = { label: "Locked 🔒", className: "badge-grey" };
        else if (info) badge = { label: "Not passed yet", className: "badge-amber" };
        else badge = { label: "Not started", className: "badge-grey" };

        return (
          <div key={topic.id} className="card">
            <div className="action-row" style={{ justifyContent: "space-between" }}>
              <strong>{i + 1}. {topic.title}</strong>
              <span className={`badge ${badge.className}`}>{badge.label}</span>
            </div>
            {state.hasTest && (
              <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--ink-600)" }}>
                {info
                  ? `Best score ${Math.round(info.best)}% · ${info.count} attempt${info.count === 1 ? "" : "s"} · last ${formatDate(info.last)}`
                  : "No attempts yet"}
              </p>
            )}
            {!state.locked && (
              <p style={{ margin: "8px 0 0" }}>
                <a href={`/courses/${courseId}?topic=${topic.id}`}>{state.passed || !state.hasTest ? "Review topic →" : "Go to topic →"}</a>
              </p>
            )}
          </div>
        );
      })}

      {quizList.length > 0 && (
        <>
          <h2>Quizzes</h2>
          {quizList.map((quiz) => {
            const attempt = attemptByQuiz.get(quiz.id);
            const phase = quizPhase(quiz, attempt, now);
            const badge = PHASE_BADGE[phase];
            const total = attempt ? Number(attempt.total_points) : 0;
            const earned = attempt ? Number(attempt.auto_points) + Number(attempt.manual_points) : 0;
            return (
              <div key={quiz.id} className="card">
                <div className="action-row" style={{ justifyContent: "space-between" }}>
                  <strong>{quiz.title}</strong>
                  <span className={`badge ${badge.className}`}>{badge.label}</span>
                </div>
                {phase === "results" && (
                  <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--ink-600)" }}>
                    Score {formatPoints(earned)} / {formatPoints(total)}
                    {total > 0 && ` (${Math.round((earned / total) * 100)}%)`}
                    {attempt.pending_manual > 0 && ` · ${attempt.pending_manual} answer${attempt.pending_manual === 1 ? "" : "s"} still being marked`}
                  </p>
                )}
                <p style={{ margin: "8px 0 0" }}>
                  <a href={`/courses/${courseId}/quizzes/${quiz.id}`}>{phase === "results" ? "View results →" : "Open quiz →"}</a>
                </p>
              </div>
            );
          })}
        </>
      )}

      {attemptList.length > 0 && (
        <>
          <h2>Recent test attempts</h2>
          <div className="card">
            {attemptList.slice(0, 10).map((a, i) => (
              <div key={i} className="field-row">
                <span className="field-row__label">{topicTitle.get(a.topic_id) || "Topic"} · {formatDate(a.created_at)}</span>
                <span className="field-row__value">{Math.round(Number(a.score_percent))}% {a.passed ? "✓" : ""}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
