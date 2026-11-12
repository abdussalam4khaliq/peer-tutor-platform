import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import SettleButton from "./settle-button";

export const dynamic = "force-dynamic";

export default async function LegacyBalancesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
    redirect("/dashboard");
  }

  // Only works once migration 27b has been applied. Before that, this list is simply unavailable.
  const { data: balances, error } = await supabase.rpc("admin_legacy_balances");

  const rows = balances || [];
  const total = rows.reduce((sum, r) => sum + Number(r.owed), 0);

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />
      <p><a href="/admin">← Back to admin</a></p>
      <h1>Old wallet balances</h1>
      <p className="lede-sm">
        Coursemate no longer keeps wallets: tutors and referrers are paid directly by Paystack. These are the balances
        people still had in the old wallet. Pay each one once by bank transfer, then close it here.
      </p>

      {error && <p style={{ color: "red" }}>Couldn&apos;t load balances: {error.message}</p>}

      {!error && (
        <div className="card">
          <div className="field-row">
            <span className="field-row__label">Total still owed</span>
            <span className="field-row__value">₦{total.toLocaleString()}</span>
          </div>
        </div>
      )}

      {!error && rows.length === 0 && <p>No old balances left. You&apos;re all settled.</p>}

      {rows.map((r) => {
        const hasBank = r.bank_name && r.account_number && r.account_name;
        return (
          <div key={r.profile_id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span>
                <strong>{r.full_name || "Unknown"}</strong>
                <span style={{ color: "var(--ink-600)", fontSize: 13 }}> · {r.email} · {r.role}</span>
                {r.pending_requests > 0 && (
                  <span className="badge badge-amber" style={{ marginLeft: 6 }}>{r.pending_requests} open request(s)</span>
                )}
              </span>
              <strong>₦{Number(r.owed).toLocaleString()}</strong>
            </div>
            {hasBank ? (
              <p style={{ margin: "8px 0 0", fontSize: 14 }}>
                Pay to: <strong>{r.account_name}</strong> · {r.bank_name} · {r.account_number}
              </p>
            ) : (
              <p style={{ margin: "8px 0 0", fontSize: 14, color: "#8a5a00" }}>
                No bank details on file. Ask them to add and verify an account on their Earnings page.
              </p>
            )}
            <SettleButton
              profileId={r.profile_id}
              name={r.full_name || "this person"}
              owed={r.owed}
              bank={hasBank ? `${r.account_name}, ${r.bank_name} ${r.account_number}` : ""}
            />
          </div>
        );
      })}
    </main>
  );
}
