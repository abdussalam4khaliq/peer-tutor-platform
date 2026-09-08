import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ActionButton from "@/components/action-button";
import CreateTournamentForm from "./create-tournament-form";

export default async function AdminTournamentsPage() {
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

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("*")
    .order("starts_at", { ascending: false });

  const now = new Date();
  const ended = (tournaments || []).filter((t) => now > new Date(t.ends_at));

  const winnersByTournament = {};
  for (const t of ended) {
    const { data: standings } = await supabase.rpc("get_tournament_standings", { p_tournament_id: t.id });
    winnersByTournament[t.id] = (standings || []).slice(0, t.num_winners);
  }

  const { data: prizeLogs } = await supabase.from("tournament_prize_log").select("tournament_id, profile_id");
  const givenSet = new Set((prizeLogs || []).map((p) => `${p.tournament_id}:${p.profile_id}`));

  async function deleteTournament(formData) {
    "use server";
    const id = formData.get("id");
    const supabase = await createClient();
    await supabase.from("tournaments").delete().eq("id", id);
    revalidatePath("/admin/tournaments");
  }

  async function markPrizeGiven(formData) {
    "use server";
    const tournamentId = formData.get("tournamentId");
    const profileId = formData.get("profileId");
    const supabase = await createClient();
    const {
      data: { user: admin },
    } = await supabase.auth.getUser();

    await supabase.from("tournament_prize_log").insert({
      tournament_id: tournamentId,
      profile_id: profileId,
      given_by: admin.id,
    });

    revalidatePath("/admin/tournaments");
  }

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />
      <p><a href="/admin">← Back to admin panel</a></p>
      <h1>Tournaments</h1>

      <h2>Create a tournament</h2>
      <CreateTournamentForm />

      <h2>Ended — winners & prizes</h2>
      {ended.length === 0 && <p>No tournaments have ended yet.</p>}
      {ended.map((t) => (
        <div key={t.id} className="card">
          <p style={{ fontWeight: 600, margin: "0 0 8px" }}>{t.title} — {t.prize_description}</p>
          {(winnersByTournament[t.id] || []).map((w) => {
            const given = givenSet.has(`${t.id}:${w.profile_id}`);
            return (
              <div key={w.profile_id} className="action-row" style={{ marginBottom: 6 }}>
                <span>#{w.rnk} {w.full_name} — {w.exp_earned} EXP</span>
                {given ? (
                  <span className="badge badge-green">Prize given</span>
                ) : (
                  <form action={markPrizeGiven}>
                    <input type="hidden" name="tournamentId" value={t.id} />
                    <input type="hidden" name="profileId" value={w.profile_id} />
                    <ActionButton pendingLabel="Marking..." className="btn btn-sm btn-outline">Mark prize given</ActionButton>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <h2>All tournaments</h2>
      {(tournaments || []).map((t) => (
        <div key={t.id} className="card action-row" style={{ justifyContent: "space-between" }}>
          <span>{t.title} ({t.role_context}, {t.scope})</span>
          <form action={deleteTournament}>
            <input type="hidden" name="id" value={t.id} />
            <ActionButton pendingLabel="Deleting..." className="btn btn-sm btn-danger">Delete</ActionButton>
          </form>
        </div>
      ))}
    </main>
  );
}