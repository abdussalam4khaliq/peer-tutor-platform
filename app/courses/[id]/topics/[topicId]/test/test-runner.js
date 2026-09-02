"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function TestRunner({ topicId, courseId }) {
  const supabase = createClient();

  const [questions, setQuestions] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loadError, setLoadError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  async function loadQuestions() {
    setLoadError(null);
    setResult(null);
    setAnswers({});
    setQuestions(null);

    const { data, error } = await supabase.rpc("get_test_questions", { p_topic_id: topicId });

    if (error) {
      setLoadError(error.message);
      return;
    }
    if (!data || data.length === 0) {
      setLoadError("No questions are set up for this topic yet.");
      return;
    }
    setQuestions(data);
  }

  useEffect(() => {
    loadQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError(null);

    if (questions.some((q) => !answers[q.id])) {
      setSubmitError("Please answer every question.");
      return;
    }

    setSubmitting(true);

    const question_ids = questions.map((q) => q.id);
    const selected_options = questions.map((q) => answers[q.id]);

    const { data, error } = await supabase.rpc("submit_test_attempt", {
      p_topic_id: topicId,
      p_question_ids: question_ids,
      p_selected_options: selected_options,
    });

    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    setResult(data?.[0] || null);
  }

  if (loadError) {
    return (
      <div className="card">
        <p>{loadError}</p>
        <a className="btn btn-sm" href={`/courses/${courseId}`}>← Back to course</a>
      </div>
    );
  }

  if (result) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{result.passed ? "You passed! 🎉" : "Not quite — try again"}</h2>
        <p style={{ fontSize: 24, fontWeight: 600 }}>{result.score_percent}%</p>
        <p style={{ color: "var(--ink-600)" }}>You need 80% to pass.</p>
        <div className="action-row">
          {result.passed ? (
            <a className="btn btn-sm" href={`/courses/${courseId}`}>Continue to next topic →</a>
          ) : (
            <>
              <button type="button" className="btn btn-sm" onClick={loadQuestions}>Try again</button>
              <a className="btn btn-outline btn-sm" href={`/courses/${courseId}`}>Back to course</a>
            </>
          )}
        </div>
      </div>
    );
  }

  if (!questions) {
    return <p>Loading questions...</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      {questions.map((q, i) => (
        <div key={q.id} className="card">
          <p style={{ fontWeight: 600 }}>{i + 1}. {q.question_text}</p>
          {["a", "b", "c", "d"].map((key) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
              <input
                type="radio"
                name={q.id}
                checked={answers[q.id] === key}
                onChange={() => setAnswers({ ...answers, [q.id]: key })}
                style={{ width: "auto" }}
              />
              {q[`option_${key}`]}
            </label>
          ))}
        </div>
      ))}

      {submitError && <p style={{ color: "red" }}>{submitError}</p>}

      <button type="submit" className="btn" disabled={submitting}>
        {submitting ? "Submitting..." : "Submit test"}
      </button>
    </form>
  );
}