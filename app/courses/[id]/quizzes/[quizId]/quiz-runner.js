"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { posthog } from "@/lib/posthog";
import { formatPoints } from "@/lib/format";

const BUCKET = "quiz-answers";
const MAX_IMAGE_SIDE = 1600;

function formatClock(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

// Shrinks a phone photo (often 4-8 MB) to a ~300 KB JPEG before uploading.
async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file could not be read as an image."));
      el.src = url;
    });
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("Could not process that image.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function QuizRunner({ attemptId, userId, title, deadlineIso, serverNowIso }) {
  const router = useRouter();
  const supabase = createClient();

  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({});
  const [saveState, setSaveState] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const deadlineMs = new Date(deadlineIso).getTime();
  // How far the server's clock is ahead of / behind this device's clock.
  const clockOffset = useRef(new Date(serverNowIso).getTime() - Date.now());
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.ceil((deadlineMs - (Date.now() + clockOffset.current)) / 1000)
  );

  const answersRef = useRef({});
  const debounceTimers = useRef({});
  const submittedRef = useRef(false);
  const lastFailRef = useRef(0);

  // ---------- load questions + anything already saved ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: qs, error } = await supabase.rpc("get_quiz_questions", { p_attempt_id: attemptId });
      if (cancelled) return;
      if (error) {
        setLoadError(error.message);
        return;
      }

      const { data: saved } = await supabase
        .from("quiz_answers")
        .select("question_id, selected_option, answer_text, image_path")
        .eq("attempt_id", attemptId);

      const restored = {};
      for (const row of saved || []) {
        let previewUrl = null;
        if (row.image_path) {
          const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(row.image_path, 3600);
          previewUrl = signed?.signedUrl || null;
        }
        restored[row.question_id] = {
          option: row.selected_option || null,
          text: row.answer_text || "",
          imagePath: row.image_path || null,
          previewUrl,
        };
      }
      if (cancelled) return;
      answersRef.current = restored;
      setAnswers(restored);
      setQuestions(qs);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  // ---------- saving ----------
  const saveOne = useCallback(
    async (qid) => {
      const a = answersRef.current[qid] || {};
      setSaveState((s) => ({ ...s, [qid]: "saving" }));
      const { error } = await supabase.rpc("save_quiz_answer", {
        p_attempt_id: attemptId,
        p_question_id: qid,
        p_option: a.option || null,
        p_text: a.text ? a.text : null,
        p_image_path: a.imagePath || null,
      });
      setSaveState((s) => ({ ...s, [qid]: error ? "error" : "saved" }));
      return !error;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attemptId]
  );

  function update(qid, patch, { immediate = false } = {}) {
    const next = { ...(answersRef.current[qid] || {}), ...patch };
    answersRef.current = { ...answersRef.current, [qid]: next };
    setAnswers(answersRef.current);

    clearTimeout(debounceTimers.current[qid]);
    if (immediate) {
      saveOne(qid);
    } else {
      setSaveState((s) => ({ ...s, [qid]: "pending" }));
      debounceTimers.current[qid] = setTimeout(() => saveOne(qid), 700);
    }
  }

  // ---------- submitting ----------
  const finish = useCallback(
    async () => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      setSubmitError(null);

      Object.values(debounceTimers.current).forEach(clearTimeout);
      // Push everything once more so nothing typed in the last second is lost.
      // (Errors are ignored here: if time is up the server keeps what it already has.)
      await Promise.all(
        Object.keys(answersRef.current).map((qid) => saveOne(qid).catch(() => false))
      );

      const { error } = await supabase.rpc("submit_quiz_attempt", { p_attempt_id: attemptId });
      if (error) {
        submittedRef.current = false;
        lastFailRef.current = Date.now();
        setSubmitting(false);
        setSubmitError(error.message);
        return;
      }
      posthog.capture("quiz_submitted", { attempt_id: attemptId });
      router.refresh();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attemptId, saveOne]
  );

  function handleSubmitClick() {
    if (!questions) return;
    const unanswered = questions.filter((q) => {
      const a = answers[q.id];
      return !a || (!a.option && !(a.text || "").trim() && !a.imagePath);
    }).length;
    const msg = unanswered
      ? `You have ${unanswered} unanswered question${unanswered === 1 ? "" : "s"}. Submit anyway? You can't change your answers afterwards.`
      : "Submit your quiz? You can't change your answers afterwards.";
    if (window.confirm(msg)) finish();
  }

  // ---------- countdown ----------
  useEffect(() => {
    const timer = setInterval(() => {
      const left = Math.ceil((deadlineMs - (Date.now() + clockOffset.current)) / 1000);
      setSecondsLeft(left);
      if (left <= 0 && questions && Date.now() - lastFailRef.current > 4000) finish();
    }, 1000);
    return () => clearInterval(timer);
  }, [deadlineMs, finish, questions]);

  // ---------- warn before leaving mid-quiz ----------
  useEffect(() => {
    function warn(e) {
      if (submittedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // ---------- photo upload ----------
  async function handleFile(qid, file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setSaveState((s) => ({ ...s, [qid]: "error" }));
      return;
    }
    setSaveState((s) => ({ ...s, [qid]: "uploading" }));
    try {
      const blob = await shrinkImage(file);
      const path = `${userId}/${attemptId}/${qid}-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      update(qid, { imagePath: path, previewUrl: URL.createObjectURL(blob) }, { immediate: true });
    } catch (err) {
      setSaveState((s) => ({ ...s, [qid]: "error" }));
    }
  }

  // ---------- render ----------
  if (loadError) {
    return (
      <div className="card">
        <p>{loadError}</p>
        <button type="button" className="btn btn-sm" onClick={() => router.refresh()}>Reload</button>
      </div>
    );
  }
  if (!questions) return <p>Loading questions...</p>;

  const urgent = secondsLeft <= 60;
  const warning = secondsLeft <= 300;

  return (
    <div>
      <div className={`quiz-bar${urgent ? " quiz-bar--urgent" : warning ? " quiz-bar--warning" : ""}`}>
        <strong className="quiz-bar__title">{title}</strong>
        <span className="quiz-bar__clock" role="timer" aria-label="Time left">
          ⏱ {formatClock(secondsLeft)}
        </span>
      </div>

      {questions.map((q, i) => {
        const a = answers[q.id] || {};
        const state = saveState[q.id];
        return (
          <div key={q.id} className="card">
            <p style={{ fontWeight: 600, margin: "0 0 4px", whiteSpace: "pre-wrap" }}>
              {i + 1}. {q.q_prompt}
            </p>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--ink-400)" }}>
              {formatPoints(q.q_points)} point{Number(q.q_points) === 1 ? "" : "s"}
            </p>

            {q.q_kind === "mcq" &&
              ["a", "b", "c", "d"].map((key) => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
                  <input
                    type="radio"
                    name={q.id}
                    checked={a.option === key}
                    onChange={() => update(q.id, { option: key }, { immediate: true })}
                    style={{ width: "auto", margin: 0 }}
                  />
                  <span>{q[`q_option_${key}`]}</span>
                </label>
              ))}

            {q.q_kind === "short" && (
              <textarea
                rows={2}
                maxLength={5000}
                value={a.text || ""}
                placeholder="Type your answer"
                onChange={(e) => update(q.id, { text: e.target.value })}
                onBlur={() => {
                  clearTimeout(debounceTimers.current[q.id]);
                  saveOne(q.id);
                }}
                style={{ width: "100%", margin: 0 }}
              />
            )}

            {q.q_kind === "upload" && (
              <div>
                <p style={{ margin: "0 0 8px", fontSize: 14, color: "var(--ink-600)" }}>
                  Solve it on paper, take a clear photo, and upload it here.
                </p>
                {a.previewUrl && (
                  <img src={a.previewUrl} alt="Your uploaded working" className="quiz-photo" />
                )}
                <div className="action-row" style={{ marginBottom: 10 }}>
                  <label className="btn btn-outline btn-sm" style={{ cursor: "pointer" }}>
                    {a.imagePath ? "Replace photo" : "Upload photo"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        handleFile(q.id, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {a.imagePath && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => update(q.id, { imagePath: null, previewUrl: null }, { immediate: true })}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  maxLength={5000}
                  value={a.text || ""}
                  placeholder="Optional note to your tutor"
                  onChange={(e) => update(q.id, { text: e.target.value })}
                  onBlur={() => {
                    clearTimeout(debounceTimers.current[q.id]);
                    saveOne(q.id);
                  }}
                  style={{ width: "100%", margin: 0 }}
                />
              </div>
            )}

            <p className="quiz-save">
              {state === "saving" && "Saving..."}
              {state === "uploading" && "Uploading photo..."}
              {state === "saved" && "Saved ✓"}
              {state === "pending" && "Typing..."}
              {state === "error" && (
                <span style={{ color: "#a83a3a" }}>
                  Not saved.{" "}
                  <button type="button" className="quiz-link" onClick={() => saveOne(q.id)}>Retry</button>
                </span>
              )}
            </p>
          </div>
        );
      })}

      {submitError && <p style={{ color: "#a83a3a" }}>{submitError}</p>}

      <button type="button" className="btn" onClick={handleSubmitClick} disabled={submitting}>
        {submitting ? "Submitting..." : "Submit quiz"}
      </button>
    </div>
  );
}
