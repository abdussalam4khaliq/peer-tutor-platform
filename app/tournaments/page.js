import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";

const SCOPE_LABEL = { department: "Department", faculty: "Faculty", school: "School", universal: "Universal" };

export default async function TournamentsPage() {
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

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .order("starts_at", { ascending: false });

  const now = new Date();

  function status(t) {
    if (now < new Date(t.starts_at)) return { label: "Upcoming", cls: "badge-grey" };
    if (now > new Date(t.ends_at)) return { label: "Ended", cls: "badge-grey" };
    return { label: "Active", cls: "badge-green" };
  }

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <h1>Tournaments</h1>

      {(!tournaments || tournaments.length === 0) && <p>No tournaments yet — check back soon.</p>}

      {(tournaments || []).map((t) => {
        const s = status(t);
        const eligible = t.role_context === profile.role;
        return (
          <a key={t.id} href={`/tournaments/${t.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div className="card">
              <div className="action-row" style={{ marginBottom: 6 }}>
                <strong>{t.title}</strong>
                <span className={`badge ${s.cls}`}>{s.label}</span>
                {eligible && <span className="badge badge-green">Eligible</span>}
              </div>
              <p style={{ fontSize: 14, color: "var(--ink-600)", margin: "0 0 4px" }}>
                {t.role_context === "student" ? "Students" : "Tutors"} · {SCOPE_LABEL[t.scope]}
              </p>
              <p style={{ fontSize: 14, color: "var(--ink-600)", margin: 0 }}>
                {new Date(t.starts_at).toLocaleDateString()} – {new Date(t.ends_at).toLocaleDateString()} · Prize: {t.prize_description}
              </p>
            </div>
          </a>
        );
      })}
    </main>
  );
}