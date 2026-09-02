import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EnrollButton from "./enroll-button";
import { sanitizeHtml } from "@/lib/sanitize";
import AppHeader from "@/components/app-header";

export default async function CourseDetailPage({ params }) {
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
    .select("id, code, title, status, department_id, tutor:profiles(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!course) notFound();

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("*")
    .eq("student_id", user.id)
    .eq("course_id", id)
    .maybeSingle();

  const { data: topics } = await supabase
    .from("topics")
    .select("*")
    .eq("course_id", id)
    .order("order_index", { ascending: true });

  const now = new Date();
  const onTrial = enrollment && now < new Date(enrollment.trial_ends_at);
  const isPaid = enrollment?.paid_until && now < new Date(enrollment.paid_until);
  const entitled = onTrial || isPaid;
  const sameDepartment = profile.department_id === course.department_id;

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href="/courses">← Back to courses</a></p>
      <h1>{course.code} — {course.title}</h1>
      <p style={{ color: "var(--ink-600)" }}>Taught by {course.tutor?.full_name || "a Tutor"}</p>

      {!enrollment && sameDepartment && <p><EnrollButton courseId={course.id} /></p>}

      {onTrial && (
        <p><span className="badge badge-green">Free trial until {new Date(enrollment.trial_ends_at).toLocaleDateString()}</span></p>
      )}
      {isPaid && (
        <p><span className="badge badge-green">Full access until {new Date(enrollment.paid_until).toLocaleDateString()}</span></p>
      )}
      {enrollment && !entitled && (
        <p>
          <span className="badge badge-amber">Trial ended</span>{" "}
          <a href="/payment-info">See how to unlock full access →</a>
        </p>
      )}

      {(topics || []).length === 0 && <p>No content added yet.</p>}

      {(topics || []).map((topic) => (
        <div key={topic.id} className="card">
          <strong>{topic.title}</strong>
          <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(topic.content) }} />
        </div>
      ))}

      {!entitled && (topics || []).length > 0 && (
        <p style={{ color: "var(--ink-600)" }}>
          This is a free preview. Start your free trial above to unlock the rest of this course.
        </p>
      )}
    </main>
  );
}