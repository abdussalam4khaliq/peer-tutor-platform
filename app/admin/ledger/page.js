import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ManualEntryForm from "./manual-entry-form";

const TYPE_LABEL = {
  revenue: "Course payment",
  withdrawal_payout: "Withdrawal payout",
  manual_expense: "Expense",
  manual_income: "Other income",
};

export default async function AdminLedgerPage() {
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

  const { data: allEntries } = await supabase.from("site_ledger").select("type, amount");

  const totals = { revenue: 0, withdrawal_payout: 0, manual_expense: 0, manual_income: 0 };
  (allEntries || []).forEach((e) => {
    totals[e.type] += Number(e.amount);
  });

  const netBalance = Object.values(totals).reduce((sum, v) => sum + v, 0);

  const { data: recent } = await supabase
    .from("site_ledger")
    .select("id, type, amount, description, created_at, creator:profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  async function addManualEntry(formData) {
    "use server";
    const type = formData.get("type");
    const amount = Number(formData.get("amount"));
    const description = formData.get("description");
    const supabase = await createClient();
    const {
      data: { user: admin },
    } = await supabase.auth.getUser();

    await supabase.from("site_ledger").insert({
      type,
      amount: type === "manual_expense" ? -Math.abs(amount) : Math.abs(amount),
      description: description?.trim() || null,
      created_by: admin.id,
    });

    revalidatePath("/admin/ledger");
  }

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />
      <p><a href="/admin/overview">← Back to overview</a></p>
      <h1>Site ledger</h1>

      <div className="card">
        <div className="field-row">
          <span className="field-row__label">Site wallet (net)</span>
          <span className="field-row__value" style={{ fontSize: 20 }}>₦{netBalance.toLocaleString()}</span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, margin: "16px 0" }}>
        <div className="card">
          <div className="field-row"><span className="field-row__label">Revenue collected</span><span className="field-row__value">₦{totals.revenue.toLocaleString()}</span></div>
        </div>
        <div className="card">
          <div className="field-row"><span className="field-row__label">Paid out to users</span><span className="field-row__value">₦{totals.withdrawal_payout.toLocaleString()}</span></div>
        </div>
        <div className="card">
          <div className="field-row"><span className="field-row__label">Other expenses</span><span className="field-row__value">₦{totals.manual_expense.toLocaleString()}</span></div>
        </div>
        <div className="card">
          <div className="field-row"><span className="field-row__label">Other income</span><span className="field-row__value">₦{totals.manual_income.toLocaleString()}</span></div>
        </div>
      </div>

      <h2>Log an expense or other income</h2>
      <ManualEntryForm addManualEntry={addManualEntry} />

      <h2>Recent entries</h2>
      {(!recent || recent.length === 0) && <p>No entries yet.</p>}
      {(recent || []).map((e) => (
        <div key={e.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>
            <span className="badge badge-grey">{TYPE_LABEL[e.type]}</span>{" "}
            {e.description}
            {e.creator?.full_name && <span style={{ color: "var(--ink-600)", fontSize: 13 }}> — by {e.creator.full_name}</span>}
          </span>
          <span style={{ color: e.amount < 0 ? "#a83a3a" : "var(--moss)" }}>
            {e.amount < 0 ? "-" : "+"}₦{Math.abs(e.amount).toLocaleString()}
          </span>
        </div>
      ))}
    </main>
  );
}