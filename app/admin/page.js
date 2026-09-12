import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";

export default async function AdminPage() {
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

  const [{ count: pendingApps }, { count: openReports }, { count: openBugs }, { count: pendingWithdrawals }, { data: flaggedTopics }] = await Promise.all([
    supabase.from("tutor_applications").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("reports").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("bug_reports").select("id", { count: "exact", head: true }).neq("status", "resolved"),
    supabase.from("withdrawal_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.rpc("get_flagged_topics"),
  ]);
  const flaggedCount = (flaggedTopics || []).length;

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />
      <h1>Admin panel</h1>
      <p className="lede-sm">Manage the platform from here.</p>

      <div className="admin-grid">
        <a href="/admin/overview" className="card admin-link-card">
          <div className="admin-link-card__top">
            <strong>Site overview & settings</strong>
          </div>
          <p>Platform stats, revenue estimates, and site-wide settings.</p>
        </a>

        <a href="/admin/applications" className="card admin-link-card">
          <div className="admin-link-card__top">
            <strong>Tutor applications</strong>
            {pendingApps > 0 && <span className="badge badge-amber">{pendingApps} pending</span>}
          </div>
          <p>Review and approve or reject applications to teach a course.</p>
        </a>

        <a href="/admin/enrollments" className="card admin-link-card">
          <div className="admin-link-card__top">
            <strong>Enrollments & payments</strong>
          </div>
          <p>See who&apos;s on trial or paid, and mark bank transfers as paid.</p>
        </a>

        <a href="/admin/tournaments" className="card admin-link-card">
          <div className="admin-link-card__top">
            <strong>Tournaments</strong>
          </div>
          <p>Create tournaments and track prize distribution for winners.</p>
        </a>

        <a href="/admin/withdrawals" className="card admin-link-card">
          <div className="admin-link-card__top">
            <strong>Withdrawal requests</strong>
            {pendingWithdrawals > 0 && <span className="badge badge-amber">{pendingWithdrawals} pending</span>}
          </div>
          <p>Review and pay out tutor commissions and referral earnings.</p>
        </a>

        <a href="/admin/content" className="card admin-link-card">
          <div className="admin-link-card__top">
            <strong>Schools & courses</strong>
          </div>
          <p>Add or edit schools, faculties, departments, and courses.</p>
        </a>

        <a href="/admin/content-review" className="card admin-link-card">
          <div className="admin-link-card__top">
            <strong>Content review</strong>
            {flaggedCount > 0 && <span className="badge badge-amber">{flaggedCount} flagged</span>}
          </div>
          <p>Topics with consistently low ratings, surfaced automatically.</p>
        </a>
        
        <a href="/admin/reports" className="card admin-link-card">
          <div className="admin-link-card__top">
            <strong>Account reports</strong>
            {openReports > 0 && <span className="badge badge-amber">{openReports} open</span>}
          </div>
          <p>Review reports filed against student and tutor accounts.</p>
        </a>

        <a href="/admin/bug-reports" className="card admin-link-card">
          <div className="admin-link-card__top">
            <strong>Bug reports</strong>
            {openBugs > 0 && <span className="badge badge-amber">{openBugs} open</span>}
          </div>
          <p>Bugs, feature requests, and other issues from users.</p>
        </a>

        {profile.role === "super_admin" && (
          <a href="/admin/admins" className="card admin-link-card">
            <div className="admin-link-card__top">
              <strong>Manage admins</strong>
            </div>
            <p>Promote users to admin, or demote existing admins.</p>
          </a>
        )}
      </div>
    </main>
  );
}