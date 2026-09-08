import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";

export default async function TournamentDetailPage({ params }) {
  const { id } = params;
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

  const { data: tournament } = await supabase.from("tournaments").select("*").eq("id", id).maybeSingle();
  if (!tournament) notFound();

  const { data: standings } = await supabase.rpc("get_tournament_standings", { p_tournament_id: id });

  const now = new Date();
  const ended = now > new Date(tournament.ends_at);
  const winners = new Set((standings || []).slice(0, tournament.num_winners).map((s) => s.profile_id));

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href="/tournaments">← Back to tournaments</a></p>
      <h1>{tournament.title}</h1>
      {tournament.description && <p className="lede-sm">{tournament.description}</p>}

      <div className="card">
        <div className="field-row">
          <span className="field-row__label">Prize</span>
          <span className="field-row__value">{tournament.prize_description}</span>
        </div>
        <div className="field-row">
          <span className="field-row__label">Winners</span>
          <span className="field-row__value">Top {tournament.num_winners}</span>
        </div>
        <div className="field-row">
          <span className="field-row__label">Window</span>
          <span className="field-row__value">
            {new Date(tournament.starts_at).toLocaleDateString()} – {new Date(tournament.ends_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      <h2>{ended ? "Final standings" : "Live standings"}</h2>
      {(!standings || standings.length === 0) && <p>No activity yet.</p>}

      {(standings || []).map((s) => (
        <div
          key={s.profile_id}
          className="card"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderColor: s.profile_id === user.id ? "var(--moss)" : undefined,
            borderWidth: s.profile_id === user.id ? 2 : undefined,
          }}
        >
          <span>
            <strong>#{s.rnk}</strong> {s.full_name}
            {winners.has(s.profile_id) && <span className="badge badge-green" style={{ marginLeft: 8 }}>🏆 Winner</span>}
          </span>
          <span>{s.exp_earned} EXP</span>
        </div>
      ))}
    </main>
  );
}