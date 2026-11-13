"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function GradeForm({ answerId, maxPoints, initialPoints, initialComment, graded }) {
  const router = useRouter();
  const supabase = createClient();
  const [points, setPoints] = useState(graded ? String(initialPoints) : "");
  const [comment, setComment] = useState(initialComment || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  async function save(e) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const value = Number(points);
    if (points === "" || Number.isNaN(value) || value < 0 || value > maxPoints) {
      setError(`Enter a mark from 0 to ${maxPoints}.`);
      return;
    }

    setBusy(true);
    const { error: rpcError } = await supabase.rpc("grade_quiz_answer", {
      p_answer_id: answerId,
      p_points: value,
      p_comment: comment,
    });
    setBusy(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} style={{ marginTop: 10 }}>
      <div className="action-row" style={{ alignItems: "flex-end" }}>
        <div>
          <label htmlFor={`pts-${answerId}`} style={{ display: "block", marginBottom: 4 }}>Mark (out of {maxPoints})</label>
          <input
            id={`pts-${answerId}`}
            type="number"
            min={0}
            max={maxPoints}
            step={0.5}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            style={{ width: 110, margin: 0 }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <label htmlFor={`cm-${answerId}`} style={{ display: "block", marginBottom: 4 }}>Comment (optional)</label>
          <input
            id={`cm-${answerId}`}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            style={{ width: "100%", margin: 0 }}
          />
        </div>
        <button type="submit" className="btn btn-sm" disabled={busy}>
          {busy ? "Saving..." : graded ? "Update mark" : "Save mark"}
        </button>
      </div>
      {error && <p style={{ color: "#a83a3a", margin: "8px 0 0" }}>{error}</p>}
      {saved && !error && <p style={{ color: "var(--moss)", margin: "8px 0 0" }}>Saved ✓</p>}
    </form>
  );
}
