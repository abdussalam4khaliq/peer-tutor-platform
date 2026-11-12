import { normalizeSyllabus, normalizeLessonPlan } from "@/lib/syllabus";

// Read-only view of a syllabus and lesson plan (admin review, tutor reference).
// Understands both the new structure and the older plain-text lists.
export default function PlanView({ syllabus, lessonPlan }) {
  const topics = normalizeSyllabus(syllabus);
  const entries = normalizeLessonPlan(lessonPlan);
  const legacy = entries.filter((e) => e.legacy);
  const structured = entries.filter((e) => !e.legacy);

  return (
    <div style={{ fontSize: 14 }}>
      <p style={{ fontWeight: 600, margin: "12px 0 4px" }}>Syllabus ({topics.length} topics)</p>
      {topics.length === 0 && <p style={{ color: "var(--ink-600)" }}>No syllabus provided.</p>}
      <ol style={{ paddingLeft: 20, margin: "0 0 12px" }}>
        {topics.map((t, i) => (
          <li key={i} style={{ marginBottom: 6 }}>
            <strong>{t.title}</strong>
            {t.overview && <div style={{ color: "var(--ink-600)", whiteSpace: "pre-wrap" }}>{t.overview}</div>}
          </li>
        ))}
      </ol>

      {structured.length > 0 && (
        <>
          <p style={{ fontWeight: 600, margin: "12px 0 4px" }}>Lesson plan ({structured.length} topics planned)</p>
          {structured.map((e, i) => (
            <details key={i} style={{ border: "1px solid var(--rule)", borderRadius: 6, padding: "6px 10px", marginBottom: 6 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>{e.topic}</summary>
              <p style={{ margin: "8px 0 2px", fontWeight: 600 }}>Learning objectives</p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {e.objectives.map((o, j) => (
                  <li key={j}>{o}</li>
                ))}
              </ul>
              <p style={{ margin: "8px 0 2px", fontWeight: 600 }}>Subtopics</p>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {e.subtopics.map((s, j) => (
                  <li key={j}>{s}</li>
                ))}
              </ul>
              <p style={{ margin: "8px 0 2px", fontWeight: 600 }}>Content</p>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{e.content}</p>
            </details>
          ))}
        </>
      )}

      {legacy.length > 0 && (
        <>
          <p style={{ fontWeight: 600, margin: "12px 0 4px" }}>Weekly lesson plan ({legacy.length} weeks)</p>
          <ol style={{ paddingLeft: 20, margin: "0 0 12px" }}>
            {legacy.map((e, i) => (
              <li key={i}>{e.legacy}</li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
