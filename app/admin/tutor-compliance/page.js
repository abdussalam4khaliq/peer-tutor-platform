import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";

export default async function TutorCompliancePage() {
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

  const { data: compliance } = await supabase
    .from("posting_compliance_log")
    .select(`
      id, week_start, week_end, target_count, actual_count, met_quota,
      tutor:profiles!posting_compliance_log_tutor_id_fkey(full_name, email),
      course:courses(code, title)
    `)
    .order("week_start", { ascending: false })
    .limit(100);

  const { data: missedDays } = await supabase
    .from("missed_posting_days_log")
    .select(`
      id, missed_date,
      tutor:profiles!missed_posting_days_log_tutor_id_fkey(full_name),
      course:courses(code, title)
    `)
    .order("missed_date", { ascending: false })
    .limit(30);

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />
      <p><a href="/admin">← Back to admin panel</a></p>
      <h1>Tutor posting compliance</h1>
      <p className="lede-sm">
        Weekly quota checks run automatically. Missing a single scheduled day is informational — missing the
        weekly quota entirely is the signal worth acting on.
      </p>

      <h2>Weekly quota history</h2>
      {(!compliance || compliance.length === 0) && <p>No completed weeks tracked yet.</p>}
      {(compliance || []).map((c) => (
        <div key={c.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span>
            <strong>{c.tutor?.full_name}</strong> ({c.tutor?.email}) — {c.course?.code} {c.course?.title}
            <br />
            <span style={{ fontSize: 13, color: "var(--ink-600)" }}>
              Week of {new Date(c.week_start).toLocaleDateString()} – {new Date(c.week_end).toLocaleDateString()}
            </span>
          </span>
          <span className={`badge ${c.met_quota ? "badge-green" : "badge-amber"}`}>
            {c.actual_count} / {c.target_count} {c.met_quota ? "✓ met" : "missed"}
          </span>
        </div>
      ))}

      <h2>Recent missed scheduled days</h2>
      {(!missedDays || missedDays.length === 0) && <p>None recently.</p>}
      {(missedDays || []).map((m) => (
        <div key={m.id} className="card" style={{ fontSize: 14 }}>
          <strong>{m.tutor?.full_name}</strong> missed their scheduled day on {new Date(m.missed_date).toLocaleDateString()} for{" "}
          {m.course?.code} — {m.course?.title}
        </div>
      ))}
    </main>
  );
}