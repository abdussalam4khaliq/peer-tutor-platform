import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import BankDetailsForm from "./bank-details-form";
import WithdrawalForm from "./withdrawal-form";

const STATUS_BADGE = { pending: "badge-amber", paid: "badge-green", rejected: "badge-grey" };

export default async function WalletPage() {
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

  const { data: balance } = await supabase.rpc("get_wallet_balance_for", { p_profile_id: user.id });

  const { data: history } = await supabase
    .from("withdrawal_requests")
    .select("id, amount, status, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false });

  const hasBankDetails = profile.bank_name && profile.account_number && profile.account_name;

  return (
    <main className="app-container app-container--narrow">
      <AppHeader profile={profile} />
      <h1>Wallet</h1>

      <div className="card">
        <div className="field-row">
          <span className="field-row__label">Available balance</span>
          <span className="field-row__value" style={{ fontSize: 20 }}>₦{balance ?? 0}</span>
        </div>
      </div>

      <h2>Bank details</h2>
      <BankDetailsForm
        bankName={profile.bank_name || ""}
        accountNumber={profile.account_number || ""}
        accountName={profile.account_name || ""}
      />

      <h2>Request a withdrawal</h2>
      {hasBankDetails ? (
        <WithdrawalForm balance={balance ?? 0} />
      ) : (
        <p className="card">Add your bank details above before requesting a withdrawal.</p>
      )}

      <h2>History</h2>
      {(!history || history.length === 0) && <p>No withdrawal requests yet.</p>}
      {(history || []).map((h) => (
        <div key={h.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>₦{h.amount} · {new Date(h.created_at).toLocaleDateString()}</span>
          <span className={`badge ${STATUS_BADGE[h.status]}`} style={{ textTransform: "capitalize" }}>{h.status}</span>
        </div>
      ))}
    </main>
  );
}