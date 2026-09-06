import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ReportForm from "./report-form";

export default async function ReportPage() {
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
    .from("reports")
    .select("id, reason, status, created_at, reported:profiles!reports_reported_user_id_fkey(full_name)")
    .eq("reporter_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <h1>Report an account</h1>
      <p className="lede-sm">
        If someone is breaking the rules or making you uncomfortable, report their account directly to admins.
        Include a screenshot if you have one — it helps a lot.
      </p>

      <ReportForm />

      <h2>Your past reports</h2>
      {(!myReports || myReports.length === 0) && <p>You haven&apos;t filed any reports.</p>}
      {(myReports || []).map((r) => (
        <div key={r.id} className="card">
          <p style={{ margin: "0 0 4px" }}>
            <strong>{r.reported?.full_name || "Unknown account"}</strong>{" "}
            <span className={`badge ${r.status === "open" ? "badge-amber" : r.status === "resolved" ? "badge-green" : "badge-grey"}`}>
              {r.status}
            </span>
          </p>
          <p style={{ fontSize: 14, color: "var(--ink-600)", margin: 0 }}>{r.reason}</p>
        </div>
      ))}
    </main>
  );
}