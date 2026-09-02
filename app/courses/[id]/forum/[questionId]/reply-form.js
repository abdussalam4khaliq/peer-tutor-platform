"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ReplyForm({ courseId, questionId }) {
  const router = useRouter();
  const supabase = createClient();

  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!body.trim()) {
      setError("Please write a reply.");
      return;
    }

    setBusy(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("forum_replies").insert({
      question_id: questionId,
      course_id: courseId,
      author_id: user.id,
      body: body.trim(),
    });

    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card">
      <textarea placeholder="Write your reply..." rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
      {error && <p style={{ color: "red" }}>{error}</p>}
      <button type="submit" className="btn btn-sm" disabled={busy} style={{ marginTop: 8 }}>
        {busy ? "Posting..." : "Post reply"}
      </button>
    </form>
  );
}