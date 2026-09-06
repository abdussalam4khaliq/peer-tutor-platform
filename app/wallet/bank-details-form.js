"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function BankDetailsForm({ bankName, accountNumber, accountName }) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({ bank_name: bankName, account_number: accountNumber, account_name: accountName });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!form.bank_name.trim() || !form.account_number.trim() || !form.account_name.trim()) {
      setError("Please fill in all three fields.");
      return;
    }

    setBusy(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("profiles")
      .update({
        bank_name: form.bank_name.trim(),
        account_number: form.account_number.trim(),
        account_name: form.account_name.trim(),
      })
      .eq("id", user.id);

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        placeholder="Bank name"
        value={form.bank_name}
        onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
      />
      <input
        placeholder="Account number"
        value={form.account_number}
        onChange={(e) => setForm({ ...form, account_number: e.target.value })}
      />
      <input
        placeholder="Account name"
        value={form.account_name}
        onChange={(e) => setForm({ ...form, account_name: e.target.value })}
      />
      {error && <p style={{ color: "red" }}>{error}</p>}
      {success && <p style={{ color: "var(--moss)" }}>Saved.</p>}
      <button type="submit" className="btn btn-sm" disabled={busy} style={{ alignSelf: "flex-start" }}>
        {busy ? "Saving..." : "Save bank details"}
      </button>
    </form>
  );
}