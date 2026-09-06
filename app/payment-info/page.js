import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";

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
    .select("payment_bank_name, payment_account_number, payment_account_name, course_price_naira")
    .single();

  return (
    <main className="app-container app-container--narrow">
      <AppHeader profile={profile} />
      <p><a href="/courses">← Back to courses</a></p>
      <h1>Unlock full access</h1>
      <p>Your free trial has ended. To continue, make a transfer to the account below.</p>

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
        <div className="field-row">
          <span className="field-row__label">Amount</span>
          <span className="field-row__value">₦{settings?.course_price_naira} / month</span>
        </div>
      </div>

      <p>
        <strong>Important:</strong> use <strong>{profile.email}</strong> as your payment reference/narration,
        so we can match your transfer to your account.
      </p>

      <p>Once your transfer is confirmed, an admin will unlock your access — usually within 24 hours.</p>
    </main>
  );
}