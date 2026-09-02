import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ReplyForm from "./reply-form";
import DeleteButton from "./delete-button";

export default async function QuestionPage({ params }) {
  const { id, questionId } = params;
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

  const { data: question } = await supabase
    .from("forum_questions")
    .select("id, title, body, author_id, created_at, author:profiles(full_name)")
    .eq("id", questionId)
    .eq("course_id", id)
    .maybeSingle();
  if (!question) notFound();

  const { data: replies } = await supabase
    .from("forum_replies")
    .select("id, body, author_id, created_at, author:profiles(full_name)")
    .eq("question_id", questionId)
    .order("created_at", { ascending: true });

  const canModerate = course.tutor_id === user.id || profile.role === "admin" || profile.role === "super_admin";

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href={`/courses/${id}/forum`}>← Back to forum</a></p>

      <div className="card">
        <h1 style={{ marginTop: 0 }}>{question.title}</h1>
        <div className="action-row" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 14, color: "var(--ink-600)" }}>
            Asked by {question.author?.full_name || "a student"}
            {question.author_id === course.tutor_id && <span className="badge badge-green" style={{ marginLeft: 6 }}>Tutor</span>}
          </span>
        </div>
        <p style={{ whiteSpace: "pre-wrap" }}>{question.body}</p>
        {(question.author_id === user.id || canModerate) && (
          <DeleteButton table="forum_questions" id={question.id} redirectTo={`/courses/${id}/forum`} />
        )}
      </div>

      <h2>Replies</h2>
      {(!replies || replies.length === 0) && <p>No replies yet.</p>}

      {(replies || []).map((r) => (
        <div key={r.id} className="card">
          <div className="action-row" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 14, color: "var(--ink-600)" }}>
              {r.author?.full_name || "a student"}
              {r.author_id === course.tutor_id && <span className="badge badge-green" style={{ marginLeft: 6 }}>Tutor</span>}
            </span>
          </div>
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{r.body}</p>
          {(r.author_id === user.id || canModerate) && (
            <DeleteButton table="forum_replies" id={r.id} />
          )}
        </div>
      ))}

      <h2>Add a reply</h2>
      <ReplyForm courseId={id} questionId={questionId} />
    </main>
  );
}