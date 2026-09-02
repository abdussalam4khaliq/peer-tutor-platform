import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import QuestionBankManager from "./question-bank-manager";

export default async function ManageQuestionsPage({ params }) {
  const { courseId, topicId } = params;
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
    .eq("id", courseId)
    .maybeSingle();
  if (!course) notFound();
  if (course.tutor_id !== user.id) redirect("/tutor/courses");

  const { data: topic } = await supabase
    .from("topics")
    .select("id, title, questions_per_test")
    .eq("id", topicId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!topic) notFound();

  const { data: questions } = await supabase
    .from("question_bank")
    .select("*")
    .eq("topic_id", topicId)
    .order("created_at", { ascending: true });

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href={`/tutor/courses/${courseId}`}>← Back to {course.code}</a></p>
      <h1>Test questions: {topic.title}</h1>
      <QuestionBankManager topicId={topic.id} questionsPerTest={topic.questions_per_test} questions={questions || []} />
    </main>
  );
}