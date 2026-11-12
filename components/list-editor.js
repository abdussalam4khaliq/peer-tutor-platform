"use client";

import { useState } from "react";

// A small "type something, press Add" list, used for subtopics and learning objectives.
export default function ListEditor({ label, hint, items, onChange, placeholder, max = 15, maxLength = 200, addLabel = "+ Add" }) {
  const [draft, setDraft] = useState("");

  function add() {
    const text = draft.replace(/\s+/g, " ").trim().slice(0, maxLength);
    if (!text || items.length >= max) return;
    if (items.some((i) => i.toLowerCase() === text.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...items, text]);
    setDraft("");
  }

  function remove(index) {
    onChange(items.filter((_, i) => i !== index));
  }

  function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ margin: "0 0 2px", fontWeight: 600, fontSize: 14 }}>{label}</p>
      {hint && <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--ink-600)" }}>{hint}</p>}

      <div className="action-row" style={{ marginBottom: 6 }}>
        <input
          placeholder={placeholder}
          value={draft}
          maxLength={maxLength}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          style={{ flex: 1 }}
          disabled={items.length >= max}
        />
        <button type="button" className="btn btn-sm" onClick={add} disabled={items.length >= max}>
          {addLabel}
        </button>
      </div>

      {items.map((item, i) => (
        <div
          key={`${item}-${i}`}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: "1px solid var(--rule)" }}
        >
          <span style={{ flex: 1, fontSize: 14 }}>
            {i + 1}. {item}
          </span>
          <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" style={miniButton}>↑</button>
          <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down" style={miniButton}>↓</button>
          <button type="button" onClick={() => remove(i)} style={{ ...miniButton, color: "#a83a3a" }}>Remove</button>
        </div>
      ))}
      <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink-400)" }}>
        {items.length} / {max}
      </p>
    </div>
  );
}

const miniButton = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  padding: "0 4px",
};
