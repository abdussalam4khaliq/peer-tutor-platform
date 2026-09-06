import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ActionButton from "@/components/action-button";
import ReportScreenshot from "./report-screenshot";
import AccountStatusLookup from "./account-status-lookup";

export default async function AdminReportsPage() {
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

  const { data: reports } = await supabase
    .from("reports")
    .select(`
      id, reason, status, screenshot_path, admin_note, created_at,
      reporter:profiles!reports_reporter_id_fkey(full_name, email),
      reported:profiles!reports_reported_user_id_fkey(id, full_name, email, role, status)
    `)
    .order("created_at", { ascending: false });

  const open = (reports || []).filter((r) => r.status === "open");
  const handled = (reports || []).filter((r) => r.status !== "open");

  async function resolveReport(formData) {
    "use server";
    const reportId = formData.get("reportId");
    const note = formData.get("note");
    const supabase = await createClient();
    const {
      data: { user: admin },
    } = await supabase.auth.getUser();

    await supabase
      .from("reports")
      .update({ status: "resolved", admin_note: note || null, resolved_by: admin.id, resolved_at: new Date().toISOString() })
      .eq("id", reportId);

    revalidatePath("/admin/reports");
  }

  async function dismissReport(formData) {
    "use server";
    const reportId = formData.get("reportId");
    const note = formData.get("note");
    const supabase = await createClient();
    const {
      data: { user: admin },
    } = await supabase.auth.getUser();

    await supabase
      .from("reports")
      .update({ status: "dismissed", admin_note: note || null, resolved_by: admin.id, resolved_at: new Date().toISOString() })
      .eq("id", reportId);

    revalidatePath("/admin/reports");
  }

  async function setAccountStatus(formData) {
    "use server";
    const targetId = formData.get("targetId");
    const status = formData.get("status");
    const reason = formData.get("reason");
    const supabase = await createClient();
    const {
      data: { user: admin },
    } = await supabase.auth.getUser();

    await supabase
      .from("profiles")
      .update({ status, status_reason: reason || null, status_set_by: admin.id, status_set_at: new Date().toISOString() })
      .eq("id", targetId);

    revalidatePath("/admin/reports");
  }

  function ReportCard({ r, actionable }) {
    return (
      <div className="card">
        <p style={{ margin: "0 0 4px" }}>
          <strong>{r.reported?.full_name}</strong> ({r.reported?.email}, {r.reported?.role}){" "}
          <span className="badge badge-grey" style={{ textTransform: "capitalize" }}>{r.reported?.status}</span>{" "}
          reported by {r.reporter?.full_name} ({r.reporter?.email})
        </p>
        <p style={{ margin: "0 0 8px", color: "var(--ink-600)", fontSize: 14 }}>
          {new Date(r.created_at).toLocaleString()}
        </p>
        <p style={{ whiteSpace: "pre-wrap" }}>{r.reason}</p>

        {r.screenshot_path && <ReportScreenshot path={r.screenshot_path} />}

        {!actionable && r.admin_note && (
          <p style={{ fontSize: 14, color: "var(--ink-600)", marginTop: 8 }}>Admin note: {r.admin_note}</p>
        )}

        {actionable && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <form action={resolveReport} className="action-row">
              <input type="hidden" name="reportId" value={r.id} />
              <input name="note" placeholder="Optional note" style={{ flex: 1, minWidth: 120 }} />
              <ActionButton pendingLabel="Resolving...">Mark resolved</ActionButton>
            </form>
            <form action={dismissReport} className="action-row">
              <input type="hidden" name="reportId" value={r.id} />
              <input name="note" placeholder="Optional note" style={{ flex: 1, minWidth: 120 }} />
              <ActionButton pendingLabel="Dismissing..." className="btn btn-sm btn-outline">Dismiss</ActionButton>
            </form>
            <form action={setAccountStatus} className="action-row">
              <input type="hidden" name="targetId" value={r.reported?.id} />
              <input type="hidden" name="status" value="suspended" />
              <input name="reason" placeholder="Reason (shown to the user)" style={{ flex: 1, minWidth: 120 }} />
              <ActionButton pendingLabel="Suspending...">Suspend account</ActionButton>
            </form>
            <form action={setAccountStatus} className="action-row">
              <input type="hidden" name="targetId" value={r.reported?.id} />
              <input type="hidden" name="status" value="banned" />
              <input name="reason" placeholder="Reason (shown to the user)" style={{ flex: 1, minWidth: 120 }} />
              <ActionButton pendingLabel="Banning..." className="btn btn-sm btn-danger">Ban account</ActionButton>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />
      <p><a href="/admin">← Back to admin panel</a></p>
      <h1>Reports</h1>

      <h2>Open ({open.length})</h2>
      {open.length === 0 && <p>Nothing open.</p>}
      {open.map((r) => <ReportCard key={r.id} r={r} actionable />)}

      <h2>Handled</h2>
      {handled.length === 0 && <p>No handled reports yet.</p>}
      {handled.map((r) => <ReportCard key={r.id} r={r} actionable={false} />)}

      <h2>Manage account status directly</h2>
      <AccountStatusLookup setAccountStatus={setAccountStatus} />
    </main>
  );
}