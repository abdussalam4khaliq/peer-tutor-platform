"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SWIPE_MIN_PX = 60;

function statusIcon(topic, isActive) {
  if (topic.locked) return "🔒";
  if (topic.passed) return "✓";
  return isActive ? "▶" : "○";
}

export default function CourseReader({ topics, initialIndex = 0, passedCount = 0, testCount = 0 }) {
  const total = topics.length;
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(total - 1, 0)));
  const [direction, setDirection] = useState("next");
  const [navOpen, setNavOpen] = useState(false);
  const stageRef = useRef(null);
  const touchStart = useRef(null);
  const firstRender = useRef(true);

  const goTo = useCallback(
    (target) => {
      const next = Math.min(Math.max(target, 0), total - 1);
      if (next === index) {
        setNavOpen(false);
        return;
      }
      setDirection(next > index ? "next" : "prev");
      setIndex(next);
      setNavOpen(false);
    },
    [index, total]
  );

  // Open on a topic from the URL hash (#topic-3) if there is one.
  useEffect(() => {
    const match = window.location.hash.match(/^#topic-(\d+)$/);
    if (match) {
      const i = Number(match[1]) - 1;
      if (i >= 0 && i < total) setIndex(i);
    }
  }, [total]);

  // Keep the hash in sync so a refresh or shared link lands on the same topic,
  // and bring the top of the topic into view after each change.
  useEffect(() => {
    window.history.replaceState(window.history.state, "", `#topic-${index + 1}`);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [index]);

  // Left / right arrow keys turn the page (ignored while typing).
  useEffect(() => {
    function onKey(e) {
      const el = document.activeElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight") goTo(index + 1);
      if (e.key === "ArrowLeft") goTo(index - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index]);

  function onTouchStart(e) {
    // Don't hijack horizontal scrolling inside code blocks, tables or the editor.
    if (e.target.closest("pre, table, .no-swipe")) {
      touchStart.current = null;
      return;
    }
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    goTo(dx < 0 ? index + 1 : index - 1);
  }

  if (total === 0) return null;

  const current = topics[index];
  const pct = testCount > 0 ? Math.round((passedCount / testCount) * 100) : 0;

  return (
    <div className="reader">
      <button
        type="button"
        className="btn btn-outline btn-sm reader__nav-toggle"
        aria-expanded={navOpen}
        onClick={() => setNavOpen((o) => !o)}
      >
        ☰ Topics ({index + 1}/{total})
      </button>

      <nav className={`reader__nav${navOpen ? " reader__nav--open" : ""}`} aria-label="Course topics">
        <p className="reader__nav-title">Topics</p>
        <ol className="reader__list">
          {topics.map((t, i) => (
            <li key={t.id}>
              <button
                type="button"
                className={`reader__item${i === index ? " reader__item--active" : ""}${t.locked ? " reader__item--locked" : ""}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => goTo(i)}
              >
                <span className="reader__icon" aria-hidden="true">{statusIcon(t, i === index)}</span>
                <span className="reader__item-title">{t.title}</span>
              </button>
            </li>
          ))}
        </ol>
        {testCount > 0 && (
          <div className="reader__progress">
            <div className="reader__progress-bar"><span style={{ width: `${pct}%` }} /></div>
            <p>{passedCount} of {testCount} tests passed</p>
          </div>
        )}
      </nav>

      <section className="reader__main" ref={stageRef}>
        <div className="reader__stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div key={current.id} className={`reader__panel reader__panel--${direction}`}>
            {current.locked ? (
              <div className="card">
                <h2 style={{ marginTop: 0 }}>🔒 {current.title}</h2>
                <p style={{ color: "var(--ink-600)" }}>
                  Pass &quot;{current.blockerTitle}&quot;&apos;s test to unlock this topic.
                </p>
                <button type="button" className="btn btn-sm" onClick={() => goTo(current.blockerIndex)}>
                  Go to &quot;{current.blockerTitle}&quot;
                </button>
              </div>
            ) : (
              current.node
            )}
          </div>
        </div>

        <div className="reader__pager">
          <button type="button" className="btn btn-outline btn-sm" disabled={index === 0} onClick={() => goTo(index - 1)}>
            ← Previous
          </button>
          <span className="reader__pager-count">Topic {index + 1} of {total}</span>
          <button type="button" className="btn btn-sm" disabled={index === total - 1} onClick={() => goTo(index + 1)}>
            Next →
          </button>
        </div>
        <p className="reader__hint">Tip: swipe left or right, or use the arrow keys.</p>
      </section>
    </div>
  );
}
