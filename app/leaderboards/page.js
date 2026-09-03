import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import LeaderboardTabs from "./leaderboard-tabs";

export default async function LeaderboardsPage() {
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

  let facultyId = null;
  let schoolId = null;

  if (profile.department_id) {
    const { data: department } = await supabase
      .from("departments")
      .select("faculty_id, faculties(school_id)")
      .eq("id", profile.department_id)
      .maybeSingle();

    facultyId = department?.faculty_id || null;
    schoolId = department?.faculties?.school_id || null;
  }

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <h1>Leaderboards</h1>
      <LeaderboardTabs
        departmentId={profile.department_id}
        facultyId={facultyId}
        schoolId={schoolId}
      />
    </main>
  );
}