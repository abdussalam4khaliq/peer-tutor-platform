import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ApplyForm from "./apply-form";

export default async function ApplyTutorPage() {
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
  if (profile.tutor_status === "pending" || profile.tutor_status === "approved") {
    redirect("/dashboard");
  }

  const { data: pastApplications } = await supabase
    .from("tutor_applications")
    .select("status, reviewed_at")
    .eq("tutor_id", user.id)
    .order("created_at", { ascending: false });

  const attemptCount = pastApplications?.length || 0;
  const lastApplication = pastApplications?.[0];

  if (attemptCount >= 3) {
    return (
      <main style={{ maxWidth: 600, margin: "3rem auto", fontFamily: "sans-serif" }}>
        <h1>Application limit reached</h1>
        <p>
          You&apos;ve reached the maximum of 3 Tutor applications. Please contact an
          admin directly if you&apos;d like to be reconsidered.
        </p>
      </main>
    );
  }

  let cooldownUntil = null;
  if (lastApplication?.status === "rejected" && lastApplication.reviewed_at) {
    const reviewedAt = new Date(lastApplication.reviewed_at);
    const cooldownEnd = new Date(reviewedAt.getTime() + 24 * 60 * 60 * 1000);
    if (new Date() < cooldownEnd) {
      cooldownUntil = cooldownEnd;
    }
  }

  if (cooldownUntil) {
    return (
      <main style={{ maxWidth: 600, margin: "3rem auto", fontFamily: "sans-serif" }}>
        <h1>Please wait before reapplying</h1>
        <p>
          Your last application was rejected. You can submit a new one after{" "}
          {cooldownUntil.toLocaleString()}.
        </p>
      </main>
    );
  }

  const { data: courses } = await supabase
    .from("courses")
    .select("id, code, title, status")
    .eq("status", "unclaimed")
    .eq("department_id", profile.department_id);

  const available = courses || [];

  return (
    <main style={{ maxWidth: 600, margin: "3rem auto", fontFamily: "sans-serif" }}>
      <h1>Apply to become a Tutor</h1>
      <p>
        Pick an unclaimed course from your school, then write a sample of the
        kind of content you&apos;d teach it with. An admin will review it.
      </p>

      {profile.tutor_status === "rejected" && (
        <p style={{ color: "#b8860b" }}>
          Your previous application wasn&apos;t approved. You can apply again below.
        </p>
      )}

      {available.length === 0 ? (
        <p>No unclaimed courses available at your school right now.</p>
      ) : (
        <ApplyForm courses={available} tutorId={user.id} />
      )}
    </main>
  );
}