import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import LeagueBoard from "./league-board";

export default async function LeaguesPage() {
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

  const { data: recentChange } = await supabase
    .from("league_history")
    .select("old_league, new_league, created_at")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const isRecent = recentChange && new Date() - new Date(recentChange.created_at) < 8 * 24 * 60 * 60 * 1000;
  const promoted = isRecent && recentChange.new_league !== recentChange.old_league &&
    ["bronze", "silver", "gold", "platinum", "diamond"].indexOf(recentChange.new_league) >
    ["bronze", "silver", "gold", "platinum", "diamond"].indexOf(recentChange.old_league);

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <h1>Leagues</h1>

      {isRecent && (
        <p>
          <span className={`badge ${promoted ? "badge-green" : "badge-amber"}`}>
            {promoted ? "Promoted" : "Demoted"} to {recentChange.new_league} last week
          </span>
        </p>
      )}

      <LeagueBoard />
    </main>
  );
}