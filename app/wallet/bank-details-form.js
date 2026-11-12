"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function BankDetailsForm({ bankName, bankCode, accountNumber, accountName, verified, payoutReady }) {
  const router = useRouter();
  const hasSaved = Boolean(bankName && accountNumber && accountName);

  const [editing, setEditing] = useState(!(verified && hasSaved));
  const [banks, setBanks] = useState([]);
  const [banksError, setBanksError] = useState(null);
  const [code, setCode] = useState(bankCode || "");
  const [number, setNumber] = useState("");
  const [resolvedName, setResolvedName] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [ready, setReady] = useState(Boolean(payoutReady));

  useEffect(() => {
    if (!editing || banks.length > 0) return;
    fetch("/api/payout/banks")
      .then((r) => r.json())
      .then((d) => {
        if (d.banks) setBanks(d.banks);
        else setBanksError(d.error || "Couldn't load the bank list.");
      })
      .catch(() => setBanksError("Couldn't load the bank list."));
  }, [editing, banks.length]);

  function onChangeInput(setter) {
    return (e) => {
      setter(e.target.value);
      setResolvedName(null);
      setError(null);
    };
  }

  async function post(url) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankCode: code, accountNumber: number.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }

  async function handleVerify() {
    setError(null);
    setNotice(null);
    if (!code || !/^\d{10}$/.test(number.trim())) {
      setError("Choose your bank and enter your 10-digit account number.");
      return;
    }
    setBusy(true);
    const { ok, data } = await post("/api/payout/verify");
    setBusy(false);
    if (!ok) {
      setError(data.error || "We couldn't verify that account.");
      return;
    }
    setResolvedName(data.accountName);
  }

  async function handleSave() {
    setError(null);
    setBusy(true);
    const { ok, data } = await post("/api/payout/save");
    setBusy(false);
    if (!ok) {
      setError(data.error || "Couldn't save your account.");
      return;
    }
    setReady(Boolean(data.payoutReady));
    setNotice(
      data.payoutReady
        ? "Account verified. Your share of every payment will be sent straight to this account."
        : "Your account is verified, but we couldn't finish setting up your payouts yet. Please try again below."
    );
    setEditing(false);
    setNumber("");
    setResolvedName(null);
    router.refresh();
  }

  async function handleRetry() {
    setError(null);
    setBusy(true);
    const res = await fetch("/api/payout/retry", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !data.payoutReady) {
      setError(data.error || "We couldn't finish setting up your payouts.");
      return;
    }
    setReady(true);
    setNotice("Your payouts are set up.");
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="card">
        <p style={{ margin: 0 }}>
          <span className="badge badge-green">Verified</span>{" "}
          <span className={`badge ${ready ? "badge-green" : "badge-amber"}`}>{ready ? "Payouts ready" : "Payout setup incomplete"}</span>
        </p>
        <p style={{ margin: "8px 0 0" }}>
          <strong>{accountName}</strong>
          <br />
          {bankName} · •••••{String(accountNumber).slice(-4)}
        </p>
        {notice && <p style={{ color: ready ? "var(--moss)" : "#8a5a00", margin: "8px 0 0" }}>{notice}</p>}
        {error && <p style={{ color: "red", margin: "8px 0 0" }}>{error}</p>}
        {!ready && (
          <button type="button" className="btn btn-sm" style={{ marginTop: 10, marginRight: 8 }} onClick={handleRetry} disabled={busy}>
            {busy ? "Setting up..." : "Finish setting up payouts"}
          </button>
        )}
        <button
          type="button"
          className="btn btn-outline btn-sm"
          style={{ marginTop: 10 }}
          onClick={() => {
            setNotice(null);
            setEditing(true);
          }}
        >
          Change account
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {hasSaved && !verified && (
        <p style={{ margin: 0, color: "#8a5a00" }}>
          Please re-enter your bank account so we can verify it and set up your payouts. Until then, students can't pay for your courses.
        </p>
      )}

      <select value={code} onChange={onChangeInput(setCode)} disabled={banks.length === 0 && !banksError}>
        <option value="">{banks.length === 0 && !banksError ? "Loading banks..." : "Choose your bank"}</option>
        {banks.map((b) => (
          <option key={b.code} value={b.code}>
            {b.name}
          </option>
        ))}
      </select>
      {banksError && <p style={{ color: "red", margin: 0 }}>{banksError}</p>}

      <input
        inputMode="numeric"
        maxLength={10}
        placeholder="10-digit account number"
        value={number}
        onChange={onChangeInput((v) => setNumber(v.replace(/\D/g, "")))}
      />

      {resolvedName ? (
        <div>
          <p style={{ margin: "0 0 8px" }}>
            Account name: <strong>{resolvedName}</strong>
            <br />
            <span style={{ fontSize: 13, color: "var(--ink-600)" }}>Is this your account? Payouts will go here.</span>
          </p>
          <div className="action-row">
            <button type="button" className="btn btn-sm" onClick={handleSave} disabled={busy}>
              {busy ? "Saving..." : "Yes, save this account"}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setResolvedName(null)} disabled={busy}>
              No, go back
            </button>
          </div>
        </div>
      ) : (
        <div className="action-row">
          <button type="button" className="btn btn-sm" onClick={handleVerify} disabled={busy}>
            {busy ? "Checking..." : "Verify account"}
          </button>
          {verified && hasSaved && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
      )}

      {error && <p style={{ color: "red", margin: 0 }}>{error}</p>}
    </div>
  );
}
