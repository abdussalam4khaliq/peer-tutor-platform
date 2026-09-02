"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AskQuestionForm({ courseId }) {
  const router = useRouter();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !body.trim()) {
      setError("Please fill in both a title and your question.");
      return;
    }

    setBusy(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("forum_questions").insert({
      course_id: courseId,
      author_id: user.id,
      title: title.trim(),
      body: body.trim(),
    });

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setTitle("");
    setBody("");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)} style={{ marginBottom: 20 }}>
        Ask a question
      </button>
    );
  }

  return (
    <div className="card">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input placeholder="Question title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea placeholder="What are you stuck on?" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        {error && <p style={{ color: "red" }}>{error}</p>}
        <div className="action-row">
          <button type="submit" className="btn btn-sm" disabled={busy}>{busy ? "Posting..." : "Post question"}</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}