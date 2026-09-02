import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ApplyForm from "./apply-form";
import { MAX_TUTOR_COURSES } from "@/lib/config";
import AppHeader from "@/components/app-header";

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

  const { data: myCourses } = await supabase
    .from("courses")
    .select("id")
    .eq("tutor_id", user.id);

  if ((myCourses || []).length >= MAX_TUTOR_COURSES) {
    return (
      <main className="app-container app-container--narrow">
        <AppHeader profile={profile} />
        <h1>You&apos;re already at the course limit</h1>
        <p>You&apos;re teaching the maximum of {MAX_TUTOR_COURSES} courses. Drop one before adopting another.</p>
        <p><a href="/tutor/courses">← Back to my courses</a></p>
      </main>
    );
  }

  const { data: applications } = await supabase
    .from("tutor_applications")
    .select("status, reviewed_at, created_at")
    .eq("tutor_id", user.id)
    .order("created_at", { ascending: false });

  const all = applications || [];
  const pending = all.find((a) => a.status === "pending");
  const rejectedCount = all.filter((a) => a.status === "rejected").length;
  const mostRecent = all[0];

  if (pending) {
    return (
      <main className="app-container app-container--narrow">
        <AppHeader profile={profile} />
        <h1>Application under review</h1>
        <p>You already have a pending application. Check back soon.</p>
        <p><a href="/dashboard">← Back to dashboard</a></p>
      </main>
    );
  }

  if (rejectedCount >= 3) {
    return (
      <main className="app-container app-container--narrow">
        <AppHeader profile={profile} />
        <h1>Application limit reached</h1>
        <p>You&apos;ve had 3 applications rejected. Please contact an admin directly if you&apos;d like to be reconsidered.</p>
      </main>
    );
  }

  if (mostRecent?.status === "rejected" && mostRecent.reviewed_at) {
    const cooldownEnd = new Date(new Date(mostRecent.reviewed_at).getTime() + 24 * 60 * 60 * 1000);
    if (new Date() < cooldownEnd) {
      return (
        <main className="app-container app-container--narrow">
          <AppHeader profile={profile} />
          <h1>Please wait before reapplying</h1>
          <p>Your last application was rejected. You can submit a new one after {cooldownEnd.toLocaleString()}.</p>
        </main>
      );
    }
  }

  const { data: courses } = await supabase
    .from("courses")
    .select("id, code, title, status")
    .eq("status", "unclaimed")
    .eq("department_id", profile.department_id);

  const available = courses || [];

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <h1>Apply to teach a course</h1>
      <p className="lede-sm">
        Pick an unclaimed course from your department, then write a sample of the kind of content you&apos;d teach it with. An admin will review it.
      </p>

      {rejectedCount > 0 && <p><span className="badge badge-amber">Previous application not approved</span></p>}

      {available.length === 0 ? (
        <p>No unclaimed courses available in your department right now.</p>
      ) : (
        <ApplyForm courses={available} tutorId={user.id} />
      )}
    </main>
  );
}