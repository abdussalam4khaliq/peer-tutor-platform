import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ActionButton from "@/components/action-button";
import ReportScreenshot from "../reports/report-screenshot";

const CATEGORY_LABEL = { bug: "Bug", feature_request: "Feature request", other: "Other" };

export default async function AdminBugReportsPage() {
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
    .from("bug_reports")
    .select(`
      id, category, description, page_context, status, screenshot_path, admin_note, created_at,
      reporter:profiles!bug_reports_reporter_id_fkey(full_name, email)
    `)
    .order("created_at", { ascending: false });

  const open = (reports || []).filter((r) => r.status !== "resolved");
  const resolved = (reports || []).filter((r) => r.status === "resolved");

  async function setStatus(formData) {
    "use server";
    const reportId = formData.get("reportId");
    const status = formData.get("status");
    const note = formData.get("note");
    const supabase = await createClient();
    const {
      data: { user: admin },
    } = await supabase.auth.getUser();

    await supabase
      .from("bug_reports")
      .update({
        status,
        admin_note: note || null,
        resolved_by: status === "resolved" ? admin.id : null,
        resolved_at: status === "resolved" ? new Date().toISOString() : null,
      })
      .eq("id", reportId);

    revalidatePath("/admin/bug-reports");
  }

  function ReportCard({ r, actionable }) {
    return (
      <div className="card">
        <p style={{ margin: "0 0 4px" }}>
          <span className="badge badge-grey">{CATEGORY_LABEL[r.category]}</span>{" "}
          from {r.reporter?.full_name} ({r.reporter?.email})
        </p>
        {r.page_context && (
          <p style={{ margin: "0 0 4px", fontSize: 14, color: "var(--ink-600)" }}>Where: {r.page_context}</p>
        )}
        <p style={{ margin: "0 0 8px", color: "var(--ink-600)", fontSize: 14 }}>
          {new Date(r.created_at).toLocaleString()}
        </p>
        <p style={{ whiteSpace: "pre-wrap" }}>{r.description}</p>

        {r.screenshot_path && <ReportScreenshot path={r.screenshot_path} />}

        {!actionable && r.admin_note && (
          <p style={{ fontSize: 14, color: "var(--ink-600)", marginTop: 8 }}>Admin note: {r.admin_note}</p>
        )}

        {actionable && (
          <form action={setStatus} className="action-row" style={{ marginTop: 10 }}>
            <input type="hidden" name="reportId" value={r.id} />
            <input name="note" placeholder="Optional note" style={{ flex: 1, minWidth: 120 }} />
            {r.status === "open" && (
              <button type="submit" name="status" value="in_progress" className="btn btn-sm btn-outline">
                Mark in progress
              </button>
            )}
            <ActionButton className="btn btn-sm">Mark resolved</ActionButton>
            <input type="hidden" name="status" value="resolved" />
          </form>
        )}
      </div>
    );
  }

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />
      <p><a href="/admin">← Back to admin panel</a></p>
      <h1>Bug reports</h1>

      <h2>Open ({open.length})</h2>
      {open.length === 0 && <p>Nothing open.</p>}
      {open.map((r) => <ReportCard key={r.id} r={r} actionable />)}

      <h2>Resolved</h2>
      {resolved.length === 0 && <p>No resolved reports yet.</p>}
      {resolved.map((r) => <ReportCard key={r.id} r={r} actionable={false} />)}
    </main>
  );
}