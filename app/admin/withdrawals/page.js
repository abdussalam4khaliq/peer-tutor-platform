import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ActionButton from "@/components/action-button";

export default async function AdminWithdrawalsPage() {
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

  const { data: requests } = await supabase
    .from("withdrawal_requests")
    .select(`
      id, amount, bank_name, account_number, account_name, status, created_at,
      requester:profiles!withdrawal_requests_profile_id_fkey(id, full_name, email, role)
    `)
    .order("created_at", { ascending: false });

  const pending = (requests || []).filter((r) => r.status === "pending");
  const handled = (requests || []).filter((r) => r.status !== "pending");

  const balances = {};
  for (const r of pending) {
    if (!(r.requester.id in balances)) {
      const { data: bal } = await supabase.rpc("get_wallet_balance_for", { p_profile_id: r.requester.id });
      balances[r.requester.id] = bal ?? 0;
    }
  }

  async function approve(formData) {
    "use server";
    const id = formData.get("id");
    const supabase = await createClient();
    const {
      data: { user: admin },
    } = await supabase.auth.getUser();

    await supabase
      .from("withdrawal_requests")
      .update({ status: "paid", resolved_by: admin.id, resolved_at: new Date().toISOString() })
      .eq("id", id);

    revalidatePath("/admin/withdrawals");
  }

  async function reject(formData) {
    "use server";
    const id = formData.get("id");
    const supabase = await createClient();
    const {
      data: { user: admin },
    } = await supabase.auth.getUser();

    await supabase
      .from("withdrawal_requests")
      .update({ status: "rejected", resolved_by: admin.id, resolved_at: new Date().toISOString() })
      .eq("id", id);

    revalidatePath("/admin/withdrawals");
  }

  function RequestCard({ r, actionable }) {
    return (
      <div className="card">
        <p style={{ margin: "0 0 4px" }}>
          <strong>{r.requester?.full_name}</strong> ({r.requester?.email}, {r.requester?.role}) —{" "}
          <strong>₦{r.amount}</strong>
        </p>
        {actionable && (
          <p style={{ margin: "0 0 4px", fontSize: 14, color: "var(--ink-600)" }}>
            Current balance: ₦{balances[r.requester.id]}
          </p>
        )}
        <p style={{ margin: "0 0 8px", fontSize: 14, color: "var(--ink-600)" }}>
          {r.bank_name} · {r.account_number} · {r.account_name}
        </p>
        <p style={{ margin: "0 0 8px", fontSize: 13, color: "var(--ink-600)" }}>
          {new Date(r.created_at).toLocaleString()}
        </p>

        {actionable && (
          <div className="action-row">
            <form action={approve}>
              <input type="hidden" name="id" value={r.id} />
              <ActionButton pendingLabel="Marking paid...">Mark paid</ActionButton>
            </form>
            <form action={reject}>
              <input type="hidden" name="id" value={r.id} />
              <ActionButton pendingLabel="Rejecting..." className="btn btn-sm btn-outline">Reject</ActionButton>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href="/admin">← Back to admin panel</a></p>
      <h1>Withdrawal requests</h1>

      <h2>Pending ({pending.length})</h2>
      {pending.length === 0 && <p>Nothing pending.</p>}
      {pending.map((r) => <RequestCard key={r.id} r={r} actionable />)}

      <h2>Handled</h2>
      {handled.length === 0 && <p>No handled requests yet.</p>}
      {handled.map((r) => <RequestCard key={r.id} r={r} actionable={false} />)}
    </main>
  );
}