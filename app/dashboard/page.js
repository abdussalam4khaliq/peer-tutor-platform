import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ReferralShare from "@/components/referral-share";

export default async function DashboardPage() {
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

  if (profile.role === "tutor") {
    const { data: myCourses } = await supabase
      .from("courses")
      .select("id")
      .eq("tutor_id", user.id);

    if ((myCourses || []).length === 0) {
      return (
        <main className="app-container app-container--narrow">
          <AppHeader profile={profile} />
          <h1>Welcome, {profile.full_name}</h1>
          {profile.tutor_status === "pending" && (
            <p>Your Tutor application is under review. Check back soon.</p>
          )}
          {profile.tutor_status === "rejected" && (
            <>
              <p>Your Tutor application wasn&apos;t approved this time.</p>
              <a href="/apply-tutor">Apply again</a>
            </>
          )}
          {!profile.tutor_status && (
            <>
              <p>You haven&apos;t applied to teach a course yet.</p>
              <a href="/apply-tutor">Apply to become a Tutor</a>
            </>
          )}
        </main>
      );
    }
  }

  let stats = null;
  if (profile.role === "student") {
    const { data } = await supabase.from("student_stats").select("*").eq("student_id", user.id).maybeSingle();
    stats = data;
  } else if (profile.role === "tutor") {
    const { data } = await supabase.from("tutor_stats").select("*").eq("tutor_id", user.id).maybeSingle();
    stats = data;
  }

  const { data: credits } = await supabase
    .from("referral_credits")
    .select("amount")
    .eq("referrer_id", user.id);
  const totalEarned = (credits || []).reduce((sum, c) => sum + Number(c.amount), 0);

  const isAdmin = profile.role === "admin" || profile.role === "super_admin";
  const isTutor = profile.role === "tutor";
  const isStudent = profile.role === "student";

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <h1>Welcome, {profile.full_name || user.email}</h1>

      <div className="card">
        <div className="field-row">
          <span className="field-row__label">Role</span>
          <span className="field-row__value" style={{ textTransform: "capitalize" }}>{profile.role}</span>
        </div>
        <div className="field-row">
          <span className="field-row__label">School</span>
          <span className="field-row__value">{profile.school}</span>
        </div>
      </div>

      <div className="action-row" style={{ margin: "16px 0 28px" }}>
        {isAdmin && <a className="btn btn-outline btn-sm" href="/admin">Admin panel</a>}
        {(isTutor || isAdmin) && (
          <a className="btn btn-outline btn-sm" href="/tutor/courses">
            {isTutor ? "Manage my courses" : "Manage my courses (as tutor)"}
          </a>
        )}
        {isAdmin && <a className="btn btn-outline btn-sm" href="/apply-tutor">Apply to teach a course</a>}
        {isStudent && <a className="btn btn-outline btn-sm" href="/leaderboards">Leaderboard</a>}
        {isStudent && <a className="btn btn-outline btn-sm" href="/leagues">Leagues</a>}
        {isTutor && <a className="btn btn-outline btn-sm" href="/tutor/leaderboards">Leaderboard</a>}
        {isTutor && <a className="btn btn-outline btn-sm" href="/tutor/leagues">Leagues</a>}
        <a className="btn btn-outline btn-sm" href="/wallet">Wallet</a>
      </div>

      {(isStudent || isTutor) && (
        <>
          <h2>Your progress</h2>
          <div className="card">
            <div className="field-row">
              <span className="field-row__label">Total EXP</span>
              <span className="field-row__value">{stats?.total_exp || 0}</span>
            </div>
            <div className="field-row">
              <span className="field-row__label">Current streak</span>
              <span className="field-row__value">🔥 {stats?.current_streak || 0} day{(stats?.current_streak || 0) === 1 ? "" : "s"}</span>
            </div>
            <div className="field-row">
              <span className="field-row__label">League</span>
              <span className="field-row__value" style={{ textTransform: "capitalize" }}>{stats?.current_league || "bronze"}</span>
            </div>
          </div>
        </>
      )}

      <h2>Your referral code</h2>
      <div className="card">
        <div className="field-row">
          <span className="field-row__label">Code</span>
          <span className="field-row__value" style={{ fontFamily: "var(--font-mono)" }}>
            {profile.referral_code || "—"}
          </span>
        </div>
        <div className="field-row">
          <span className="field-row__label">Total earned</span>
          <span className="field-row__value">₦{totalEarned}</span>
        </div>
      </div>
      <ReferralShare referralCode={profile.referral_code} />
    </main>
  );
}