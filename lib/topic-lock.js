// Mirrors the database rule in supabase/migrations/20_topic_lock_chain.sql:
// a topic is open only when EVERY earlier visible topic that has a test has
// been passed. Hidden topics never block progress.
//
// topics: array ordered by order_index, each with { id, question_count, hidden }
// passedSet: Set of topic ids the student has passed
export function computeTopicStates(topics, passedSet) {
  let blocker = null; // first earlier topic whose test is still unpassed
  return topics.map((topic) => {
    const hasTest = !topic.hidden && topic.question_count > 0;
    const passed = passedSet.has(topic.id);
    const state = { locked: blocker !== null, blockedBy: blocker, passed, hasTest };
    if (hasTest && !passed && blocker === null) blocker = topic;
    return state;
  });
}

// Where a student should land when they open the course: the first unlocked
// topic whose test they haven't passed yet. Falls back to the last topic if
// they've passed everything, or the first topic if the course has no tests.
export function pickResumeIndex(states) {
  const frontier = states.findIndex((s) => s.hasTest && !s.passed && !s.locked);
  if (frontier >= 0) return frontier;
  const anyTest = states.some((s) => s.hasTest);
  return anyTest ? Math.max(0, states.length - 1) : 0;
}
