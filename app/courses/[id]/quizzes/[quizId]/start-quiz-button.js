"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { posthog } from "@/lib/posthog";

export default function StartQuizButton({ quizId, durationMinutes }) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function start() {
    const ok = window.confirm(
      `Start now? You will have ${durationMinutes} minute${durationMinutes === 1 ? "" : "s"} and the clock cannot be paused.`
    );
    if (!ok) return;

    setError(null);
    setBusy(true);
    const { error } = await supabase.rpc("start_quiz_attempt", { p_quiz_id: quizId });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    posthog.capture("quiz_started", { quiz_id: quizId });
    router.refresh();
  }

  return (
    <div>
      <button type="button" className="btn" onClick={start} disabled={busy}>
        {busy ? "Starting..." : "Start quiz"}
      </button>
      {error && <p style={{ color: "#a83a3a" }}>{error}</p>}
    </div>
  );
}
