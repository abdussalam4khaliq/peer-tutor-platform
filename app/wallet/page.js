import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import BankDetailsForm from "./bank-details-form";

const KIND_LABEL = {
  tutor_commission: "Tutor commission",
  referral_bonus: "Referral bonus",
};

const OLD_LABEL = {
  tutor_commission: "Tutor commission",
  referral_credit: "Referral bonus",
  refund_reversal: "Refund reversal",
  legacy_settlement: "Final payout of old balance",
};

const naira = (kobo) => `₦${(Number(kobo) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default async function EarningsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/complete-profile");

  const { data: shares } = await supabase
    .from("payment_shares")
    .select("id, kind, amount_kobo, status, created_at")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  // Money from before direct payouts started: shown read-only. Any balance left is paid out once by an admin.
  const { data: oldBalance } = await supabase.rpc("get_wallet_balance_for", { p_profile_id: user.id });
  const { data: oldEarnings } = await supabase
    .from("wallet_transactions")
    .select("id, type, amount, description, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const verified = Boolean(profile.payout_verified_at);
  const payoutReady = verified && Boolean(profile.paystack_subaccount_code);
  const owedFromOldWallet = Number(oldBalance || 0);

  return (
    <main className="app-container app-container--narrow">
      <AppHeader profile={profile} />
      <h1>Earnings</h1>
      <p className="lede-sm">
        When a student pays, Paystack sends your share straight to your bank account. Coursemate never holds your money.
      </p>

      <h2>Payout account</h2>
      <BankDetailsForm
        bankName={profile.bank_name || ""}
        bankCode={profile.bank_code || ""}
        accountNumber={profile.account_number || ""}
        accountName={profile.account_name || ""}
        verified={verified}
        payoutReady={payoutReady}
      />
      {!payoutReady && (
        <p style={{ fontSize: 13, color: "#8a5a00" }}>
          Tutors need a verified payout account before students can pay for their courses.
        </p>
      )}

      {owedFromOldWallet > 0 && (
        <div className="card">
          <p style={{ margin: 0 }}>
            <strong>Balance from the old wallet: ₦{owedFromOldWallet.toLocaleString()}</strong>
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 14 }}>
            We&apos;re closing the old wallet. This balance will be paid to your bank account above
            {verified ? "" : " once you've added and verified it"}.
          </p>
        </div>
      )}

      <h2>Payments sent to you</h2>
      {(!shares || shares.length === 0) && <p>Nothing yet. Your share appears here after a student pays for one of your courses.</p>}
      {(shares || []).map((s) => (
        <div key={s.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <span>
            <strong>{KIND_LABEL[s.kind] || s.kind}</strong>
            <br />
            <span style={{ fontSize: 13, color: "var(--ink-600)" }}>{new Date(s.created_at).toLocaleDateString()}</span>
          </span>
          <span style={{ textAlign: "right" }}>
            <strong>{naira(s.amount_kobo)}</strong>
            <br />
            <span className={`badge ${s.status === "refunded" ? "badge-grey" : "badge-green"}`}>
              {s.status === "refunded" ? "Refunded" : "Sent by Paystack"}
            </span>
          </span>
        </div>
      ))}

      {oldEarnings && oldEarnings.length > 0 && (
        <details className="card">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Earlier earnings (old wallet)</summary>
          {oldEarnings.map((t) => {
            const negative = Number(t.amount) < 0;
            return (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--rule)", fontSize: 14 }}>
                <span>
                  {OLD_LABEL[t.type] || t.type} · {new Date(t.created_at).toLocaleDateString()}
                </span>
                <strong style={{ color: negative ? "#a33" : "var(--moss)" }}>
                  {negative ? "-" : "+"}₦{Math.abs(Number(t.amount)).toLocaleString()}
                </strong>
              </div>
            );
          })}
        </details>
      )}
    </main>
  );
}
