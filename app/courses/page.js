import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";

function AccessBadge({ label }) {
  if (label === "Trial ended — preview only") return <span className="badge badge-amber">{label}</span>;
  if (label === "Not enrolled — free preview only") return <span className="badge badge-grey">{label}</span>;
  return <span className="badge badge-green">{label}</span>;
}

export default async function CoursesPage() {
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

  if (!profile.department_id) {
    return (
      <main className="app-container">
        <AppHeader profile={profile} />
        <p>Your account doesn&apos;t have a department set. Please contact an admin.</p>
      </main>
    );
  }

  const { data: courses } = await supabase
    .from("courses")
    .select("id, code, title, status, tutor:profiles(full_name)")
    .eq("department_id", profile.department_id);

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("course_id, trial_ends_at, paid_until")
    .eq("student_id", user.id);

  const enrollmentMap = new Map((enrollments || []).map((e) => [e.course_id, e]));

  function accessLabel(courseId) {
    const e = enrollmentMap.get(courseId);
    if (!e) return "Not enrolled — free preview only";
    const now = new Date();
    if (now < new Date(e.trial_ends_at)) return "Free trial active";
    if (e.paid_until && now < new Date(e.paid_until)) return "Full access (paid)";
    return "Trial ended — preview only";
  }

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <h1>Courses in your department</h1>

      {(!courses || courses.length === 0) && <p>No courses added for your department yet.</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {(courses || []).map((c) => (
          <li key={c.id} className="card">
            <strong>{c.code} — {c.title}</strong>
            <div style={{ fontSize: 14, color: "var(--ink-600)", margin: "4px 0 10px" }}>
              {c.status === "active" ? `Taught by ${c.tutor?.full_name || "a Tutor"}` : "Not yet adopted by a Tutor"}
            </div>
            {c.status === "active" && (
              <div className="action-row" style={{ alignItems: "center" }}>
                <AccessBadge label={accessLabel(c.id)} />
                <a href={`/courses/${c.id}`}>Open course →</a>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}