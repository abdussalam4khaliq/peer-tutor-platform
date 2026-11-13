"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const pad = (n) => String(n).padStart(2, "0");

// ISO string -> value for <input type="datetime-local"> in the device's own time zone
function toLocalInput(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let counter = 0;
const newKey = () => `q${Date.now()}_${counter++}`;

function blankQuestion(kind) {
  return {
    key: newKey(),
    kind,
    prompt: "",
    points: kind === "mcq" ? "1" : kind === "short" ? "2" : "5",
    option_a: "",
    option_b: "",
    option_c: "",
    option_d: "",
    correct_option: "",
    accepted_text: "",
  };
}

const KIND_TITLE = {
  mcq: "Multiple choice",
  short: "Short answer",
  upload: "Worked solution (photo upload)",
};

export default function QuizBuilder({ courseId, quiz, initialQuestions = [], locked = false }) {
  const router = useRouter();
  const supabase = createClient();

  const defaultOpen = new Date();
  defaultOpen.setMinutes(0, 0, 0);
  const defaultClose = new Date(defaultOpen.getTime() + 24 * 60 * 60 * 1000);

  const [title, setTitle] = useState(quiz?.title || "");
  const [instructions, setInstructions] = useState(quiz?.instructions || "");
  const [opensAt, setOpensAt] = useState(toLocalInput(quiz?.opens_at || defaultOpen));
  const [closesAt, setClosesAt] = useState(toLocalInput(quiz?.closes_at || defaultClose));
  const [duration, setDuration] = useState(String(quiz?.duration_minutes || 30));
  const [published, setPublished] = useState(quiz?.published || false);
  const [questions, setQuestions] = useState(
    initialQuestions.map((q) => ({
      key: newKey(),
      kind: q.kind,
      prompt: q.prompt,
      points: String(q.points),
      option_a: q.option_a || "",
      option_b: q.option_b || "",
      option_c: q.option_c || "",
      option_d: q.option_d || "",
      correct_option: q.correct_option || "",
      accepted_text: (q.accepted_answers || []).join("\n"),
    }))
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function patchQuestion(key, patch) {
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  }

  function move(index, delta) {
    setQuestions((qs) => {
      const next = [...qs];
      const target = index + delta;
      if (target < 0 || target >= next.length) return qs;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save(e) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) return setError("Give the quiz a title.");
    if (!opensAt || !closesAt) return setError("Set when the quiz opens and closes.");
    if (new Date(closesAt) <= new Date(opensAt)) return setError("The closing time must be after the opening time.");
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600) return setError("Time limit must be a whole number of minutes (1–600).");

    setBusy(true);
    const payload = questions.map((q) => ({
      kind: q.kind,
      prompt: q.prompt,
      points: Number(q.points) || 0,
      ...(q.kind === "mcq"
        ? {
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c,
            option_d: q.option_d,
            correct_option: q.correct_option,
          }
        : {}),
      ...(q.kind === "short"
        ? { accepted_answers: q.accepted_text.split("\n").map((l) => l.trim()).filter(Boolean) }
        : {}),
    }));

    const { error: rpcError } = await supabase.rpc("save_quiz", {
      p_quiz_id: quiz?.id || null,
      p_course_id: courseId,
      p_title: title,
      p_instructions: instructions,
      p_opens_at: new Date(opensAt).toISOString(),
      p_closes_at: new Date(closesAt).toISOString(),
      p_duration_minutes: minutes,
      p_published: published,
      p_questions: payload,
    });
    setBusy(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    router.push(`/tutor/courses/${courseId}/quizzes`);
    router.refresh();
  }

  async function deleteQuiz() {
    if (!quiz?.id) return;
    const ok = window.confirm("Delete this quiz? All student submissions and marks for it will be deleted too. This can't be undone.");
    if (!ok) return;
    setBusy(true);
    const { error: delError } = await supabase.from("quizzes").delete().eq("id", quiz.id);
    setBusy(false);
    if (delError) return setError(delError.message);
    router.push(`/tutor/courses/${courseId}/quizzes`);
    router.refresh();
  }

  return (
    <form onSubmit={save}>
      <div className="card">
        <label htmlFor="quiz-title">Title</label>
        <input id="quiz-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="e.g. Week 4 quiz: Linked lists" style={{ width: "100%" }} />

        <label htmlFor="quiz-instructions">Instructions (optional)</label>
        <textarea id="quiz-instructions" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Anything students should know before starting" style={{ width: "100%" }} />

        <div className="quiz-grid-2">
          <div>
            <label htmlFor="quiz-opens">Opens</label>
            <input id="quiz-opens" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} style={{ width: "100%" }} />
          </div>
          <div>
            <label htmlFor="quiz-closes">Closes</label>
            <input id="quiz-closes" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} style={{ width: "100%" }} />
          </div>
        </div>

        <label htmlFor="quiz-duration">Time limit once a student starts (minutes)</label>
        <input id="quiz-duration" type="number" min={1} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} style={{ width: 140 }} />

        <label style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
          <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} style={{ width: "auto", margin: 0 }} />
          Published (students in this course can see and take it)
        </label>
      </div>

      <h2>Questions</h2>

      {locked && (
        <div className="card" style={{ background: "#fff3d6" }}>
          Students have already started this quiz, so the questions are locked. You can still change the title, instructions, times and time limit.
        </div>
      )}

      {questions.length === 0 && !locked && (
        <p style={{ color: "var(--ink-600)" }}>No questions yet. Add one below.</p>
      )}

      {questions.map((q, i) => (
        <div key={q.key} className="quiz-question-edit">
          <div className="action-row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <strong>{i + 1}. {KIND_TITLE[q.kind]}</strong>
            {!locked && (
              <span className="action-row">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => move(i, 1)} disabled={i === questions.length - 1} aria-label="Move down">↓</button>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setQuestions((qs) => qs.filter((x) => x.key !== q.key))}>Remove</button>
              </span>
            )}
          </div>

          <label>Question</label>
          <textarea rows={2} value={q.prompt} disabled={locked} onChange={(e) => patchQuestion(q.key, { prompt: e.target.value })} style={{ width: "100%" }} />

          <label>Points</label>
          <input type="number" min={0.5} max={100} step={0.5} value={q.points} disabled={locked} onChange={(e) => patchQuestion(q.key, { points: e.target.value })} style={{ width: 120 }} />

          {q.kind === "mcq" && (
            <div>
              {["a", "b", "c", "d"].map((key) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <input
                    type="radio"
                    name={`correct-${q.key}`}
                    checked={q.correct_option === key}
                    disabled={locked}
                    onChange={() => patchQuestion(q.key, { correct_option: key })}
                    style={{ width: "auto", margin: 0 }}
                    aria-label={`Option ${key.toUpperCase()} is correct`}
                  />
                  <input
                    value={q[`option_${key}`]}
                    disabled={locked}
                    onChange={(e) => patchQuestion(q.key, { [`option_${key}`]: e.target.value })}
                    placeholder={`Option ${key.toUpperCase()}`}
                    style={{ flex: 1, margin: 0 }}
                  />
                </div>
              ))}
              <p style={{ margin: "0 0 4px", fontSize: 12.5, color: "var(--ink-400)" }}>Select the circle next to the correct option.</p>
            </div>
          )}

          {q.kind === "short" && (
            <div>
              <label>Accepted answers (one per line)</label>
              <textarea rows={3} value={q.accepted_text} disabled={locked} onChange={(e) => patchQuestion(q.key, { accepted_text: e.target.value })} placeholder={"42\nforty-two"} style={{ width: "100%", marginBottom: 6 }} />
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-400)" }}>
                Capital letters and extra spaces are ignored. Leave this empty if you want to mark answers yourself.
              </p>
            </div>
          )}

          {q.kind === "upload" && (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-400)" }}>
              Students photograph their working on paper and upload it. You mark these by hand after the quiz.
            </p>
          )}
        </div>
      ))}

      {!locked && (
        <div className="action-row" style={{ marginBottom: 20 }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setQuestions((qs) => [...qs, blankQuestion("mcq")])}>+ Multiple choice</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setQuestions((qs) => [...qs, blankQuestion("short")])}>+ Short answer</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setQuestions((qs) => [...qs, blankQuestion("upload")])}>+ Photo upload</button>
        </div>
      )}

      {error && <p style={{ color: "#a83a3a" }}>{error}</p>}

      <div className="action-row">
        <button type="submit" className="btn" disabled={busy}>{busy ? "Saving..." : quiz?.id ? "Save changes" : "Save quiz"}</button>
        <a className="btn btn-outline" href={`/tutor/courses/${courseId}/quizzes`}>Cancel</a>
        {quiz?.id && (
          <button type="button" className="btn btn-danger" onClick={deleteQuiz} disabled={busy}>Delete quiz</button>
        )}
      </div>
    </form>
  );
}
