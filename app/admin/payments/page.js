import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import PaymentActions from "./payment-actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL = {
  pending: { text: "Pending", cls: "badge-grey" },
  success: { text: "Paid", cls: "badge-green" },
  failed: { text: "Failed", cls: "badge-amber" },
  mismatch: { text: "Amount mismatch", cls: "badge-amber" },
  refunded: { text: "Refunded", cls: "badge-grey" },
  dismissed: { text: "Dismissed", cls: "badge-grey" },
};

const FILTERS = [
  { key: "attention", label: "Needs attention" },
  { key: "all", label: "All" },
  { key: "success", label: "Paid" },
  { key: "pending", label: "Pending" },
  { key: "refunded", label: "Refunded" },
];

const naira = (kobo) => `₦${(Number(kobo || 0) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default async function AdminPaymentsPage({ searchParams }) {
  const sp = await searchParams;
  const filter = FILTERS.some((f) => f.key === sp?.status) ? sp.status : "attention";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
    redirect("/dashboard");
  }

  const { data: payments } = await supabase
    .from("payments")
    .select("id, reference, amount_kobo, status, channel, fee_kobo, paid_at, note, created_at, student:profiles(full_name, email), plan:payment_plans(name)")
    .order("created_at", { ascending: false })
    .limit(300);

  const all = payments || [];
  const needsAttention = (p) => p.status === "mismatch" || p.status === "failed" || !!p.note;

  const collected = all.filter((p) => p.status === "success").reduce((s, p) => s + Number(p.amount_kobo), 0);
  const fees = all.filter((p) => p.status === "success").reduce((s, p) => s + Number(p.fee_kobo || 0), 0);
  const attentionCount = all.filter(needsAttention).length;

  const shown = all.filter((p) => {
    if (filter === "all") return true;
    if (filter === "attention") return needsAttention(p);
    return p.status === filter;
  });

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />
      <p><a href="/admin">← Back to admin</a></p>
      <h1>Payments</h1>
      <p className="lede-sm">Paystack payments, refunds and anything that needs a decision. Showing the latest 300.</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, margin: "16px 0" }}>
        <div className="card"><div className="field-row"><span className="field-row__label">Collected</span><span className="field-row__value">{naira(collected)}</span></div></div>
        <div className="card"><div className="field-row"><span className="field-row__label">Paystack fees</span><span className="field-row__value">{naira(fees)}</span></div></div>
        <div className="card"><div className="field-row"><span className="field-row__label">Needs attention</span><span className="field-row__value">{attentionCount}</span></div></div>
      </div>

      <p style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {FILTERS.map((f) => (
          <a key={f.key} href={`/admin/payments?status=${f.key}`} className={`badge ${filter === f.key ? "badge-green" : "badge-grey"}`}>
            {f.label}
          </a>
        ))}
      </p>

      {shown.length === 0 && <p>Nothing to show here.</p>}

      {shown.map((p) => {
        const s = STATUS_LABEL[p.status] || { text: p.status, cls: "badge-grey" };
        return (
          <div key={p.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span>
                <strong>{p.student?.full_name || "Unknown student"}</strong>
                {p.student?.email && <span style={{ color: "var(--ink-600)", fontSize: 13 }}> · {p.student.email}</span>}
                <br />
                <span style={{ fontSize: 13, color: "var(--ink-600)" }}>
                  {p.plan?.name || "Plan"} · {new Date(p.paid_at || p.created_at).toLocaleString()}
                  {p.channel ? ` · ${p.channel}` : ""}
                </span>
              </span>
              <span style={{ textAlign: "right" }}>
                <strong>{naira(p.amount_kobo)}</strong>
                <br />
                <span className={`badge ${s.cls}`}>{s.text}</span>
              </span>
            </div>

            {p.note && (
              <p style={{ margin: "8px 0 0", fontSize: 13, color: "#8a5a00", whiteSpace: "pre-line" }}>{p.note}</p>
            )}
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--ink-600)", fontFamily: "var(--font-mono, monospace)", wordBreak: "break-all" }}>
              {p.reference}
            </p>

            <PaymentActions id={p.id} status={p.status} hasNote={!!p.note} />
          </div>
        );
      })}
    </main>
  );
}
