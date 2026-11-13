import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import QuizBuilder from "../../quiz-builder";

export default async function EditQuizPage({ params }) {
  const { courseId, quizId } = params;
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

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("*")
    .eq("id", quizId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!quiz) notFound();

  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("*")
    .eq("quiz_id", quizId)
    .order("position", { ascending: true });

  const { count } = await supabase
    .from("quiz_attempts")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", quizId);

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href={`/tutor/courses/${courseId}/quizzes`}>← Back to quizzes</a></p>
      <h1>Edit quiz</h1>
      <p className="lede-sm">{course.code} — {course.title}</p>
      <QuizBuilder courseId={courseId} quiz={quiz} initialQuestions={questions || []} locked={(count || 0) > 0} />
    </main>
  );
}
