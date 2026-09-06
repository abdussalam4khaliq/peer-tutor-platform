"use client";

import { useMemo, useState } from "react";

export default function AdminCourseFilter({ courses }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) =>
      [c.code, c.title, c.departmentName, c.facultyName, c.schoolName, c.tutorName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [query, courses]);

  return (
    <div>
      <input
        placeholder="Search by course code, title, department, faculty, school, or tutor..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 16 }}
      />

      <p style={{ fontSize: 13, color: "var(--ink-600)" }}>
        Showing {filtered.length} of {courses.length}
      </p>

      {filtered.length === 0 && <p>No courses match.</p>}

      {filtered.map((c) => (
        <div key={c.id} className="card">
          <strong>{c.code} — {c.title}</strong>
          <div style={{ fontSize: 14, color: "var(--ink-600)", margin: "4px 0 10px" }}>
            {c.schoolName} · {c.facultyName} · {c.departmentName}
            <br />
            {c.status === "active" ? `Taught by ${c.tutorName || "a Tutor"}` : "Not yet adopted by a Tutor"}
          </div>
          {c.status === "active" && (
            <div className="action-row" style={{ alignItems: "center" }}>
              <span className="badge badge-green">Admin access</span>
              <a href={`/courses/${c.id}`}>Open course →</a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}