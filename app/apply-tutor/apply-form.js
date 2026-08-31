"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ApplyForm({ courses, tutorId }) {
  const router = useRouter();
  const supabase = createClient();

  const [courseId, setCourseId] = useState(courses[0]?.id || "");
  const [sampleTitle, setSampleTitle] = useState("");
  const [sampleContent, setSampleContent] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: insertError } = await supabase.from("tutor_applications").insert({
      tutor_id: tutorId,
      course_id: courseId,
      sample_title: sampleTitle,
      sample_content: sampleContent,
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

      <textarea
        placeholder="Write out the sample content, as if teaching this topic to a student..."
        value={sampleContent}
        onChange={(e) => setSampleContent(e.target.value)}
        rows={10}
        required
      />

      {error && <p style={{ color: "red" }}>{error}</p>}

      <button type="submit" disabled={loading}>
        {loading ? "Submitting..." : "Submit application"}
      </button>
    </form>
  );
}