"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }

    setBusy(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    setBusy(false);

    // Always show the same success message, whether or not the email exists —
    // this avoids leaking which emails have accounts on the platform.
    if (!error) {
      setSent(true);
    } else {
      setError(error.message);
    }
  }

  return (
    <main className="app-container app-container--narrow">
      <h1>Reset your password</h1>

      {sent ? (
        <div className="card">
          <p>If an account exists for that email, a reset link has been sent. Check your inbox.</p>
          <p><a href="/login">← Back to login</a></p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="email"
            placeholder="Your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && <p style={{ color: "red" }}>{error}</p>}
          <button type="submit" className="btn btn-sm" disabled={busy} style={{ alignSelf: "flex-start" }}>
            {busy ? "Sending..." : "Send reset link"}
          </button>
          <p style={{ fontSize: 14 }}><a href="/login">← Back to login</a></p>
        </form>
      )}
    </main>
  );
}