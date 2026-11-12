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

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/complete-profile");

  const paymentsOpen = process.env.PAYSTACK_ENABLED === "true";

  const { data: plans } = await supabase
    .from("payment_plans")
    .select("*")
    .eq("active", true)
    .order("sort_order");

  if (!paymentsOpen) {
    return (
      <main className="app-container">
        <AppHeader profile={profile} />
        <p><a href="/courses">← Back to courses</a></p>
        <h1>Unlock full access</h1>
        <div className="card">
          <p style={{ margin: 0 }}>
            <strong>Payments aren&apos;t open yet.</strong>
          </p>
          <p style={{ margin: "6px 0 0" }}>
            You can keep using your free trial. When card payments open, you&apos;ll be able to pay here and your access
            will unlock automatically.
          </p>
        </div>
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
      </main>
    );
  }

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id, paid_until, trial_ends_at, course:courses(code, title)")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false });

  const { data: history } = await supabase
    .from("payments")
    .select("id, reference, amount_kobo, status, created_at, paid_at, plan:payment_plans(name)")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const labelFor = (p) => {
    if (p.status === "success") return { text: "Paid", cls: "badge-green" };
    if (p.status === "refunded") return { text: "Refunded", cls: "badge-grey" };
    if (p.status === "mismatch") return { text: "Under review", cls: "badge-amber" };
    if (p.status === "failed") return { text: "Under review", cls: "badge-amber" };
    if (p.status === "pending") {
      return new Date(p.created_at).getTime() < dayAgo
        ? { text: "Not completed", cls: "badge-grey" }
        : { text: "Awaiting payment", cls: "badge-amber" };
    }
    return { text: "Closed", cls: "badge-grey" };
  };

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href="/courses">← Back to courses</a></p>
      <h1>Unlock full access</h1>
      <p className="lede-sm">Pick your courses and a plan, then pay securely with Paystack. Your access unlocks automatically.</p>
      <PayWithPaystack plans={plans || []} enrollments={enrollments || []} />

      {history && history.length > 0 && (
        <>
          <h2>Your payments</h2>
          {history.map((p) => {
            const l = labelFor(p);
            return (
              <div key={p.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <span>
                  <strong>{p.plan?.name || "Payment"}</strong>
                  <br />
                  <span style={{ fontSize: 13, color: "var(--ink-600)" }}>
                    {new Date(p.paid_at || p.created_at).toLocaleDateString()} · {p.reference}
                  </span>
                </span>
                <span style={{ textAlign: "right" }}>
                  ₦{(Number(p.amount_kobo) / 100).toLocaleString()}
                  <br />
                  <span className={`badge ${l.cls}`}>{l.text}</span>
                </span>
              </div>
            );
          })}
        </>
      )}
    </main>
  );
}
