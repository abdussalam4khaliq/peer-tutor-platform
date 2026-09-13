import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ActionButton from "@/components/action-button";

export default async function AdminStructureRequestsPage() {
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
    .from("structure_requests")
    .select("*, requester:profiles!structure_requests_requester_id_fkey(full_name, email)")
    .order("created_at", { ascending: false });

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, faculty:faculties(name, school:schools(name))")
    .order("name");

  const departmentOptions = (departments || []).map((d) => ({
    id: d.id,
    label: `${d.faculty?.school?.name || "?"} › ${d.faculty?.name || "?"} › ${d.name}`,
  }));

  const pending = (requests || []).filter((r) => r.status === "pending");
  const handled = (requests || []).filter((r) => r.status !== "pending");

  async function fulfill(formData) {
    "use server";
    const requestId = formData.get("requestId");
    const departmentId = formData.get("departmentId");
    if (!departmentId) return;
    const supabase = await createClient();
    await supabase.rpc("fulfill_structure_request", { p_request_id: requestId, p_department_id: departmentId });
    revalidatePath("/admin/structure-requests");
  }

  async function reject(formData) {
    "use server";
    const requestId = formData.get("requestId");
    const note = formData.get("note");
    const supabase = await createClient();
    await supabase.rpc("reject_structure_request", { p_request_id: requestId, p_note: note });
    revalidatePath("/admin/structure-requests");
  }

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />
      <p><a href="/admin">← Back to admin panel</a></p>
      <h1>School/department requests</h1>
      <p className="lede-sm">
        First, add the missing school/faculty/department under{" "}
        <a href="/admin/content">Manage schools & courses</a> if it doesn&apos;t exist yet, then come back here to link it.
      </p>

      <h2>Pending ({pending.length})</h2>
      {pending.length === 0 && <p>Nothing pending.</p>}
      {pending.map((r) => (
        <div key={r.id} className="card">
          <p style={{ margin: "0 0 4px" }}>
            <strong>{r.requester?.full_name}</strong> ({r.requester?.email})
          </p>
          <p style={{ margin: "0 0 10px", fontSize: 14, color: "var(--ink-600)" }}>
            Requested: {r.requested_school} › {r.requested_faculty} › {r.requested_department}
          </p>

          <form action={fulfill} className="action-row" style={{ marginBottom: 8 }}>
            <input type="hidden" name="requestId" value={r.id} />
            <select name="departmentId" style={{ flex: 1, minWidth: 200 }}>
              <option value="">Select the matching department...</option>
              {departmentOptions.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
            <ActionButton pendingLabel="Linking...">Fulfill</ActionButton>
          </form>

          <form action={reject} className="action-row">
            <input type="hidden" name="requestId" value={r.id} />
            <input name="note" placeholder="Reason (optional)" style={{ flex: 1, minWidth: 160 }} />
            <ActionButton pendingLabel="Rejecting..." className="btn btn-sm btn-outline">Reject</ActionButton>
          </form>
        </div>
      ))}

      <h2>Handled</h2>
      {handled.length === 0 && <p>No handled requests yet.</p>}
      {handled.map((r) => (
        <div key={r.id} className="card">
          <p style={{ margin: 0 }}>
            <strong>{r.requester?.full_name}</strong> — {r.requested_school} › {r.requested_faculty} › {r.requested_department}{" "}
            <span className={`badge ${r.status === "fulfilled" ? "badge-green" : "badge-grey"}`}>{r.status}</span>
          </p>
        </div>
      ))}
    </main>
  );
}