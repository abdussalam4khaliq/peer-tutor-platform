"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const EMPTY_FORM = { question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "a" };

export default function QuestionBankManager({ topicId, questionsPerTest, questions }) {
  const router = useRouter();
  const supabase = createClient();

  const [countValue, setCountValue] = useState(questionsPerTest);
  const [savingCount, setSavingCount] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  function refresh() {
    router.refresh();
  }

  async function saveCount(e) {
    e.preventDefault();
    setSavingCount(true);
    await supabase.from("topics").update({ questions_per_test: Number(countValue) }).eq("id", topicId);
    setSavingCount(false);
    refresh();
  }

  async function addQuestion(e) {
    e.preventDefault();
    setError(null);

    if (!form.question_text.trim() || !form.option_a.trim() || !form.option_b.trim() || !form.option_c.trim() || !form.option_d.trim()) {
      setError("Please fill in the question and all four options.");
      return;
    }

    setAdding(true);
    const { error } = await supabase.from("question_bank").insert({ topic_id: topicId, ...form });
    setAdding(false);

    if (error) {
      setError(error.message);
      return;
    }

    setForm(EMPTY_FORM);
    refresh();
  }

  async function deleteQuestion(id) {
    const ok = window.confirm("Delete this question?");
    if (!ok) return;
    setBusyId(id);
    await supabase.from("question_bank").delete().eq("id", id);
    setBusyId(null);
    refresh();
  }

  const bankTooSmall = questions.length < countValue;

  return (
    <div>
      <div className="card">
        <form onSubmit={saveCount} className="action-row">
          <label style={{ flex: 1 }}>
            Questions per attempt
            <input
              type="number"
              min={1}
              value={countValue}
              onChange={(e) => setCountValue(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-sm" disabled={savingCount}>
            {savingCount ? "Saving..." : "Save"}
          </button>
        </form>
        {bankTooSmall && (
          <p style={{ color: "#b8860b", fontSize: 13, marginTop: 8 }}>
            You have {questions.length} question{questions.length === 1 ? "" : "s"} but ask for {countValue} per attempt — add more below.
          </p>
        )}
      </div>

      <h2>Add a question</h2>
      <div className="card">
        <form onSubmit={addQuestion} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea
            placeholder="Question text"
            rows={2}
            value={form.question_text}
            onChange={(e) => setForm({ ...form, question_text: e.target.value })}
          />
          {["a", "b", "c", "d"].map((key) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="radio"
                name="correct_option"
                checked={form.correct_option === key}
                onChange={() => setForm({ ...form, correct_option: key })}
                style={{ width: "auto" }}
              />
              <input
                placeholder={`Option ${key.toUpperCase()}`}
                value={form[`option_${key}`]}
                onChange={(e) => setForm({ ...form, [`option_${key}`]: e.target.value })}
              />
            </label>
          ))}
          <p style={{ fontSize: 13, color: "var(--ink-600)", margin: 0 }}>Select the radio button next to the correct option.</p>
          {error && <p style={{ color: "red" }}>{error}</p>}
          <button type="submit" className="btn btn-sm" disabled={adding} style={{ alignSelf: "flex-start" }}>
            {adding ? "Adding..." : "+ Add question"}
          </button>
        </form>
      </div>

      <h2>Question bank ({questions.length})</h2>
      {questions.length === 0 && <p>No questions yet.</p>}
      {questions.map((q) => (
        <div key={q.id} className="card">
                    <p style={{ fontWeight: 600, margin: "0 0 6px" }}>{q.question_text} <span className="badge badge-grey">{q.exp_value} EXP</span></p>
          {["a", "b", "c", "d"].map((key) => (
            <p key={key} style={{ margin: "2px 0", fontSize: 14, color: q.correct_option === key ? "var(--moss)" : "var(--ink-600)" }}>
              {key.toUpperCase()}. {q[`option_${key}`]} {q.correct_option === key && "✓"}
            </p>
          ))}
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => deleteQuestion(q.id)}
            disabled={busyId === q.id}
            style={{ marginTop: 8 }}
          >
            {busyId === q.id ? "Deleting..." : "Delete"}
          </button>
        </div>
      ))}
    </div>
  );
}