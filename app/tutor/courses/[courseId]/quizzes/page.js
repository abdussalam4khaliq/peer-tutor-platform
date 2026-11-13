import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import { formatDateTime } from "@/lib/format";

export default async function TutorQuizzesPage({ params }) {
  const { courseId } = params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/complete-profile");

  const { data: course } = await supabase
    .from("courses")
    .select("id, code, title, tutor_id")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) notFound();
  if (course.tutor_id !== user.id) redirect("/tutor/courses");

  const { data: quizzes } = await supabase
    .from("quizzes")
    .select("id, title, opens_at, closes_at, duration_minutes, published")
    .eq("course_id", courseId)
    .order("closes_at", { ascending: false });
  const list = quizzes || [];

  const { data: attempts } = list.length
    ? await supabase
        .from("quiz_attempts")
        .select("quiz_id, status, pending_manual")
        .in("quiz_id", list.map((q) => q.id))
    : { data: [] };

  const stats = new Map();
  for (const a of attempts || []) {
    const s = stats.get(a.quiz_id) || { total: 0, toMark: 0 };
    s.total += 1;
    if (a.pending_manual > 0) s.toMark += 1;
    stats.set(a.quiz_id, s);
  }

  const now = new Date();

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href={`/tutor/courses/${courseId}`}>← Back to {course.code}</a></p>
      <h1>Quizzes</h1>
      <p className="lede-sm">Timed quizzes for {course.code} — {course.title}.</p>

      <p><a className="btn" href={`/tutor/courses/${courseId}/quizzes/new`}>+ New quiz</a></p>

      {list.length === 0 && <p>You haven&apos;t created any quizzes yet.</p>}

      {list.map((quiz) => {
        const s = stats.get(quiz.id) || { total: 0, toMark: 0 };
        let badge = { label: "Draft", className: "badge-grey" };
        if (quiz.published) {
          if (now < new Date(quiz.opens_at)) badge = { label: "Scheduled", className: "badge-amber" };
          else if (now >= new Date(quiz.closes_at)) badge = { label: "Closed", className: "badge-grey" };
          else badge = { label: "Open", className: "badge-green" };
        }
        return (
          <div key={quiz.id} className="card">
            <div className="action-row" style={{ justifyContent: "space-between" }}>
              <strong>{quiz.title}</strong>
              <span className={`badge ${badge.className}`}>{badge.label}</span>
            </div>
            <p style={{ color: "var(--ink-600)", fontSize: 14, margin: "6px 0 10px" }}>
              {quiz.duration_minutes} min · {formatDateTime(quiz.opens_at)} → {formatDateTime(quiz.closes_at)}
            </p>
            <p style={{ margin: "0 0 10px", fontSize: 14 }}>
              {s.total} submission{s.total === 1 ? "" : "s"}
              {s.toMark > 0 && <span className="badge badge-amber" style={{ marginLeft: 8 }}>{s.toMark} to mark</span>}
            </p>
            <div className="action-row">
              <a className="btn btn-sm" href={`/tutor/courses/${courseId}/quizzes/${quiz.id}`}>Submissions &amp; marks</a>
              <a className="btn btn-outline btn-sm" href={`/tutor/courses/${courseId}/quizzes/${quiz.id}/edit`}>Edit</a>
            </div>
          </div>
        );
      })}
    </main>
  );
}
