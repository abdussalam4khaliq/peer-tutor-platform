"use client";

import { useState } from "react";

export default function PayWithPaystack({ plans, enrollments }) {
  const [selected, setSelected] = useState([]);
  const [planId, setPlanId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const plan = plans.find((p) => p.id === planId);
  const now = new Date();

  function toggle(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handlePay() {
    setError(null);

    if (selected.length === 0) {
      setError("Select at least one course.");
      return;
    }
    if (!planId) {
      setError("Select a plan.");
      return;
    }
    if (plan && selected.length > plan.course_count) {
      setError(`That plan covers up to ${plan.course_count} course(s).`);
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, enrollmentIds: selected }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.authorization_url) {
        setError(data.error || "Couldn't start the payment. Please try again.");
        setBusy(false);
        return;
      }

      window.location.href = data.authorization_url;
    } catch {
      setError("Network problem. Please try again.");
      setBusy(false);
    }
  }

  if (enrollments.length === 0) {
    return (
      <div className="card">
        <p>You haven&apos;t joined any courses yet. Join a course first, then come back to unlock it.</p>
        <p><a href="/courses">Browse courses →</a></p>
      </div>
    );
  }

  return (
    <div className="card">
      <p style={{ margin: "0 0 6px" }}><strong>1. Choose your courses</strong></p>
      {enrollments.map((e) => {
        const paidActive = e.paid_until && now < new Date(e.paid_until);
        const trialActive = now < new Date(e.trial_ends_at);
        return (
          <label
            key={e.id}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--rule)" }}
          >
            <input
              type="checkbox"
              checked={selected.includes(e.id)}
              onChange={() => toggle(e.id)}
              style={{ width: "auto" }}
            />
            <span style={{ flex: 1, fontSize: 14 }}>
              {e.course?.code} — {e.course?.title}
            </span>
            <span className={`badge ${paidActive ? "badge-green" : trialActive ? "badge-grey" : "badge-amber"}`}>
              {paidActive
                ? `Paid to ${new Date(e.paid_until).toLocaleDateString()}`
                : trialActive
                ? "On trial"
                : "No access"}
            </span>
          </label>
        );
      })}

      <p style={{ margin: "14px 0 6px" }}><strong>2. Choose a plan</strong></p>
      {plans.map((p) => (
        <label
          key={p.id}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--rule)" }}
        >
          <input
            type="radio"
            name="plan"
            checked={planId === p.id}
            onChange={() => setPlanId(p.id)}
            style={{ width: "auto" }}
          />
          <span style={{ flex: 1 }}>
            <strong>{p.name}</strong>
            <br />
            <span style={{ fontSize: 13, color: "var(--ink-600)" }}>{p.description}</span>
          </span>
          <span className="badge badge-green">₦{Number(p.price_naira).toLocaleString()}</span>
        </label>
      ))}

      <div className="action-row" style={{ marginTop: 14 }}>
        <button type="button" className="btn" onClick={handlePay} disabled={busy}>
          {busy
            ? "Redirecting to Paystack..."
            : plan
            ? `Pay ₦${Number(plan.price_naira).toLocaleString()} with Paystack`
            : "Pay with Paystack"}
        </button>
      </div>

      {plan && selected.length > 0 && (
        <p style={{ fontSize: 13, color: "var(--ink-600)", margin: "8px 0 0" }}>
          {selected.length} of up to {plan.course_count} course(s) · {plan.duration_months} month(s) access
        </p>
      )}
      {error && <p style={{ color: "red", marginTop: 8 }}>{error}</p>}
    </div>
  );
}
