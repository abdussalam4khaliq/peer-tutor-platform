import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MAX_TUTOR_COURSES } from "@/lib/config";
import AppHeader from "@/components/app-header";

export default async function TutorCoursesPage() {
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
  if (profile.role !== "tutor") redirect("/dashboard");

  const { data: courses } = await supabase
    .from("courses")
    .select("id, code, title")
    .eq("tutor_id", user.id);

  const myCourses = courses || [];
  const atCap = myCourses.length >= MAX_TUTOR_COURSES;

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <h1>My courses</h1>

      {myCourses.length === 0 && <p>You don&apos;t have any adopted courses yet.</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {myCourses.map((c) => (
          <li key={c.id} className="card">
            <strong>{c.code} — {c.title}</strong>
            <div style={{ marginTop: 6 }}>
              <a href={`/tutor/courses/${c.id}`}>Manage content →</a>
            </div>
          </li>
        ))}
      </ul>

      <p style={{ color: "var(--ink-600)", fontSize: 14 }}>{myCourses.length} / {MAX_TUTOR_COURSES} courses</p>

      {atCap ? (
        <p><span className="badge badge-amber">Teaching the maximum of {MAX_TUTOR_COURSES} courses</span></p>
      ) : (
        <p><a href="/apply-tutor">Apply to teach another course →</a></p>
      )}
    </main>
  );
}