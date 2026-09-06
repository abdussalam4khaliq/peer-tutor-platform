"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AccountStatusLookup({ setAccountStatus }) {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [account, setAccount] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleLookup(e) {
    e.preventDefault();
    setError(null);
    setAccount(null);
    setBusy(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, status")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    setBusy(false);

    if (error || !data) {
      setError("No account found.");
      return;
    }
    setAccount(data);
  }

  return (
    <div>
      <form onSubmit={handleLookup} className="action-row">
        <input placeholder="Account email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1 }} />
        <button type="submit" className="btn btn-sm" disabled={busy}>{busy ? "Looking up..." : "Find account"}</button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}

      {account && (
        <div className="card">
          <p style={{ margin: "0 0 4px" }}>
            <strong>{account.full_name}</strong> ({account.email}) — {account.role}
          </p>
          <p style={{ margin: "0 0 8px" }}>
            Current status: <span className="badge badge-grey" style={{ textTransform: "capitalize" }}>{account.status}</span>
          </p>
          <div className="action-row">
            <form action={setAccountStatus}>
              <input type="hidden" name="targetId" value={account.id} />
              <input type="hidden" name="status" value="active" />
              <button type="submit" className="btn btn-sm btn-outline">Reinstate</button>
            </form>
            <form action={setAccountStatus}>
              <input type="hidden" name="targetId" value={account.id} />
              <input type="hidden" name="status" value="suspended" />
              <button type="submit" className="btn btn-sm">Suspend</button>
            </form>
            <form action={setAccountStatus}>
              <input type="hidden" name="targetId" value={account.id} />
              <input type="hidden" name="status" value="banned" />
              <button type="submit" className="btn btn-sm btn-danger">Ban</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}