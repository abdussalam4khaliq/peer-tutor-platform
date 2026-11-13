"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function WithdrawalForm({ balance }) {
  const router = useRouter();
  const supabase = createClient();

  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount < 1000) {
      setError("Minimum withdrawal is ₦1000.");
      return;
    }
    if (numericAmount > balance) {
      setError("That's more than your available balance.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.rpc("request_withdrawal", { p_amount: numericAmount });
    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setAmount("");
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        type="number"
        min={1000}
        max={balance}
        placeholder="Amount (min ₦1000)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      {error && <p style={{ color: "red" }}>{error}</p>}
      {success && <p style={{ color: "var(--moss)" }}>Request submitted — an admin will process it.</p>}
      <button type="submit" className="btn btn-sm" disabled={busy} style={{ alignSelf: "flex-start" }}>
        {busy ? "Submitting..." : "Request withdrawal"}
      </button>
    </form>
  );
}