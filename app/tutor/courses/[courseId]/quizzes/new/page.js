import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import QuizBuilder from "../quiz-builder";

export default async function NewQuizPage({ params }) {
  const { courseId } = await params;
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

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href={`/tutor/courses/${courseId}/quizzes`}>← Back to quizzes</a></p>
      <h1>New quiz</h1>
      <p className="lede-sm">{course.code} — {course.title}</p>
      <QuizBuilder courseId={courseId} />
    </main>
  );
}
