// Shown to students above the notes: what they'll learn, and what the topic covers.
// No hooks, so it works in server and client components.
export default function TopicOutline({ objectives, subtopics }) {
  const goals = Array.isArray(objectives) ? objectives.filter(Boolean) : [];
  const parts = Array.isArray(subtopics) ? subtopics.filter(Boolean) : [];
  if (goals.length === 0 && parts.length === 0) return null;

  return (
    <div className="topic-outline">
      {goals.length > 0 && (
        <>
          <p className="topic-outline__title">Learning objectives</p>
          <p className="topic-outline__lede">By the end of this topic you should be able to:</p>
          <ul>
            {goals.map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        </>
      )}
      {parts.length > 0 && (
        <>
          <p className="topic-outline__title">In this topic</p>
          <ul>
            {parts.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
