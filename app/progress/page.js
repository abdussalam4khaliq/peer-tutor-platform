import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import { summarizeCourse, accessStatus } from "@/lib/progress";
import { formatDate, formatPoints } from "@/lib/format";

export default async function ProgressPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/complete-profile");

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, course_id, trial_ends_at, paid_until, course:courses(id, code, title)")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });
  const list = (enrollments || []).filter((e) => e.course);
  const courseIds = list.map((e) => e.course_id);

  const { data: topics } = courseIds.length
    ? await supabase
        .from("topics")
        .select("id, course_id, hidden, question_count")
        .in("course_id", courseIds)
    : { data: [] };
  const topicIds = (topics || []).map((t) => t.id);

  const { data: attempts } = topicIds.length
    ? await supabase
        .from("test_attempts")
        .select("topic_id, score_percent, passed, created_at")
        .eq("student_id", user.id)
        .in("topic_id", topicIds)
    : { data: [] };

  const { data: quizzes } = courseIds.length
    ? await supabase
        .from("quizzes")
        .select("id, course_id, closes_at")
        .in("course_id", courseIds)
        .eq("published", true)
    : { data: [] };
  const { data: quizAttempts } = (quizzes || []).length
    ? await supabase
        .from("quiz_attempts")
        .select("quiz_id, status, total_points, auto_points, manual_points")
        .eq("student_id", user.id)
        .in("quiz_id", quizzes.map((q) => q.id))
    : { data: [] };

  const { data: stats } = await supabase
    .from("student_stats")
    .select("total_exp, current_streak, longest_streak")
    .eq("student_id", user.id)
    .maybeSingle();

  const now = new Date();

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <h1>My progress</h1>

      {stats && (
        <div className="card">
          <div className="field-row">
            <span className="field-row__label">Total EXP</span>
            <span className="field-row__value">{formatPoints(stats.total_exp)}</span>
          </div>
          <div className="field-row">
            <span className="field-row__label">Current streak</span>
            <span className="field-row__value">🔥 {stats.current_streak} day{stats.current_streak === 1 ? "" : "s"}</span>
          </div>
          <div className="field-row">
            <span className="field-row__label">Longest streak</span>
            <span className="field-row__value">{stats.longest_streak} day{stats.longest_streak === 1 ? "" : "s"}</span>
          </div>
        </div>
      )}

      {list.length === 0 && (
        <div className="card">
          <p style={{ marginTop: 0 }}>You haven&apos;t enrolled in any courses yet.</p>
          <a className="btn btn-sm" href="/courses">Browse courses</a>
        </div>
      )}

      {list.map((enrollment) => {
        const course = enrollment.course;
        const courseTopics = (topics || []).filter((t) => t.course_id === course.id);
        const topicSet = new Set(courseTopics.map((t) => t.id));
        const summary = summarizeCourse(courseTopics, (attempts || []).filter((a) => topicSet.has(a.topic_id)));
        const access = accessStatus(enrollment, now);

        const courseQuizzes = (quizzes || []).filter((q) => q.course_id === course.id);
        const quizSet = new Set(courseQuizzes.map((q) => q.id));
        const taken = (quizAttempts || []).filter((a) => quizSet.has(a.quiz_id));

        return (
          <div key={enrollment.id} className="card">
            <div className="action-row" style={{ justifyContent: "space-between" }}>
              <strong>{course.code} — {course.title}</strong>
              <span className={`badge ${access.className}`}>{access.label}</span>
            </div>

            {access.until && (
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-600)" }}>Until {formatDate(access.until)}</p>
            )}

            <div className="reader__progress-bar" style={{ margin: "14px 0 6px" }}>
              <span style={{ width: `${summary.percent}%` }} />
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--ink-600)" }}>
              {summary.testCount > 0
                ? `${summary.passedCount} of ${summary.testCount} topic tests passed (${summary.percent}%)`
                : "No topic tests in this course yet"}
            </p>

            <div className="field-row">
              <span className="field-row__label">Average best score</span>
              <span className="field-row__value">{summary.avgBest === null ? "—" : `${summary.avgBest}%`}</span>
            </div>
            <div className="field-row">
              <span className="field-row__label">Test attempts</span>
              <span className="field-row__value">{summary.totalAttempts}</span>
            </div>
            {courseQuizzes.length > 0 && (
              <div className="field-row">
                <span className="field-row__label">Quizzes taken</span>
                <span className="field-row__value">{taken.length} of {courseQuizzes.length}</span>
              </div>
            )}
            <div className="field-row">
              <span className="field-row__label">Last activity</span>
              <span className="field-row__value">{summary.lastActivity ? formatDate(summary.lastActivity) : "—"}</span>
            </div>

            <div className="action-row" style={{ marginTop: 12 }}>
              <a className="btn btn-sm" href={`/progress/${course.id}`}>Full report</a>
              <a className="btn btn-outline btn-sm" href={`/courses/${course.id}`}>Continue learning</a>
            </div>
          </div>
        );
      })}
    </main>
  );
}
