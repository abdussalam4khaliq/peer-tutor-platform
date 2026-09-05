"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RatingWidget({ targetType, targetId, avgRating, ratingCount, myRating, disabled }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function rate(stars) {
    setError(null);
    setBusy(true);
    const { error } = await supabase.rpc("submit_rating", {
      p_target_type: targetType,
      p_target_id: targetId,
      p_stars: stars,
    });
    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ marginTop: 8 }}>
      <span style={{ fontSize: 13, color: "var(--ink-600)" }}>
        {ratingCount > 0 ? `${avgRating.toFixed(1)}★ (${ratingCount} rating${ratingCount === 1 ? "" : "s"})` : "No ratings yet"}
      </span>

      {!disabled && (
        myRating ? (
          <span style={{ marginLeft: 10, fontSize: 13, color: "var(--moss)" }}>You rated this {myRating}★</span>
        ) : (
          <span style={{ marginLeft: 10 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => rate(n)}
                disabled={busy}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "0 1px" }}
                aria-label={`Rate ${n} stars`}
              >
                ☆
              </button>
            ))}
          </span>
        )
      )}
      {error && <span style={{ color: "red", fontSize: 13, marginLeft: 8 }}>{error}</span>}
    </div>
  );
}