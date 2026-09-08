"use client";

import { useState } from "react";

export default function ManualEntryForm({ addManualEntry }) {
  const [type, setType] = useState("manual_expense");

  return (
    <form action={addManualEntry} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label>
        Type
        <select name="type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="manual_expense">Expense (e.g. hosting, ads)</option>
          <option value="manual_income">Other income</option>
        </select>
      </label>
      <input name="description" placeholder="Description" required />
      <input name="amount" type="number" min={1} step="0.01" placeholder="Amount (₦)" required />
      <button type="submit" className="btn btn-sm" style={{ alignSelf: "flex-start" }}>
        Add entry
      </button>
    </form>
  );
}