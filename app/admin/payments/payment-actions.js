"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PaymentActions({ id, status, hasNote }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(fn, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await fn(supabase);
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  const resolve = (action) => (supabase) =>
    supabase.rpc("admin_resolve_payment", { p_payment_id: id, p_action: action });

  const canApprove = status === "mismatch" || status === "failed";
  const canDismiss = status === "mismatch" || status === "failed" || status === "pending";
  const canRefund = status === "success";

  if (!canApprove && !canDismiss && !canRefund && !hasNote) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div className="action-row">
        {canApprove && (
          <button
            type="button"
            className="btn btn-sm"
            disabled={busy}
            onClick={() =>
              run(resolve("approve"), "Unlock access for this payment and credit the tutor? Only do this if you have confirmed the money is really in your Paystack balance.")
            }
          >
            Approve &amp; unlock
          </button>
        )}
        {canDismiss && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={busy}
            onClick={() => run(resolve("dismiss"), "Close this payment without unlocking anything?")}
          >
            Dismiss
          </button>
        )}
        {canRefund && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={busy}
            onClick={() =>
              run(
                (supabase) => supabase.rpc("admin_refund_payment", { p_payment_id: id, p_note: null }),
                "Mark this payment as refunded? This removes the access it gave and reverses the tutor's commission. It does NOT send money back: refund the student in your Paystack dashboard."
              )
            }
          >
            Mark refunded
          </button>
        )}
        {hasNote && (
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => run(resolve("clear_note"))}>
            Clear note
          </button>
        )}
      </div>
      {error && <p style={{ color: "red", marginTop: 6 }}>{error}</p>}
    </div>
  );
}
