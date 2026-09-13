"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RichTextEditor from "@/components/rich-text-editor";
import { sanitizeHtml } from "@/lib/sanitize";

const SAMPLE_MIN_LENGTH = 200;
const MOTIVATION_MIN_LENGTH = 100;
const MIN_SCHEME_TOPICS = 5;
const MIN_WEEKS = 12;
const GRADES = ["A", "B", "C", "D", "Distinction", "Pass", "Other"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function ApplyForm({ courses, tutorId }) {
  const router = useRouter();
  const supabase = createClient();
  const editorRef1 = useRef(null);
  const editorRef2 = useRef(null);

  const [courseId, setCourseId] = useState(courses[0]?.id || "");

  const [schemeInput, setSchemeInput] = useState("");
  const [schemeOfWork, setSchemeOfWork] = useState([]);

  const [sampleTitle1, setSampleTitle1] = useState("");
  const [charCount1, setCharCount1] = useState(0);
  const [sampleTitle2, setSampleTitle2] = useState("");
  const [charCount2, setCharCount2] = useState(0);

  const [weekInput, setWeekInput] = useState("");
  const [lessonPlan, setLessonPlan] = useState([]);
  const [postingDays, setPostingDays] = useState([]);

  const [grade, setGrade] = useState("");
  const [session, setSession] = useState("");
  const [motivation, setMotivation] = useState("");

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  function addSchemeTopic() {
    const t = schemeInput.trim();
    if (!t) return;
    setSchemeOfWork([...schemeOfWork, t]);
    setSchemeInput("");
  }

  function removeSchemeTopic(index) {
    setSchemeOfWork(schemeOfWork.filter((_, i) => i !== index));
  }

  function addWeek() {
    const t = weekInput.trim();
    if (!t) return;
    setLessonPlan([...lessonPlan, t]);
    setWeekInput("");
  }

  function removeWeek(index) {
    setLessonPlan(lessonPlan.filter((_, i) => i !== index));
  }

  function toggleDay(day) {
    setPostingDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (schemeOfWork.length < MIN_SCHEME_TOPICS) {
      setError(`Please list at least ${MIN_SCHEME_TOPICS} topics in your scheme of work.`);
      return;
    }
    if (lessonPlan.length < MIN_WEEKS) {
      setError(`Please plan out at least ${MIN_WEEKS} weeks (a typical semester).`);
      return;
    }
    if (postingDays.length === 0) {
      setError("Please select at least one day you'll commit to posting content.");
      return;
    }

    const text1 = editorRef1.current?.getText() || "";
    const text2 = editorRef2.current?.getText() || "";

    if (!sampleTitle1.trim() || text1.trim().length < SAMPLE_MIN_LENGTH) {
      setError(`Your first sample topic needs at least ${SAMPLE_MIN_LENGTH} characters.`);
      return;
    }
    if (!sampleTitle2.trim() || text2.trim().length < SAMPLE_MIN_LENGTH) {
      setError(`Your second sample topic needs at least ${SAMPLE_MIN_LENGTH} characters.`);
      return;
    }
    if (sampleTitle1.trim().toLowerCase() === sampleTitle2.trim().toLowerCase()) {
      setError("Please use two different topics for your two samples.");
      return;
    }
    if (!grade) {
      setError("Please select the grade/result you achieved.");
      return;
    }
    if (!session.trim()) {
      setError("Please tell us which session you completed this course.");
      return;
    }
    if (motivation.trim().length < MOTIVATION_MIN_LENGTH) {
      setError(`Please write at least ${MOTIVATION_MIN_LENGTH} characters on why you'd be a good fit.`);
      return;
    }

    setLoading(true);

    const { error: insertError } = await supabase.from("tutor_applications").insert({
      tutor_id: tutorId,
      course_id: courseId,
      scheme_of_work: schemeOfWork,
      lesson_plan: lessonPlan,
      posting_days: postingDays.map((d) => d.toLowerCase()),
      sample_title: sampleTitle1,
      sample_content: sanitizeHtml(editorRef1.current?.getHTML() || ""),
      sample_title_2: sampleTitle2,
      sample_content_2: sanitizeHtml(editorRef2.current?.getHTML() || ""),
      grade_or_result: grade,
      completed_session: session.trim(),
      motivation: motivation.trim(),
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
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <label>
        Course:
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>{c.code} — {c.title}</option>
          ))}
        </select>
      </label>

      <div className="card">
        <h3 style={{ margin: "0 0 4px" }}>Scheme of work</h3>
        <p style={{ fontSize: 13, color: "var(--ink-600)", margin: "0 0 10px" }}>
          List the topics you'd plan to cover, in order (at least {MIN_SCHEME_TOPICS}).
        </p>
        <div className="action-row" style={{ marginBottom: 10 }}>
          <input
            placeholder="Topic name"
            value={schemeInput}
            onChange={(e) => setSchemeInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSchemeTopic(); } }}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn btn-sm" onClick={addSchemeTopic}>+ Add</button>
        </div>
        {schemeOfWork.length === 0 && <p style={{ fontSize: 13, color: "var(--ink-600)" }}>No topics added yet.</p>}
        {schemeOfWork.map((t, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--rule)" }}>
            <span style={{ fontSize: 14 }}>{i + 1}. {t}</span>
            <button type="button" onClick={() => removeSchemeTopic(i)} style={{ background: "none", border: "none", color: "#a83a3a", cursor: "pointer", fontSize: 13 }}>Remove</button>
          </div>
        ))}
        <p style={{ fontSize: 12, color: schemeOfWork.length >= MIN_SCHEME_TOPICS ? "var(--moss)" : "#b8860b", marginTop: 8 }}>
          {schemeOfWork.length} / {MIN_SCHEME_TOPICS} minimum
        </p>
      </div>

            <div className="card">
        <h3 style={{ margin: "0 0 4px" }}>Lesson plan (semester schedule)</h3>
        <p style={{ fontSize: 13, color: "var(--ink-600)", margin: "0 0 10px" }}>
          Describe what you'll cover each week for a typical {MIN_WEEKS}-15 week semester, starting from Week 1.
        </p>
        <div className="action-row" style={{ marginBottom: 10 }}>
          <input
            placeholder={`Week ${lessonPlan.length + 1}: what will you cover?`}
            value={weekInput}
            onChange={(e) => setWeekInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWeek(); } }}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn btn-sm" onClick={addWeek}>+ Add week</button>
        </div>
        {lessonPlan.map((w, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--rule)" }}>
            <span style={{ fontSize: 14 }}>Week {i + 1}: {w}</span>
            <button type="button" onClick={() => removeWeek(i)} style={{ background: "none", border: "none", color: "#a83a3a", cursor: "pointer", fontSize: 13 }}>Remove</button>
          </div>
        ))}
        <p style={{ fontSize: 12, color: lessonPlan.length >= MIN_WEEKS ? "var(--moss)" : "#b8860b", marginTop: 8 }}>
          {lessonPlan.length} / {MIN_WEEKS} minimum weeks
        </p>
      </div>

      <div className="card">
        <h3 style={{ margin: "0 0 4px" }}>Posting schedule</h3>
        <p style={{ fontSize: 13, color: "var(--ink-600)", margin: "0 0 10px" }}>
          Which days will you commit to posting new content? This becomes your weekly quota — missing a specific
          day is fine as long as you hit your total for the week.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {WEEKDAYS.map((day) => (
            <label key={day} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={postingDays.includes(day)}
                onChange={() => toggleDay(day)}
                style={{ width: "auto" }}
              />
              {day}
            </label>
          ))}
        </div>
        {postingDays.length > 0 && (
          <p style={{ fontSize: 13, color: "var(--moss)", marginTop: 8 }}>
            Weekly quota: {postingDays.length} update{postingDays.length === 1 ? "" : "s"}/week
          </p>
        )}
      </div>

      <div className="card">
        <h3 style={{ margin: "0 0 10px" }}>Sample topic 1</h3>
        <input
          placeholder="Topic title"
          value={sampleTitle1}
          onChange={(e) => setSampleTitle1(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <RichTextEditor ref={editorRef1} placeholder="Write out this topic as if teaching it to a student..." onUpdate={(t) => setCharCount1(t.length)} />
        <p style={{ fontSize: 13, color: charCount1 < SAMPLE_MIN_LENGTH ? "#b8860b" : "#2a2", margin: "6px 0 0" }}>
          {charCount1} / {SAMPLE_MIN_LENGTH} characters minimum
        </p>
      </div>

      <div className="card">
        <h3 style={{ margin: "0 0 10px" }}>Sample topic 2 (a different topic)</h3>
        <input
          placeholder="Topic title"
          value={sampleTitle2}
          onChange={(e) => setSampleTitle2(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <RichTextEditor ref={editorRef2} placeholder="Write out this topic as if teaching it to a student..." onUpdate={(t) => setCharCount2(t.length)} />
        <p style={{ fontSize: 13, color: charCount2 < SAMPLE_MIN_LENGTH ? "#b8860b" : "#2a2", margin: "6px 0 0" }}>
          {charCount2} / {SAMPLE_MIN_LENGTH} characters minimum
        </p>
      </div>

      <div className="card">
        <h3 style={{ margin: "0 0 10px" }}>A bit more about you</h3>
        <label>
          Grade/result you achieved in this course
          <select value={grade} onChange={(e) => setGrade(e.target.value)}>
            <option value="">Select...</option>
            {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
        <label style={{ display: "block", marginTop: 10 }}>
          Session you completed it
          <input placeholder="e.g. 2023/2024" value={session} onChange={(e) => setSession(e.target.value)} />
        </label>
        <label style={{ display: "block", marginTop: 10 }}>
          Why would you be a good fit to teach this course?
          <textarea rows={4} value={motivation} onChange={(e) => setMotivation(e.target.value)} placeholder="What makes you a good tutor for this specific course..." />
        </label>
        <p style={{ fontSize: 12, color: motivation.length >= MOTIVATION_MIN_LENGTH ? "var(--moss)" : "#b8860b", margin: "4px 0 0" }}>
          {motivation.length} / {MOTIVATION_MIN_LENGTH} characters minimum
        </p>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <button type="submit" className="btn" disabled={loading}>
        {loading ? "Submitting..." : "Submit application"}
      </button>
    </form>
  );
}