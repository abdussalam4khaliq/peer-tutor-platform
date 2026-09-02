import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import AskQuestionForm from "./ask-question-form";

export default async function ForumPage({ params }) {
  const { id } = params;
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

  const { data: course } = await supabase
    .from("courses")
    .select("id, code, title, tutor_id")
    .eq("id", id)
    .maybeSingle();
  if (!course) notFound();

  const isTutor = course.tutor_id === user.id;
  const isStaff = profile.role === "admin" || profile.role === "super_admin";

  let entitled = isTutor || isStaff;
  if (!entitled) {
    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("trial_ends_at, paid_until")
      .eq("student_id", user.id)
      .eq("course_id", id)
      .maybeSingle();

    if (enrollment) {
      const now = new Date();
      entitled = now < new Date(enrollment.trial_ends_at) || (enrollment.paid_until && now < new Date(enrollment.paid_until));
    }
  }

  if (!entitled) {
    return (
      <main className="app-container">
        <AppHeader profile={profile} />
        <p><a href={`/courses/${id}`}>← Back to course</a></p>
        <h1>Forum</h1>
        <p>You need an active trial or paid access to this course to use its forum.</p>
      </main>
    );
  }

  const { data: questions } = await supabase
    .from("forum_questions")
    .select("id, title, created_at, author:profiles(full_name), forum_replies(count)")
    .eq("course_id", id)
    .order("created_at", { ascending: false });

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href={`/courses/${id}`}>← Back to course</a></p>
      <h1>{course.code} forum</h1>

      <AskQuestionForm courseId={id} />

      <h2>Questions</h2>
      {(!questions || questions.length === 0) && <p>No questions yet — be the first to ask.</p>}

      {(questions || []).map((q) => (
        <a key={q.id} href={`/courses/${id}/forum/${q.id}`} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card">
            <strong>{q.title}</strong>
            <p style={{ fontSize: 14, color: "var(--ink-600)", margin: "4px 0 0" }}>
              Asked by {q.author?.full_name || "a student"} · {q.forum_replies?.[0]?.count || 0} repl
              {(q.forum_replies?.[0]?.count || 0) === 1 ? "y" : "ies"}
            </p>
          </div>
        </a>
      ))}
    </main>
  );
}