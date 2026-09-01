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

  
  const { data: credits } = await supabase
    .from("referral_credits")
    .select("amount")
    .eq("referrer_id", user.id);
  const totalEarned = (credits || []).reduce((sum, c) => sum + Number(c.amount), 0);

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

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem", margin: "1rem 0" }}>
        <p style={{ margin: 0 }}>
          <strong>Your referral code:</strong> {profile.referral_code}
        </p>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: "#666" }}>
          Share this link: {typeof window !== "undefined" ? window.location.origin : ""}/signup?ref={profile.referral_code}
        </p>
        <p style={{ margin: "6px 0 0" }}>
          <strong>Total earned:</strong> ₦{totalEarned}
        </p>
      </div>

      <SignOutButton />
    </main>
  );
}