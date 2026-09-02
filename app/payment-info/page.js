import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// 👇 Edit these with your real account details
const PAYMENT_DETAILS = {
  bankName: "Opay",
  accountNumber: "9019812076",
  accountName: "Abdulkhaliq Abdussalam",
  amount: "₦2,000 / month",
};

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

  return (
    <main className="app-container app-container--narrow">
      <p><a href="/courses">← Back to courses</a></p>
      <h1>Unlock full access</h1>
      <p>Your free trial has ended. To continue, make a transfer to the account below.</p>

      <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem", margin: "1rem 0" }}>
        <p><strong>Bank:</strong> {PAYMENT_DETAILS.bankName}</p>
        <p><strong>Account number:</strong> {PAYMENT_DETAILS.accountNumber}</p>
        <p><strong>Account name:</strong> {PAYMENT_DETAILS.accountName}</p>
        <p><strong>Amount:</strong> {PAYMENT_DETAILS.amount}</p>
      </div>

      <p>
        <strong>Important:</strong> use <strong>{profile.email}</strong> as your payment reference/narration,
        so we can match your transfer to your account.
      </p>

      <p>Once your transfer is confirmed, an admin will unlock your access — usually within 24 hours.</p>
    </main>
  );
}