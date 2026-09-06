"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SettingsForm({ settings }) {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    allow_admin_tutoring: settings?.allow_admin_tutoring ?? true,
    course_price_naira: settings?.course_price_naira ?? 1000,
    tutor_commission_naira: settings?.tutor_commission_naira ?? 300,
    referral_bonus_naira: settings?.referral_bonus_naira ?? 100,
    payment_bank_name: settings?.payment_bank_name ?? "",
    payment_account_number: settings?.payment_account_number ?? "",
    payment_account_name: settings?.payment_account_name ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setBusy(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase
      .from("site_settings")
      .update({
        allow_admin_tutoring: form.allow_admin_tutoring,
        course_price_naira: Number(form.course_price_naira),
        tutor_commission_naira: Number(form.tutor_commission_naira),
        referral_bonus_naira: Number(form.referral_bonus_naira),
        payment_bank_name: form.payment_bank_name.trim(),
        payment_account_number: form.payment_account_number.trim(),
        payment_account_name: form.payment_account_name.trim(),
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="checkbox"
          checked={form.allow_admin_tutoring}
          onChange={(e) => setForm({ ...form, allow_admin_tutoring: e.target.checked })}
          style={{ width: "auto" }}
        />
        Allow admins to also tutor a course
      </label>

      <label>
        Course price (₦/month)
        <input type="number" value={form.course_price_naira} onChange={(e) => setForm({ ...form, course_price_naira: e.target.value })} />
      </label>

      <label>
        Tutor commission per paid student (₦)
        <input type="number" value={form.tutor_commission_naira} onChange={(e) => setForm({ ...form, tutor_commission_naira: e.target.value })} />
      </label>

      <label>
        Referral bonus (₦, one-time)
        <input type="number" value={form.referral_bonus_naira} onChange={(e) => setForm({ ...form, referral_bonus_naira: e.target.value })} />
      </label>

      <hr style={{ border: "none", borderTop: "1px solid var(--rule)" }} />
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Bank transfer details (shown to students)</p>

      <input
        placeholder="Bank name"
        value={form.payment_bank_name}
        onChange={(e) => setForm({ ...form, payment_bank_name: e.target.value })}
      />
      <input
        placeholder="Account number"
        value={form.payment_account_number}
        onChange={(e) => setForm({ ...form, payment_account_number: e.target.value })}
      />
      <input
        placeholder="Account name"
        value={form.payment_account_name}
        onChange={(e) => setForm({ ...form, payment_account_name: e.target.value })}
      />

      {error && <p style={{ color: "red" }}>{error}</p>}
      {success && <p style={{ color: "var(--moss)" }}>Settings saved.</p>}

      <button type="submit" className="btn btn-sm" disabled={busy} style={{ alignSelf: "flex-start" }}>
        {busy ? "Saving..." : "Save settings"}
      </button>
    </form>
  );
}