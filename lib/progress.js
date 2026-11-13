// Turns a student's raw test attempts into per-topic and per-course numbers.
//
// topics:   [{ id, hidden, question_count, ... }] for one course
// attempts: [{ topic_id, score_percent, passed, created_at }] for this student
export function summarizeCourse(topics, attempts) {
  const byTopic = new Map();
  let lastActivity = null;

  for (const a of attempts) {
    const entry = byTopic.get(a.topic_id) || { count: 0, best: 0, passed: false, last: null };
    entry.count += 1;
    entry.best = Math.max(entry.best, Number(a.score_percent));
    entry.passed = entry.passed || a.passed;
    if (!entry.last || a.created_at > entry.last) entry.last = a.created_at;
    byTopic.set(a.topic_id, entry);
    if (!lastActivity || a.created_at > lastActivity) lastActivity = a.created_at;
  }

  const testTopics = topics.filter((t) => !t.hidden && t.question_count > 0);
  const passedCount = testTopics.filter((t) => byTopic.get(t.id)?.passed).length;
  const tried = testTopics.filter((t) => byTopic.has(t.id));
  const avgBest = tried.length
    ? Math.round(tried.reduce((sum, t) => sum + byTopic.get(t.id).best, 0) / tried.length)
    : null;

  return {
    byTopic,
    testCount: testTopics.length,
    passedCount,
    percent: testTopics.length ? Math.round((passedCount / testTopics.length) * 100) : 0,
    avgBest,
    totalAttempts: attempts.length,
    lastActivity,
  };
}

export function accessStatus(enrollment, now = new Date()) {
  if (enrollment.paid_until && now < new Date(enrollment.paid_until)) {
    return { label: "Full access", className: "badge-green", until: enrollment.paid_until };
  }
  if (now < new Date(enrollment.trial_ends_at)) {
    return { label: "Free trial", className: "badge-green", until: enrollment.trial_ends_at };
  }
  return { label: "Access ended", className: "badge-amber", until: null };
}
