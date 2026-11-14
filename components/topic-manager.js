"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RichTextEditor from "@/components/rich-text-editor";
import VideoEmbed from "@/components/video-embed";
import ListEditor from "@/components/list-editor";
import TopicOutline from "@/components/topic-outline";
import { sanitizeHtml } from "@/lib/sanitize";
import { extractYouTubeId } from "@/lib/youtube";
import { LIMITS, cleanLine, cleanList, normalizeSyllabus, sameTitle, topicDraftFromPlan } from "@/lib/syllabus";

const CUSTOM = "__custom__";

export default function TopicManager({ courseId, topics, syllabus = [], lessonPlan = [] }) {
  const router = useRouter();
  const supabase = createClient();
  const syllabusTopics = normalizeSyllabus(syllabus);

  const [choice, setChoice] = useState(""); // a syllabus title, CUSTOM, or ""
  const [customTitle, setCustomTitle] = useState("");
  const [objectives, setObjectives] = useState([]);
  const [subtopics, setSubtopics] = useState([]);
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const newEditorRef = useRef(null);
  const submittingRef = useRef(false);

  // Syllabus topics that don't have a topic page yet
  const used = topics.map((t) => t.syllabus_topic || t.title);
  const available = syllabusTopics.filter((s) => !used.some((u) => sameTitle(u, s.title)));
  const hasSyllabus = syllabusTopics.length > 0;
  const usingCustom = !hasSyllabus || choice === CUSTOM;
  const title = usingCustom ? cleanLine(customTitle, LIMITS.TITLE_MAX) : choice;

  function refresh() {
    router.refresh();
  }

  function onChoose(value) {
    setChoice(value);
    setError(null);
    if (value && value !== CUSTOM) {
      // Fill in what you planned for this topic. You can still change it.
      const draft = topicDraftFromPlan(lessonPlan, value);
      setObjectives(draft.objectives);
      setSubtopics(draft.subtopics);
    }
  }

  async function addTopic(e) {
    e.preventDefault();
    if (submittingRef.current) return;
    setError(null);

    const html = newEditorRef.current?.getHTML() || "";
    if (!title) {
      setError(hasSyllabus ? "Choose a syllabus topic, or pick \"Other\" and type a title." : "Please add a title.");
      return;
    }
    if (objectives.length === 0) {
      setError("Add at least one learning objective, so students know what they'll learn.");
      return;
    }
    if (newEditorRef.current?.isEmpty()) {
      setError("Please add the notes for this topic.");
      return;
    }

    let videoId = null;
    if (newVideoUrl.trim()) {
      videoId = extractYouTubeId(newVideoUrl.trim());
      if (!videoId) {
        setError("That doesn't look like a valid YouTube link.");
        return;
      }
    }

    submittingRef.current = true;
    setBusy(true);
    const { error: insertError } = await supabase.from("topics").insert({
      course_id: courseId,
      title,
      content: sanitizeHtml(html),
      order_index: topics.length ? Math.max(...topics.map((t) => t.order_index)) + 1 : 0,
      youtube_video_id: videoId,
      learning_objectives: cleanList(objectives, LIMITS.MAX_OBJECTIVES, LIMITS.OBJECTIVE_MAX),
      subtopics: cleanList(subtopics, LIMITS.MAX_SUBTOPICS, LIMITS.SUBTOPIC_MAX),
      syllabus_topic: usingCustom ? null : choice,
    });
    setBusy(false);
    submittingRef.current = false;

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setChoice("");
    setCustomTitle("");
    setObjectives([]);
    setSubtopics([]);
    setNewVideoUrl("");
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

          {hasSyllabus && (
            <select value={choice} onChange={(e) => onChoose(e.target.value)} style={{ marginBottom: 10 }}>
              <option value="">Choose a topic from your syllabus...</option>
              {available.map((s) => (
                <option key={s.title} value={s.title}>{s.title}</option>
              ))}
              <option value={CUSTOM}>Other (not in my syllabus)</option>
            </select>
          )}
          {hasSyllabus && available.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--moss)", margin: "0 0 10px" }}>
              Every syllabus topic now has a page. You can still add extra topics with &quot;Other&quot;.
            </p>
          )}

          {usingCustom && (
            <input
              placeholder="Topic title"
              value={customTitle}
              maxLength={LIMITS.TITLE_MAX}
              onChange={(e) => setCustomTitle(e.target.value)}
              style={{ marginBottom: 10 }}
            />
          )}

          {(title || !hasSyllabus) && (
            <>
              <ListEditor
                label="Learning objectives"
                hint="Shown to students first: what they will be able to do after this topic."
                items={objectives}
                onChange={setObjectives}
                placeholder="Students will be able to..."
                max={LIMITS.MAX_OBJECTIVES}
                maxLength={LIMITS.OBJECTIVE_MAX}
              />
              <ListEditor
                label="Subtopics"
                hint="The parts this topic covers (optional)."
                items={subtopics}
                onChange={setSubtopics}
                placeholder="e.g. Tree traversal"
                max={LIMITS.MAX_SUBTOPICS}
                maxLength={LIMITS.SUBTOPIC_MAX}
              />
            </>
          )}

          <p style={{ margin: "0 0 4px", fontWeight: 600, fontSize: 14 }}>Notes</p>
          <RichTextEditor ref={newEditorRef} placeholder="Write the topic notes here..." />
          <input
            placeholder="YouTube video link (optional)"
            value={newVideoUrl}
            onChange={(e) => setNewVideoUrl(e.target.value)}
            style={{ marginTop: 10 }}
          />
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

