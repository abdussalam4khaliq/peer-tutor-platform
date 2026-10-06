import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyTransaction } from "@/lib/paystack";
import AppHeader from "@/components/app-header";

export const dynamic = "force-dynamic";

// Paystack sends the student back here after checkout, with ?reference=...
// This page only DISPLAYS the outcome. Access is unlocked by complete_payment(),
// which is idempotent, so it is safe that the webhook may do the same job.
export default async function PaymentCallbackPage({ searchParams }) {
  const sp = await searchParams;
  const reference = sp?.reference || sp?.trxref;

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

  let outcome = "unknown"; // success | pending | failed | unknown

  if (reference) {
    const admin = createAdminClient();

    const { data: payment } = await admin
      .from("payments")
      .select("reference, student_id, status")
      .eq("reference", reference)
      .maybeSingle();

    // Only the student who started the payment can see its result.
    if (payment && payment.student_id === user.id) {
      if (payment.status === "success") {
        outcome = "success";
      } else {
        try {
          const tx = await verifyTransaction(reference);

          if (tx.status === "success") {
            const { data: result } = await admin.rpc("complete_payment", {
              p_reference: reference,
              p_amount_kobo: tx.amount,
              p_currency: tx.currency,
              p_transaction_id: tx.id != null ? String(tx.id) : null,
              p_channel: tx.channel ?? null,
              p_fee_kobo: tx.fees ?? null,
            });
            outcome = result === "success" || result === "already_processed" ? "success" : "failed";
          } else if (tx.status === "failed" || tx.status === "abandoned" || tx.status === "reversed") {
            outcome = "failed";
          } else {
            outcome = "pending"; // e.g. a bank transfer that hasn't landed yet
          }
        } catch (err) {
          console.error("Paystack verify failed:", err);
          outcome = "pending";
        }
      }
    }
  }

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <h1>Payment</h1>

      {outcome === "success" && (
        <div className="card">
          <p><span className="badge badge-green">Payment confirmed</span></p>
          <p>Your access is now active. Thank you!</p>
          <p><a href="/courses">Go to my courses →</a></p>
        </div>
      )}

      {outcome === "pending" && (
        <div className="card">
          <p><span className="badge badge-amber">Still confirming</span></p>
          <p>
            We haven&apos;t received the confirmation from the bank yet. This can take a few minutes for
            bank transfers. Your access will unlock automatically once it lands.
          </p>
          <p><a href={`/payment/callback?reference=${encodeURIComponent(reference || "")}`}>Check again</a></p>
        </div>
      )}

      {outcome === "failed" && (
        <div className="card">
          <p><span className="badge badge-amber">Payment not completed</span></p>
          <p>
            The payment didn&apos;t go through. If you were charged, contact support with reference{" "}
            <strong>{reference}</strong>.
          </p>
          <p><a href="/payment-info">Try again →</a></p>
        </div>
      )}

      {outcome === "unknown" && (
        <div className="card">
          <p>We couldn&apos;t find that payment.</p>
          <p><a href="/payment-info">Back to plans →</a></p>
        </div>
      )}
    </main>
  );
}
