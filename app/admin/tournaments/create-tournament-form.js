"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TournamentScopePicker from "@/components/tournament-scope-picker";

export default function CreateTournamentForm() {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [prize, setPrize] = useState("");
  const [numWinners, setNumWinners] = useState(1);
  const [roleContext, setRoleContext] = useState("student");
  const [scopeValue, setScopeValue] = useState({ scope: "universal", scopeId: null });
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!title.trim() || !prize.trim() || !startsAt || !endsAt) {
      setError("Please fill in title, prize, and both dates.");
      return;
    }
    if (new Date(endsAt) <= new Date(startsAt)) {
      setError("End date must be after start date.");
      return;
    }

    setBusy(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("tournaments").insert({
      title: title.trim(),
      description: description.trim() || null,
      prize_description: prize.trim(),
      num_winners: Number(numWinners),
      role_context: roleContext,
      scope: scopeValue.scope,
      scope_id: scopeValue.scopeId,
      starts_at: new Date(startsAt).toISOString(),
      ends_at: new Date(endsAt).toISOString(),
      created_by: user.id,
    });

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setTitle("");
    setDescription("");
    setPrize("");
    setNumWinners(1);
    setStartsAt("");
    setEndsAt("");
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input placeholder="Tournament title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="Description (optional)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      <input placeholder="Prize (e.g. 'Free month of access')" value={prize} onChange={(e) => setPrize(e.target.value)} />

      <label>
        Number of winners
        <input type="number" min={1} value={numWinners} onChange={(e) => setNumWinners(e.target.value)} />
      </label>

      <label>
        For
        <select value={roleContext} onChange={(e) => setRoleContext(e.target.value)}>
          <option value="student">Students</option>
          <option value="tutor">Tutors</option>
        </select>
      </label>

      <TournamentScopePicker onChange={setScopeValue} />

      <label>
        Starts
        <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
      </label>
      <label>
        Ends
        <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
      </label>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {success && <p style={{ color: "var(--moss)" }}>Tournament created.</p>}

      <button type="submit" className="btn btn-sm" disabled={busy} style={{ alignSelf: "flex-start" }}>
        {busy ? "Creating..." : "Create tournament"}
      </button>
    </form>
  );
}