"use client";

import { useState } from "react";

const COPY = {
  student: {
    label: "I'm a student",
    heading: (
      <>
        Learn from the <span className="hero__mark">coursemate</span> who already aced it.
      </>
    ),
    lede: "Coursemate turns real lecture notes from top students in your department into structured courses — organized, department-specific, and free to preview.",
    primaryLabel: "Create a free account",
    primaryHref: "/signup",
  },
  tutor: {
    label: "I want to teach",
    heading: (
      <>
        Turn your notes into a course. <span className="hero__mark">Get paid</span> to teach it.
      </>
    ),
    lede: "If you've already passed a course, adopt it, submit a sample topic, and start teaching classmates in your department once you're approved.",
    primaryLabel: "Apply to teach",
    primaryHref: "/signup",
  },
};

export default function AudienceToggle() {
  const [audience, setAudience] = useState("student");
  const copy = COPY[audience];

  return (
    <div>
      <div className="toggle" role="tablist" aria-label="Choose your audience">
        {Object.keys(COPY).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={audience === key}
            data-active={audience === key}
            className="toggle__btn"
            onClick={() => setAudience(key)}
          >
            {COPY[key].label}
          </button>
        ))}
      </div>

      <h1>{copy.heading}</h1>
      <p className="lede">{copy.lede}</p>

      <div className="hero__actions">
        <a className="btn-primary" href={copy.primaryHref}>{copy.primaryLabel}</a>
        <a className="btn-secondary" href="#how-it-works">See how it works</a>
      </div>
    </div>
  );
}