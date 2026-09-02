"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RichTextEditor from "@/components/rich-text-editor";
import { sanitizeHtml } from "@/lib/sanitize";

const MIN_LENGTH = 200;

export default function ApplyForm({ courses, tutorId }) {
  const router = useRouter();
  const supabase = createClient();
  const editorRef = useRef(null);

  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [sampleTitle, setSampleTitle] = useState("");
  const [charCount, setCharCount] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const text = editorRef.current?.getText() || "";
    if (!sampleTitle.trim() || text.trim().length < MIN_LENGTH) {
      setError(`Please write at least ${MIN_LENGTH} characters of sample content.`);
      return;
    }

    setLoading(true);

    const html = sanitizeHtml(editorRef.current?.getHTML() || "");

    const { error: insertError } = await supabase.from("tutor_applications").insert({
      tutor_id: tutorId,
      course_id: courseId,
      sample_title: sampleTitle,
      sample_content: html,
    });

    if (insertError) {
      setLoading(false);
      setError(insertError.message);
      return;
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ tutor_status: "pending" })
      .eq("id", tutorId);

    setLoading(false);

    if (profileError) {
      setError(profileError.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label>
        Course:
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.title}
            </option>
          ))}
        </select>
      </label>

      <input
        placeholder="Sample topic title (e.g. 'Introduction to Recursion')"
        value={sampleTitle}
        onChange={(e) => setSampleTitle(e.target.value)}
        required
      />

      <RichTextEditor
        ref={editorRef}
        placeholder="Write out the sample content, as if teaching this topic to a student..."
        onUpdate={(text) => setCharCount(text.length)}
      />
      <p style={{ fontSize: 13, color: charCount < MIN_LENGTH ? "#b8860b" : "#2a2", margin: 0 }}>
        {charCount} / {MIN_LENGTH} characters minimum
      </p>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <button type="submit" disabled={loading}>
        {loading ? "Submitting..." : "Submit application"}
      </button>
    </form>
  );
}