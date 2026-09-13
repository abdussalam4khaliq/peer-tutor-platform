"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CourseRequestForm({ departmentId }) {
  const router = useRouter();
  const supabase = createClient();

  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!code.trim() || !title.trim()) {
      setError("Please provide both a course code and title.");
      return;
    }

    setBusy(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("course_requests").insert({
      requester_id: user.id,
      department_id: departmentId,
      code: code.trim(),
      title: title.trim(),
      note: note.trim() || null,
    });

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setCode("");
    setTitle("");
    setNote("");
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input placeholder="Course code (e.g. CSC201)" value={code} onChange={(e) => setCode(e.target.value)} />
      <input placeholder="Course title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="Anything else admins should know? (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <p style={{ color: "red" }}>{error}</p>}
      {success && <p style={{ color: "var(--moss)" }}>Request submitted.</p>}
      <button type="submit" className="btn btn-sm" disabled={busy} style={{ alignSelf: "flex-start" }}>
        {busy ? "Submitting..." : "Submit request"}
      </button>
    </form>
  );
}