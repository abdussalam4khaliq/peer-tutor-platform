import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import BugReportForm from "./bug-report-form";

const CATEGORY_LABEL = { bug: "Bug", feature_request: "Feature request", other: "Other" };
const STATUS_BADGE = { open: "badge-amber", in_progress: "badge-grey", resolved: "badge-green" };

export default async function ReportBugPage() {
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

  const { data: myReports } = await supabase
    .from("bug_reports")
    .select("id, category, description, status, created_at")
    .eq("reporter_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <h1>Report a bug or issue</h1>
      <p className="lede-sm">
        Found something broken, confusing, or have an idea for the platform? Let us know here.
      </p>

      <BugReportForm />

      <h2>Your past reports</h2>
      {(!myReports || myReports.length === 0) && <p>You haven&apos;t reported anything yet.</p>}
      {(myReports || []).map((r) => (
        <div key={r.id} className="card">
          <p style={{ margin: "0 0 4px" }}>
            <span className="badge badge-grey">{CATEGORY_LABEL[r.category]}</span>{" "}
            <span className={`badge ${STATUS_BADGE[r.status]}`} style={{ textTransform: "capitalize" }}>{r.status.replace("_", " ")}</span>
          </p>
          <p style={{ fontSize: 14, color: "var(--ink-600)", margin: 0 }}>{r.description}</p>
        </div>
      ))}
    </main>
  );
}