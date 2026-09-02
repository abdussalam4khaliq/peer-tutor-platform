"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function DeleteButton({ table, id, redirectTo }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    const ok = window.confirm("Delete this? This cannot be undone.");
    if (!ok) return;

    setBusy(true);
    await supabase.from(table).delete().eq("id", id);
    setBusy(false);

    if (redirectTo) {
      router.push(redirectTo);
    }
    router.refresh();
  }

  return (
    <button type="button" className="btn btn-danger btn-sm" onClick={handleDelete} disabled={busy} style={{ marginTop: 8 }}>
      {busy ? "Deleting..." : "Delete"}
    </button>
  );
}