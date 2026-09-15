"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function EnrollmentPayment({ student, enrollments, plans }) {
  const router = useRouter();
  const supabase = createClient();

  const [selected, setSelected] = useState([]);
  const [planId, setPlanId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const plan = plans.find((p) => p.id === planId);

  function toggle(id) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleConfirm() {
    setError(null);
    setSuccess(false);

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
    const { error } = await supabase.rpc("mark_bundle_paid", {
      p_enrollment_ids: selected,
      p_plan_id: planId,
    });
    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSelected([]);
    setPlanId("");
    setSuccess(true);
    router.refresh();
  }

  const now = new Date();

  return (
    <div className="card">
      <p style={{ margin: "0 0 10px" }}>
        <strong>{student?.full_name}</strong> ({student?.email})
      </p>

      {enrollments.map((e) => {
        const paidActive = e.paid_until && now < new Date(e.paid_until);
        const trialActive = now < new Date(e.trial_ends_at);
        return (
          <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--rule)" }}>
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

      <div className="action-row" style={{ marginTop: 12 }}>
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} style={{ flex: 1, minWidth: 200 }}>
          <option value="">Select plan paid for...</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — ₦{Number(p.price_naira).toLocaleString()}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-sm" onClick={handleConfirm} disabled={busy}>
          {busy ? "Confirming..." : `Confirm payment${selected.length ? ` (${selected.length})` : ""}`}
        </button>
      </div>

      {plan && selected.length > 0 && (
        <p style={{ fontSize: 13, color: "var(--ink-600)", margin: "8px 0 0" }}>
          {selected.length} of up to {plan.course_count} course(s) · {plan.duration_months} month(s) access
        </p>
      )}
      {error && <p style={{ color: "red", marginTop: 8 }}>{error}</p>}
      {success && <p style={{ color: "var(--moss)", marginTop: 8 }}>Payment confirmed.</p>}
    </div>
  );
}