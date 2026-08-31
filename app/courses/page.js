import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const { data: courses } = await supabase.from("courses").select(`
    id, code, title, status,
    tutor:profiles(full_name),
    department:departments(
      name,
      faculty:faculties(
        name,
        school:schools(name)
      )
    )
  `);

  const mine = (courses || []).filter(
    (c) => c.department?.faculty?.school?.name === profile.school
  );

  return (
    <main style={{ maxWidth: 700, margin: "3rem auto", fontFamily: "sans-serif" }}>
      <h1>Courses at {profile.school}</h1>

      {mine.length === 0 && <p>No courses added for your school yet.</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {mine.map((c) => (
          <li
            key={c.id}
            style={{
              border: "1px solid #ddd",
              borderRadius: 8,
              padding: "1rem",
              marginBottom: "0.75rem",
            }}
          >
            <strong>
              {c.code} — {c.title}
            </strong>
            <div style={{ fontSize: 14, color: "#666" }}>
              {c.department?.faculty?.name} · {c.department?.name}
            </div>
            <div style={{ marginTop: 6 }}>
              {c.status === "active" ? (
                <span>✅ Taught by {c.tutor?.full_name || "a Tutor"}</span>
              ) : (
                <span style={{ color: "#b8860b" }}>⏳ Not yet adopted by a Tutor</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}