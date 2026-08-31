import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ContentEditor from "./content-editor";

export default async function ManageCourseContentPage({ params }) {
  const { courseId } = params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: course } = await supabase
    .from("courses")
    .select("id, code, title, tutor_id")
    .eq("id", courseId)
    .maybeSingle();

  if (!course) notFound();
  if (course.tutor_id !== user.id) redirect("/tutor/courses");

  const { data: sections } = await supabase
    .from("course_content")
    .select("*")
    .eq("course_id", courseId)
    .order("order_index", { ascending: true });

  return (
    <main style={{ maxWidth: 700, margin: "3rem auto", fontFamily: "sans-serif" }}>
      <h1>{course.code} — {course.title}</h1>
      <p><a href="/tutor/courses">← Back to my courses</a></p>
      <ContentEditor courseId={courseId} initialSections={sections || []} />
    </main>
  );
}