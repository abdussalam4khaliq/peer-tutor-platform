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

  const { data: plan } = await supabase
    .from("course_lesson_plans")
    .select("*")
    .eq("course_id", courseId)
    .maybeSingle();

  const { data: recentCompliance } = plan
    ? await supabase
        .from("posting_compliance_log")
        .select("week_start, week_end, target_count, actual_count, met_quota")
        .eq("course_id", courseId)
        .order("week_start", { ascending: false })
        .limit(4)
    : { data: [] };

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href="/tutor/courses">← Back to my courses</a></p>
      <h1>{course.code} — {course.title}</h1>

      {plan && (
        <div className="card">
          <p style={{ margin: "0 0 6px" }}>
            <strong>Your posting schedule:</strong>{" "}
            {plan.posting_days.map((d) => d[0].toUpperCase() + d.slice(1)).join(", ")} ({plan.weekly_quota}/week)
          </p>
          {(recentCompliance || []).length > 0 && (
            <div className="action-row">
              {recentCompliance.map((c, i) => (
                <span key={i} className={`badge ${c.met_quota ? "badge-green" : "badge-amber"}`}>
                  {new Date(c.week_start).toLocaleDateString()}: {c.actual_count}/{c.target_count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <TopicManager courseId={course.id} topics={topics || []} />
    </main>
  );
}