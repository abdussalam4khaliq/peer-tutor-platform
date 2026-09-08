import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import SettingsForm from "./settings-form";

export default async function AdminOverviewPage() {
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

  const { data: settings } = await supabase.from("site_settings").select("*").single();

  const [
    { count: studentCount },
    { count: tutorCount },
    { count: schoolCount },
    { count: courseCount },
    { count: activeCourseCount },
    { count: enrollmentCount },
    { count: paymentEvents },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student"),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "tutor"),
    supabase.from("schools").select("id", { count: "exact", head: true }),
    supabase.from("courses").select("id", { count: "exact", head: true }),
    supabase.from("courses").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("enrollments").select("id", { count: "exact", head: true }),
    supabase.from("wallet_transactions").select("id", { count: "exact", head: true }).eq("type", "tutor_commission"),
  ]);

  const now = new Date();
  const { count: activePaidCount } = await supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .gt("paid_until", now.toISOString());

  const { data: earned } = await supabase.from("wallet_transactions").select("amount");
  const totalEarnedByUsers = (earned || []).reduce((sum, t) => sum + Number(t.amount), 0);

  const { data: paidOut } = await supabase.from("withdrawal_requests").select("amount").eq("status", "paid");
  const totalPaidOut = (paidOut || []).reduce((sum, w) => sum + Number(w.amount), 0);

  const { data: pendingWithdrawals } = await supabase.from("withdrawal_requests").select("amount").eq("status", "pending");
  const totalPendingLiability = (pendingWithdrawals || []).reduce((sum, w) => sum + Number(w.amount), 0);

  const revenueEstimate = (paymentEvents || 0) * (settings?.course_price_naira || 0);

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />
      <p><a href="/admin">← Back to admin panel</a></p>
      <h1>Site overview</h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <h2>Platform</h2>
          <div className="card">
            <div className="field-row"><span className="field-row__label">Students</span><span className="field-row__value">{studentCount}</span></div>
            <div className="field-row"><span className="field-row__label">Tutors</span><span className="field-row__value">{tutorCount}</span></div>
            <div className="field-row"><span className="field-row__label">Schools</span><span className="field-row__value">{schoolCount}</span></div>
            <div className="field-row"><span className="field-row__label">Courses</span><span className="field-row__value">{activeCourseCount} active / {courseCount} total</span></div>
            <div className="field-row"><span className="field-row__label">Enrollments</span><span className="field-row__value">{activePaidCount} paid / {enrollmentCount} total</span></div>
          </div>
        </div>

        <div>
          <h2>Money (estimates)</h2>
          <div className="card">
            <div className="field-row"><span className="field-row__label">Payment events</span><span className="field-row__value">{paymentEvents}</span></div>
            <div className="field-row"><span className="field-row__label">Est. revenue</span><span className="field-row__value">₦{revenueEstimate}</span></div>
            <div className="field-row"><span className="field-row__label">Earned by users</span><span className="field-row__value">₦{totalEarnedByUsers}</span></div>
            <div className="field-row"><span className="field-row__label">Paid out</span><span className="field-row__value">₦{totalPaidOut}</span></div>
            <div className="field-row"><span className="field-row__label">Pending withdrawals</span><span className="field-row__value">₦{totalPendingLiability}</span></div>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-600)" }}>
            Revenue is estimated from payment events × current course price — it doesn&apos;t track historical price changes.
          </p>
          <p><a href="/admin/ledger">See exact site wallet & full ledger →</a></p>
        </div>
      </div>

      {profile.role === "super_admin" && (
        <>
          <h2>Site settings</h2>
          <SettingsForm settings={settings} />
        </>
      )}
    </main>
  );
}