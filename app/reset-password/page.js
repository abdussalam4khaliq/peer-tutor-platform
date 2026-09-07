"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [ready, setReady] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Supabase's client automatically parses the recovery token from the URL
    // (the #access_token=... fragment) and establishes a temporary session for it.
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        setReady(true);
      } else {
        setInvalid(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push("/dashboard"), 2000);
  }

  if (invalid) {
    return (
      <main className="app-container app-container--narrow">
        <h1>Link expired</h1>
        <div className="card">
          <p>This password reset link is invalid or has expired.</p>
          <p><a href="/forgot-password">Request a new one →</a></p>
        </div>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="app-container app-container--narrow">
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main className="app-container app-container--narrow">
      <h1>Set a new password</h1>

      {success ? (
        <div className="card">
          <p>Password updated. Taking you to your dashboard...</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={6}
          />
          {error && <p style={{ color: "red" }}>{error}</p>}
          <button type="submit" className="btn btn-sm" disabled={busy} style={{ alignSelf: "flex-start" }}>
            {busy ? "Saving..." : "Update password"}
          </button>
        </form>
      )}
    </main>
  );
}