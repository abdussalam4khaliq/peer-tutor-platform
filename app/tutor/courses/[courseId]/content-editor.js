"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ContentEditor({ courseId, initialSections }) {
  const router = useRouter();
  const supabase = createClient();

  const [sections, setSections] = useState(initialSections);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function refresh() {
    router.refresh();
  }

  async function addSection(e) {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setLoading(true);
    setError(null);

    const nextOrder = sections.length > 0 ? Math.max(...sections.map((s) => s.order_index)) + 1 : 0;

    const { data, error } = await supabase
      .from("course_content")
      .insert({ course_id: courseId, title, body, order_index: nextOrder })
      .select()
      .single();

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setSections([...sections, data]);
    setTitle("");
    setBody("");
  }

  async function editSection(section) {
    const newTitle = window.prompt("Section title:", section.title);
    if (newTitle === null) return;
    const newBody = window.prompt("Section content:", section.body);
    if (newBody === null) return;

    await supabase
      .from("course_content")
      .update({ title: newTitle, body: newBody, updated_at: new Date().toISOString() })
      .eq("id", section.id);

    refresh();
  }

  async function deleteSection(section) {
    const ok = window.confirm(`Delete "${section.title}"? This cannot be undone.`);
    if (!ok) return;
    await supabase.from("course_content").delete().eq("id", section.id);
    setSections(sections.filter((s) => s.id !== section.id));
  }

  async function moveSection(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    const current = sections[index];
    const target = sections[targetIndex];

    await supabase.from("course_content").update({ order_index: target.order_index }).eq("id", current.id);
    await supabase.from("course_content").update({ order_index: current.order_index }).eq("id", target.id);

    refresh();
  }

  return (
    <div>
      <h2>Content sections</h2>

      {sections.length === 0 && <p>No sections yet — add your first one below.</p>}

      {sections.map((section, i) => (
        <div key={section.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem", marginBottom: "0.75rem" }}>
          <strong>{section.title}</strong>
          <p style={{ whiteSpace: "pre-wrap", color: "#333" }}>{section.body}</p>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => moveSection(i, -1)} disabled={i === 0}>↑ Move up</button>
            <button type="button" onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1}>↓ Move down</button>
            <button type="button" onClick={() => editSection(section)}>Edit</button>
            <button type="button" onClick={() => deleteSection(section)}>Delete</button>
          </div>
        </div>
      ))}

      <hr style={{ margin: "1.5rem 0" }} />

      <h3>Add a new section</h3>
      <form onSubmit={addSection} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input placeholder="Section title (e.g. 'Big-O Notation')" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <textarea placeholder="Write the content..." value={body} onChange={(e) => setBody(e.target.value)} rows={8} required />
        {error && <p style={{ color: "red" }}>{error}</p>}
        <button type="submit" disabled={loading}>{loading ? "Adding..." : "+ Add section"}</button>
      </form>
    </div>
  );
}