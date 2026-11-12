"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SettleButton({ profileId, name, owed, bank }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function settle() {
    const ok = window.confirm(
      `Have you already paid ${name} ₦${Number(owed).toLocaleString()} by bank transfer${bank ? ` to ${bank}` : ""}?\n\n` +
        "Only continue if the money has been sent. This closes their old balance."
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("admin_settle_legacy_balance", { p_profile_id: profileId });
    setBusy(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button type="button" className="btn btn-sm" onClick={settle} disabled={busy}>
        {busy ? "Closing..." : "I've paid this — close balance"}
      </button>
      {error && <p style={{ color: "red", margin: "6px 0 0" }}>{error}</p>}
    </div>
  );
}
