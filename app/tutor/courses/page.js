import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  if (profile.role !== "tutor" || profile.tutor_status !== "approved") redirect("/dashboard");

  const { data: courses } = await supabase
    .from("courses")
    .select("id, code, title, status")
    .eq("tutor_id", user.id);

  return (
    <main style={{ maxWidth: 600, margin: "3rem auto", fontFamily: "sans-serif" }}>
      <h1>My courses</h1>
      <p><a href="/dashboard">← Back to dashboard</a></p>

      {(!courses || courses.length === 0) && <p>You don&apos;t have any adopted courses yet.</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {(courses || []).map((c) => (
          <li
            key={c.id}
            style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem", marginBottom: "0.75rem" }}
          >
            <strong>{c.code} — {c.title}</strong>
            <div style={{ marginTop: 6 }}>
              <a href={`/tutor/courses/${c.id}`}>Manage content →</a>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}