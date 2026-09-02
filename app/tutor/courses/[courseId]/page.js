import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopicManager from "@/components/topic-manager";
import AppHeader from "@/components/app-header";

export default async function ManageCourseContentPage({ params }) {
  const { courseId } = params;
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

  const { data: topics } = await supabase
    .from("topics")
    .select("*")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href="/tutor/courses">← Back to my courses</a></p>
      <h1>{course.code} — {course.title}</h1>
      <TopicManager courseId={course.id} topics={topics || []} />
    </main>
  );
}