"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RichTextEditor from "@/components/rich-text-editor";
import { sanitizeHtml } from "@/lib/sanitize";

export default function TopicManager({ courseId, topics }) {
  const router = useRouter();
  const supabase = createClient();

  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const newEditorRef = useRef(null);

  function refresh() {
    router.refresh();
  }

  async function addTopic(e) {
    e.preventDefault();
    setError(null);

    const html = newEditorRef.current?.getHTML() || "";
    if (!newTitle.trim() || newEditorRef.current?.isEmpty()) {
      setError("Please add a title and some content.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.from("topics").insert({
      course_id: courseId,
      title: newTitle.trim(),
      content: sanitizeHtml(html),
      order_index: topics.length,
    });
    setBusy(false);

    if (error) {
      setError(error.message);
      return;
    }

    setNewTitle("");
    newEditorRef.current?.clear();
    refresh();
  }

  async function deleteTopic(topic) {
    const ok = window.confirm(`Delete "${topic.title}"? This cannot be undone.`);
    if (!ok) return;
    setBusyId(topic.id);
    await supabase.from("topics").delete().eq("id", topic.id);
    setBusyId(null);
    refresh();
  }

  async function moveTopic(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= topics.length) return;
    const a = topics[index];
    const b = topics[targetIndex];
    setBusyId(a.id);
    await supabase.from("topics").update({ order_index: b.order_index }).eq("id", a.id);
    await supabase.from("topics").update({ order_index: a.order_index }).eq("id", b.id);
    setBusyId(null);
    refresh();
  }

  return (
    <div>
      <div className="card">
        <form onSubmit={addTopic}>
          <h3 style={{ margin: "0 0 10px" }}>Add a topic</h3>
          <input
            placeholder="Topic title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            style={{ marginBottom: 10 }}
          />
          <RichTextEditor ref={newEditorRef} placeholder="Write the topic content here..." />
          {error && <p style={{ color: "red" }}>{error}</p>}
          <button type="submit" className="btn" disabled={busy} style={{ marginTop: 10 }}>
            {busy ? "Adding..." : "+ Add topic"}
          </button>
        </form>
      </div>

      {topics.length === 0 && <p>No topics yet — add your first one above.</p>}

      {topics.map((topic, index) => (
        <TopicItem
          key={topic.id}
          courseId={courseId}
          topic={topic}
          isFirst={index === 0}
          isLast={index === topics.length - 1}
          busy={busyId === topic.id}
          onMoveUp={() => moveTopic(index, -1)}
          onMoveDown={() => moveTopic(index, 1)}
          onDelete={() => deleteTopic(topic)}
          onSaved={refresh}
        />
      ))}
    </div>
  );
}

function TopicItem({ courseId, topic, isFirst, isLast, busy, onMoveUp, onMoveDown, onDelete, onSaved }) {
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(topic.title);
  const [saving, setSaving] = useState(false);
  const editRef = useRef(null);

  async function handleSave() {
    setSaving(true);
    const html = editRef.current?.getHTML() || "";
    await supabase
      .from("topics")
      .update({ title, content: sanitizeHtml(html), updated_at: new Date().toISOString() })
      .eq("id", topic.id);
    setSaving(false);
    setEditing(false);
    onSaved();
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
        {editing ? (
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1 }} />
        ) : (
          <strong>{topic.title}</strong>
        )}
        <div className="action-row" style={{ flexShrink: 0 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={onMoveUp} disabled={isFirst || busy}>↑</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onMoveDown} disabled={isLast || busy}>↓</button>
        </div>
      </div>

      {editing ? (
        <>
          <RichTextEditor ref={editRef} initialContent={topic.content} placeholder="Topic content..." />
          <div className="action-row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(topic.content) }} />
          <div className="action-row">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(true)} disabled={busy}>Edit</button>
            <a className="btn btn-outline btn-sm" href={`/tutor/courses/${courseId}/topics/${topic.id}/questions`}>
              Manage test ({topic.questions_per_test} questions)
            </a>
            <button type="button" className="btn btn-danger btn-sm" onClick={onDelete} disabled={busy}>
              {busy ? "Deleting..." : "Delete"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}