import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ActionButton from "@/components/action-button";

export default async function AdminCourseRequestsPage() {
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
  if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
    redirect("/dashboard");
  }

  const { data: requests } = await supabase
    .from("course_requests")
    .select(`
      id, code, title, note, status, created_at,
      requester:profiles!course_requests_requester_id_fkey(full_name, email),
      department:departments(name, faculty:faculties(name, school:schools(name)))
    `)
    .order("created_at", { ascending: false });

  const pending = (requests || []).filter((r) => r.status === "pending");
  const handled = (requests || []).filter((r) => r.status !== "pending");

  async function fulfill(formData) {
    "use server";
    const requestId = formData.get("requestId");
    const supabase = await createClient();
    await supabase.rpc("fulfill_course_request", { p_request_id: requestId });
    revalidatePath("/admin/course-requests");
  }

  async function reject(formData) {
    "use server";
    const requestId = formData.get("requestId");
    const note = formData.get("note");
    const supabase = await createClient();
    await supabase.rpc("reject_course_request", { p_request_id: requestId, p_note: note });
    revalidatePath("/admin/course-requests");
  }

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href="/admin">← Back to admin panel</a></p>
      <h1>Course requests</h1>

      <h2>Pending ({pending.length})</h2>
      {pending.length === 0 && <p>Nothing pending.</p>}
      {pending.map((r) => (
        <div key={r.id} className="card">
          <p style={{ margin: "0 0 4px" }}>
            <strong>{r.code} — {r.title}</strong>
          </p>
          <p style={{ margin: "0 0 4px", fontSize: 14, color: "var(--ink-600)" }}>
            {r.department?.faculty?.school?.name} › {r.department?.faculty?.name} › {r.department?.name}
          </p>
          <p style={{ margin: "0 0 8px", fontSize: 14, color: "var(--ink-600)" }}>
            Requested by {r.requester?.full_name} ({r.requester?.email})
          </p>
          {r.note && <p style={{ margin: "0 0 10px", fontSize: 14 }}>Note: {r.note}</p>}

          <div className="action-row">
            <form action={fulfill}>
              <input type="hidden" name="requestId" value={r.id} />
              <ActionButton pendingLabel="Adding...">Add course</ActionButton>
            </form>
            <form action={reject} className="action-row">
              <input type="hidden" name="requestId" value={r.id} />
              <input name="note" placeholder="Reason (optional)" style={{ minWidth: 160 }} />
              <ActionButton pendingLabel="Rejecting..." className="btn btn-sm btn-outline">Reject</ActionButton>
            </form>
          </div>
        </div>
      ))}

      <h2>Handled</h2>
      {handled.length === 0 && <p>No handled requests yet.</p>}
      {handled.map((r) => (
        <div key={r.id} className="card">
          <p style={{ margin: 0 }}>
            <strong>{r.code} — {r.title}</strong>{" "}
            <span className={`badge ${r.status === "fulfilled" ? "badge-green" : "badge-grey"}`}>{r.status}</span>
          </p>
        </div>
      ))}
    </main>
  );
}