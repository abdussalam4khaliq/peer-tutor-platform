import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import CourseRequestForm from "./course-request-form";

const STATUS_BADGE = { pending: "badge-amber", fulfilled: "badge-green", rejected: "badge-grey" };

export default async function RequestCoursePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, department:departments(name)")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/complete-profile");

  if (!profile.department_id) {
    return (
      <main className="app-container app-container--narrow">
        <AppHeader profile={profile} />
        <p>Your account needs a department set before you can request a course.</p>
      </main>
    );
  }

  const { data: myRequests } = await supabase
    .from("course_requests")
    .select("id, code, title, status, admin_note, created_at")
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <h1>Request a course</h1>
      <p className="lede-sm">
        Don&apos;t see a course you need under <strong>{profile.department?.name}</strong>? Request it and an
        admin will add it so a Tutor can adopt it.
      </p>

      <CourseRequestForm departmentId={profile.department_id} />

      <h2>Your requests</h2>
      {(!myRequests || myRequests.length === 0) && <p>You haven&apos;t requested any courses yet.</p>}
      {(myRequests || []).map((r) => (
        <div key={r.id} className="card">
          <p style={{ margin: "0 0 4px" }}>
            <strong>{r.code} — {r.title}</strong>{" "}
            <span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span>
          </p>
          {r.status === "rejected" && r.admin_note && (
            <p style={{ fontSize: 14, color: "var(--ink-600)", margin: 0 }}>Reason: {r.admin_note}</p>
          )}
        </div>
      ))}
    </main>
  );
}