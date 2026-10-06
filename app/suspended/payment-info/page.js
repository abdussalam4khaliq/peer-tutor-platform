import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import PayWithPaystack from "./pay-with-paystack";

export default async function PaymentInfoPage() {
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

  const { data: settings } = await supabase
    .from("site_settings")
    .select("payment_bank_name, payment_account_number, payment_account_name")
    .single();

  const { data: plans } = await supabase
    .from("payment_plans")
    .select("*")
    .eq("active", true)
    .order("sort_order");

  // Flip PAYSTACK_ENABLED=true in the environment to switch from manual bank
  // transfer to Paystack checkout. Until then, nothing changes for students.
  if (process.env.PAYSTACK_ENABLED === "true") {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("id, paid_until, trial_ends_at, course:courses(code, title)")
      .eq("student_id", user.id)
      .order("created_at", { ascending: false });

    return (
      <main className="app-container">
        <AppHeader profile={profile} />
        <p><a href="/courses">← Back to courses</a></p>
        <h1>Unlock full access</h1>
        <p className="lede-sm">Pick your courses and a plan, then pay securely with Paystack. Your access unlocks automatically.</p>
        <PayWithPaystack plans={plans || []} enrollments={enrollments || []} />
      </main>
    );
  }

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href="/courses">← Back to courses</a></p>
      <h1>Unlock full access</h1>
      <p className="lede-sm">Pick a plan, transfer the amount, and an admin will unlock your access.</p>

      <h2>Plans</h2>
      {(plans || []).map((p) => (
        <div key={p.id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>
              <strong>{p.name}</strong>
              <br />
              <span style={{ fontSize: 14, color: "var(--ink-600)" }}>{p.description}</span>
            </span>
            <span className="badge badge-green" style={{ fontSize: 15 }}>
              ₦{Number(p.price_naira).toLocaleString()}
            </span>
          </div>
        </div>
      ))}

      <h2>Where to pay</h2>
      <div className="card">
        <div className="field-row">
          <span className="field-row__label">Bank</span>
          <span className="field-row__value">{settings?.payment_bank_name}</span>
        </div>
        <div className="field-row">
          <span className="field-row__label">Account number</span>
          <span className="field-row__value">{settings?.payment_account_number}</span>
        </div>
        <div className="field-row">
          <span className="field-row__label">Account name</span>
          <span className="field-row__value">{settings?.payment_account_name}</span>
        </div>
      </div>

      <p>
        <strong>Important:</strong> use <strong>{profile.email}</strong> as your payment reference, and
        mention which plan and which courses you&apos;re paying for.
      </p>
      <p>Access is usually unlocked within 24 hours of your transfer landing.</p>
    </main>
  );
}