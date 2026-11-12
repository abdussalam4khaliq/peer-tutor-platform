"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RichTextEditor from "@/components/rich-text-editor";
import ListEditor from "@/components/list-editor";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  LIMITS,
  cleanLine,
  cleanBlock,
  sameTitle,
  unplannedTopics,
  validateSyllabusTopic,
  validatePlanEntry,
  validatePlans,
} from "@/lib/syllabus";

const SAMPLE_MIN_LENGTH = 200;
const MOTIVATION_MIN_LENGTH = 100;
const GRADES = ["A", "B", "C", "D", "Distinction", "Pass", "Other"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const linkButton = { background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: "0 4px" };
const hint = { fontSize: 13, color: "var(--ink-600)", margin: "0 0 10px" };

export default function ApplyForm({ courses }) {
  const router = useRouter();
  const supabase = createClient();
  const editorRef1 = useRef(null);
  const editorRef2 = useRef(null);
  const submittingRef = useRef(false); // blocks a second submit even before React re-renders

  const [courseId, setCourseId] = useState(courses[0]?.id || "");

  // Syllabus (scheme of work): [{ title, overview }]
  const [syllabus, setSyllabus] = useState([]);
  const [topicTitle, setTopicTitle] = useState("");
  const [topicOverview, setTopicOverview] = useState("");
  const [syllabusError, setSyllabusError] = useState(null);

  // Lesson plan: [{ topic, subtopics, objectives, content }]
  const [plan, setPlan] = useState([]);
  const [planTopic, setPlanTopic] = useState("");
  const [planSubtopics, setPlanSubtopics] = useState([]);
  const [planObjectives, setPlanObjectives] = useState([]);
  const [planContent, setPlanContent] = useState("");
  const [planError, setPlanError] = useState(null);

  const [postingDays, setPostingDays] = useState([]);

  const [sampleTitle1, setSampleTitle1] = useState("");
  const [charCount1, setCharCount1] = useState(0);
  const [sampleTitle2, setSampleTitle2] = useState("");
  const [charCount2, setCharCount2] = useState(0);

  const [grade, setGrade] = useState("");
  const [session, setSession] = useState("");
  const [motivation, setMotivation] = useState("");

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const availableForPlan = unplannedTopics(syllabus, plan);

  // ---- syllabus --------------------------------------------------------
  function addSyllabusTopic() {
    const problem = validateSyllabusTopic({ title: topicTitle, overview: topicOverview }, syllabus);
    if (problem) {
      setSyllabusError(problem);
      return;
    }
    setSyllabus([
      ...syllabus,
      { title: cleanLine(topicTitle, LIMITS.TITLE_MAX), overview: cleanBlock(topicOverview, LIMITS.OVERVIEW_MAX) },
    ]);
    setTopicTitle("");
    setTopicOverview("");
    setSyllabusError(null);
  }

  function moveSyllabusTopic(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= syllabus.length) return;
    const next = [...syllabus];
    [next[index], next[target]] = [next[target], next[index]];
    setSyllabus(next);
  }

  function removeSyllabusTopic(index) {
    const topic = syllabus[index];
    const hasPlan = plan.some((e) => sameTitle(e.topic, topic.title));
    if (hasPlan && !window.confirm(`"${topic.title}" has a lesson plan. Removing the topic removes its lesson plan too. Continue?`)) {
      return;
    }
    setSyllabus(syllabus.filter((_, i) => i !== index));
    setPlan(plan.filter((e) => !sameTitle(e.topic, topic.title)));
    if (sameTitle(planTopic, topic.title)) setPlanTopic("");
  }

  // ---- lesson plan -----------------------------------------------------
  function addPlanEntry() {
    const entry = { topic: planTopic, subtopics: planSubtopics, objectives: planObjectives, content: planContent };
    const problem = validatePlanEntry(entry, syllabus, plan);
    if (problem) {
      setPlanError(problem);
      return;
    }
    const matching = syllabus.find((s) => sameTitle(s.title, planTopic));
    setPlan([
      ...plan,
      {
        topic: matching.title,
        subtopics: planSubtopics,
        objectives: planObjectives,
        content: cleanBlock(planContent, LIMITS.CONTENT_MAX),
      },
    ]);
    setPlanTopic("");
    setPlanSubtopics([]);
    setPlanObjectives([]);
    setPlanContent("");
    setPlanError(null);
  }

  function editPlanEntry(index) {
    const entry = plan[index];
    setPlan(plan.filter((_, i) => i !== index));
    setPlanTopic(entry.topic);
    setPlanSubtopics(entry.subtopics);
    setPlanObjectives(entry.objectives);
    setPlanContent(entry.content);
    setPlanError(null);
  }

  function removePlanEntry(index) {
    setPlan(plan.filter((_, i) => i !== index));
  }

  function toggleDay(day) {
    setPostingDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  // ---- submit ----------------------------------------------------------
  async function handleSubmit(e) {
    e.preventDefault();
    if (submittingRef.current) return;
    setError(null);

    const plansProblem = validatePlans(syllabus, plan);
    if (plansProblem) return setError(plansProblem);
    if (postingDays.length === 0) return setError("Please select at least one day you'll commit to posting content.");

    const text1 = editorRef1.current?.getText() || "";
    const text2 = editorRef2.current?.getText() || "";

    if (!sampleTitle1.trim() || text1.trim().length < SAMPLE_MIN_LENGTH) {
      return setError(`Your first sample topic needs at least ${SAMPLE_MIN_LENGTH} characters.`);
    }
    if (!sampleTitle2.trim() || text2.trim().length < SAMPLE_MIN_LENGTH) {
      return setError(`Your second sample topic needs at least ${SAMPLE_MIN_LENGTH} characters.`);
    }
    if (sampleTitle1.trim().toLowerCase() === sampleTitle2.trim().toLowerCase()) {
      return setError("Please use two different topics for your two samples.");
    }
    if (!grade) return setError("Please select the grade/result you achieved.");
    if (!session.trim()) return setError("Please tell us which session you completed this course.");
    if (motivation.trim().length < MOTIVATION_MIN_LENGTH) {
      return setError(`Please write at least ${MOTIVATION_MIN_LENGTH} characters on why you'd be a good fit.`);
    }

    submittingRef.current = true;
    setLoading(true);

    // One database call saves the application AND marks you as "pending" together,
    // so it can never half-succeed or be saved twice.
    const { error: rpcError } = await supabase.rpc("submit_tutor_application", {
      p_course_id: courseId,
      p_scheme_of_work: syllabus,
      p_lesson_plan: plan,
      p_posting_days: postingDays.map((d) => d.toLowerCase()),
      p_sample_title: sampleTitle1.trim(),
      p_sample_content: sanitizeHtml(editorRef1.current?.getHTML() || ""),
      p_sample_title_2: sampleTitle2.trim(),
      p_sample_content_2: sanitizeHtml(editorRef2.current?.getHTML() || ""),
      p_grade_or_result: grade,
      p_completed_session: session.trim(),
      p_motivation: motivation.trim(),
    });

    if (rpcError) {
      submittingRef.current = false;
      setLoading(false);
      setError(rpcError.message);
      return;
    }

    // Stay locked while the page changes, so nothing can be sent twice.
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

      {/* ---------------- Syllabus ---------------- */}
      <div className="card">
        <h3 style={{ margin: "0 0 4px" }}>Syllabus (scheme of work)</h3>
        <p style={hint}>
          List the main topics you'll cover, in order (at least {LIMITS.MIN_SYLLABUS_TOPICS}). For each one, give a short overview of what it
          is about. You'll plan the details of each topic in the lesson plan below.
        </p>

        <input
          placeholder="Topic name, e.g. Binary Trees"
          value={topicTitle}
          maxLength={LIMITS.TITLE_MAX}
          onChange={(e) => setTopicTitle(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <textarea
          rows={3}
          placeholder="Overview: what does this topic cover, and why does it matter?"
          value={topicOverview}
          maxLength={LIMITS.OVERVIEW_MAX}
          onChange={(e) => setTopicOverview(e.target.value)}
        />
        {syllabusError && <p style={{ color: "red", margin: "6px 0 0" }}>{syllabusError}</p>}
        <button type="button" className="btn btn-sm" onClick={addSyllabusTopic} style={{ marginTop: 8 }}>
          + Add to syllabus
        </button>

        {syllabus.length === 0 && <p style={{ ...hint, marginTop: 12 }}>No topics added yet.</p>}
        {syllabus.map((t, i) => (
          <div key={t.title} style={{ padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <strong style={{ flex: 1, fontSize: 14 }}>{i + 1}. {t.title}</strong>
              <button type="button" onClick={() => moveSyllabusTopic(i, -1)} disabled={i === 0} aria-label="Move up" style={linkButton}>↑</button>
              <button type="button" onClick={() => moveSyllabusTopic(i, 1)} disabled={i === syllabus.length - 1} aria-label="Move down" style={linkButton}>↓</button>
              <button type="button" onClick={() => removeSyllabusTopic(i)} style={{ ...linkButton, color: "#a83a3a" }}>Remove</button>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--ink-600)", whiteSpace: "pre-wrap" }}>{t.overview}</p>
          </div>
        ))}
        <p style={{ fontSize: 12, color: syllabus.length >= LIMITS.MIN_SYLLABUS_TOPICS ? "var(--moss)" : "#b8860b", marginTop: 8 }}>
          {syllabus.length} / {LIMITS.MIN_SYLLABUS_TOPICS} minimum
        </p>
      </div>

      {/* ---------------- Lesson plan ---------------- */}
      <div className="card">
        <h3 style={{ margin: "0 0 4px" }}>Lesson plan</h3>
        <p style={hint}>
          Pick a topic from your syllabus and expand it: the subtopics you'll teach, what students should be able to do afterwards, and the
          content you'll cover. Plan at least {LIMITS.MIN_PLAN_ENTRIES} topics.
        </p>

        {syllabus.length === 0 ? (
          <p style={hint}>Add your syllabus topics above first.</p>
        ) : availableForPlan.length === 0 && !planTopic ? (
          <p style={{ ...hint, color: "var(--moss)" }}>Every syllabus topic has a lesson plan. Add more topics above if you want to plan further.</p>
        ) : (
          <>
            <select value={planTopic} onChange={(e) => { setPlanTopic(e.target.value); setPlanError(null); }} style={{ marginBottom: 10 }}>
              <option value="">Choose a syllabus topic...</option>
              {(planTopic && !availableForPlan.some((t) => sameTitle(t.title, planTopic))
                ? [{ title: planTopic }, ...availableForPlan]
                : availableForPlan
              ).map((t) => (
                <option key={t.title} value={t.title}>{t.title}</option>
              ))}
            </select>

            <ListEditor
              label="Subtopics"
              hint="The parts of this topic, in the order you'll teach them."
              items={planSubtopics}
              onChange={setPlanSubtopics}
              placeholder="e.g. Tree traversal"
              max={LIMITS.MAX_SUBTOPICS}
              maxLength={LIMITS.SUBTOPIC_MAX}
            />
            <ListEditor
              label="Learning objectives"
              hint="What a student should be able to do after this topic, e.g. “Explain how a binary search works”."
              items={planObjectives}
              onChange={setPlanObjectives}
              placeholder="Students will be able to..."
              max={LIMITS.MAX_OBJECTIVES}
              maxLength={LIMITS.OBJECTIVE_MAX}
            />
            <label style={{ display: "block" }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Content</span>
              <textarea
                rows={5}
                placeholder="Describe what you'll cover, the examples you'll use and how you'll explain the key ideas..."
                value={planContent}
                maxLength={LIMITS.CONTENT_MAX}
                onChange={(e) => setPlanContent(e.target.value)}
              />
            </label>
            {planError && <p style={{ color: "red", margin: "6px 0 0" }}>{planError}</p>}
            <button type="button" className="btn btn-sm" onClick={addPlanEntry} style={{ marginTop: 8 }}>
              + Add to lesson plan
            </button>
          </>
        )}

        {plan.map((entry, i) => (
          <details key={entry.topic} style={{ border: "1px solid var(--rule)", borderRadius: 6, padding: "6px 10px", marginTop: 10 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>{entry.topic}</summary>
            <p style={{ margin: "8px 0 2px", fontSize: 13, fontWeight: 600 }}>Subtopics</p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>{entry.subtopics.map((s, j) => <li key={j}>{s}</li>)}</ul>
            <p style={{ margin: "8px 0 2px", fontSize: 13, fontWeight: 600 }}>Learning objectives</p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>{entry.objectives.map((o, j) => <li key={j}>{o}</li>)}</ul>
            <p style={{ margin: "8px 0 2px", fontSize: 13, fontWeight: 600 }}>Content</p>
            <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap" }}>{entry.content}</p>
            <div className="action-row" style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => editPlanEntry(i)}>Edit</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => removePlanEntry(i)}>Remove</button>
            </div>
          </details>
        ))}
        <p style={{ fontSize: 12, color: plan.length >= LIMITS.MIN_PLAN_ENTRIES ? "var(--moss)" : "#b8860b", marginTop: 8 }}>
          {plan.length} / {LIMITS.MIN_PLAN_ENTRIES} topics planned (minimum)
        </p>
      </div>

      {/* ---------------- Posting schedule ---------------- */}
      <div className="card">
        <h3 style={{ margin: "0 0 4px" }}>Posting schedule</h3>
        <p style={hint}>
          Which days will you commit to posting new content? This becomes your weekly quota — missing a specific
          day is fine as long as you hit your total for the week.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {WEEKDAYS.map((day) => (
            <label key={day} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
              <input type="checkbox" checked={postingDays.includes(day)} onChange={() => toggleDay(day)} style={{ width: "auto" }} />
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

      {/* ---------------- Samples ---------------- */}
      <div className="card">
        <h3 style={{ margin: "0 0 10px" }}>Sample topic 1</h3>
        <input placeholder="Topic title" value={sampleTitle1} onChange={(e) => setSampleTitle1(e.target.value)} style={{ marginBottom: 10 }} />
        <RichTextEditor ref={editorRef1} placeholder="Write out this topic as if teaching it to a student..." onUpdate={(t) => setCharCount1(t.length)} />
        <p style={{ fontSize: 13, color: charCount1 < SAMPLE_MIN_LENGTH ? "#b8860b" : "#2a2", margin: "6px 0 0" }}>
          {charCount1} / {SAMPLE_MIN_LENGTH} characters minimum
        </p>
      </div>

      <div className="card">
        <h3 style={{ margin: "0 0 10px" }}>Sample topic 2 (a different topic)</h3>
        <input placeholder="Topic title" value={sampleTitle2} onChange={(e) => setSampleTitle2(e.target.value)} style={{ marginBottom: 10 }} />
        <RichTextEditor ref={editorRef2} placeholder="Write out this topic as if teaching it to a student..." onUpdate={(t) => setCharCount2(t.length)} />
        <p style={{ fontSize: 13, color: charCount2 < SAMPLE_MIN_LENGTH ? "#b8860b" : "#2a2", margin: "6px 0 0" }}>
          {charCount2} / {SAMPLE_MIN_LENGTH} characters minimum
        </p>
      </div>

      {/* ---------------- About you ---------------- */}
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
