import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

export default async function DashboardPage() {
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

  // Tutors need admin approval before seeing the full dashboard
  if (profile.role === "tutor" && profile.tutor_status !== "approved") {
    return (
      <main style={{ maxWidth: 500, margin: "4rem auto", fontFamily: "sans-serif" }}>
        <h1>Welcome, {profile.full_name}</h1>
        {profile.tutor_status === "pending" && (
          <p>Your Tutor application is under review. Check back soon.</p>
        )}
        {profile.tutor_status === "rejected" && (
          <>
            <p>Your Tutor application wasn&apos;t approved this time.</p>
            <a href="/apply-tutor">Apply again</a>
          </>
        )}
        {!profile.tutor_status && (
          <>
            <p>You haven&apos;t applied to teach a course yet.</p>
            <a href="/apply-tutor">Apply to become a Tutor</a>
          </>
        )}
        <div style={{ marginTop: 20 }}>
          <SignOutButton />
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 500, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <h1>Welcome, {profile.full_name || user.email}</h1>
      <p>
        Role: <strong>{profile.role}</strong>
      </p>
      <p>
        School: <strong>{profile.school}</strong>
      </p>

            {(profile.role === "admin" || profile.role === "super_admin") && (
              <p>
                <a href="/admin">Go to admin panel →</a>
              </p>
            )}

            {profile.role === "tutor" && (
              <p>
                <a href="/tutor/courses">Manage my courses →</a>
              </p>
            )}

      <SignOutButton />
    </main>
  );
}