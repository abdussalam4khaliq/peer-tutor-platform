import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import TestRunner from "./test-runner";

export default async function TestPage({ params }) {
  const { id, topicId } = params;
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

  const { data: topic } = await supabase
    .from("topics")
    .select("id, title, questions_per_test")
    .eq("id", topicId)
    .eq("course_id", id)
    .maybeSingle();
  if (!topic) notFound();

  return (
    <main className="app-container app-container--narrow">
      <AppHeader profile={profile} />
      <p><a href={`/courses/${id}`}>← Back to course</a></p>
      <h1>Test: {topic.title}</h1>
      <TestRunner topicId={topic.id} courseId={id} />
    </main>
  );
}