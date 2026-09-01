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