function TopicItem({ topic, isFirst, isLast, busy, onMoveUp, onMoveDown, onDelete, onSaved }) {
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(topic.title);
  const [objectives, setObjectives] = useState(Array.isArray(topic.learning_objectives) ? topic.learning_objectives : []);
  const [subtopics, setSubtopics] = useState(Array.isArray(topic.subtopics) ? topic.subtopics : []);
  const [videoUrl, setVideoUrl] = useState(topic.youtube_video_id ? `https://youtu.be/${topic.youtube_video_id}` : "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const editRef = useRef(null);

  async function handleSave() {
    setSaveError(null);

    let videoId = null;
    if (videoUrl.trim()) {
      videoId = extractYouTubeId(videoUrl.trim());
      if (!videoId) {
        setSaveError("That doesn't look like a valid YouTube link.");
        return;
      }
    }
    if (!title.trim()) {
      setSaveError("The topic needs a title.");
      return;
    }

    setSaving(true);
    const html = editRef.current?.getHTML() || "";
    const { error } = await supabase
      .from("topics")
      .update({
        title: title.trim(),
        content: sanitizeHtml(html),
        youtube_video_id: videoId,
        learning_objectives: cleanList(objectives, LIMITS.MAX_OBJECTIVES, LIMITS.OBJECTIVE_MAX),
        subtopics: cleanList(subtopics, LIMITS.MAX_SUBTOPICS, LIMITS.SUBTOPIC_MAX),
        updated_at: new Date().toISOString(),
      })
      .eq("id", topic.id);
    setSaving(false);

    if (error) {
      setSaveError(error.message);
      return;
    }
    setEditing(false);
    onSaved();
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
        {editing ? (
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1 }} />
        ) : (
          <span>
            <strong>{topic.title}</strong>{" "}
            {topic.rating_count > 0 && (
              <span className={`badge ${topic.rating_count >= 5 && topic.avg_rating < 2.5 ? "badge-amber" : "badge-grey"}`}>
                {topic.avg_rating}★ ({topic.rating_count})
              </span>
            )}
            {topic.hidden && <span className="badge badge-grey" style={{ marginLeft: 6 }}>Unpublished</span>}
            {topic.youtube_video_id && <span className="badge badge-grey" style={{ marginLeft: 6 }}>📹 Video</span>}
          </span>
        )}
        <div className="action-row" style={{ flexShrink: 0 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={onMoveUp} disabled={isFirst || busy}>↑</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={onMoveDown} disabled={isLast || busy}>↓</button>
        </div>
      </div>

      {editing ? (
        <>
          <ListEditor
            label="Learning objectives"
            items={objectives}
            onChange={setObjectives}
            placeholder="Students will be able to..."
            max={LIMITS.MAX_OBJECTIVES}
            maxLength={LIMITS.OBJECTIVE_MAX}
          />
          <ListEditor
            label="Subtopics"
            items={subtopics}
            onChange={setSubtopics}
            placeholder="e.g. Tree traversal"
            max={LIMITS.MAX_SUBTOPICS}
            maxLength={LIMITS.SUBTOPIC_MAX}
          />
          <p style={{ margin: "0 0 4px", fontWeight: 600, fontSize: 14 }}>Notes</p>
          <RichTextEditor ref={editRef} initialContent={topic.content} placeholder="Topic notes..." />
          <input
            placeholder="YouTube video link (optional)"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            style={{ marginTop: 10 }}
          />
          {saveError && <p style={{ color: "red" }}>{saveError}</p>}
          <div className="action-row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <TopicOutline objectives={topic.learning_objectives} subtopics={topic.subtopics} />
          <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(topic.content) }} />
          <VideoEmbed videoId={topic.youtube_video_id} />
          <div className="action-row">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(true)} disabled={busy}>Edit</button>
            <button type="button" className="btn btn-danger btn-sm" onClick={onDelete} disabled={busy}>
              {busy ? "Deleting..." : "Delete"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
