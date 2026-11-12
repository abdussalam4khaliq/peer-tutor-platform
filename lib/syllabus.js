// Shared helpers for the syllabus ("scheme of work") and the lesson plan.
//
// Syllabus     : [{ title, overview }]
// Lesson plan  : [{ topic, subtopics: [string], objectives: [string], content }]
//                where `topic` is the title of one of the syllabus topics.
//
// Older applications stored plain strings (a list of topic names, and a list of weekly notes).
// The normalise functions below accept both shapes, so old data keeps displaying.

export const LIMITS = {
  MIN_SYLLABUS_TOPICS: 5,
  MAX_SYLLABUS_TOPICS: 60,
  MIN_PLAN_ENTRIES: 3,
  TITLE_MIN: 3,
  TITLE_MAX: 120,
  OVERVIEW_MIN: 20,
  OVERVIEW_MAX: 1000,
  SUBTOPIC_MAX: 120,
  MAX_SUBTOPICS: 15,
  OBJECTIVE_MAX: 200,
  MAX_OBJECTIVES: 10,
  CONTENT_MIN: 30,
  CONTENT_MAX: 3000,
};

export function cleanLine(value, max) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function cleanBlock(value, max) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export function sameTitle(a, b) {
  return cleanLine(a, 500).toLowerCase() === cleanLine(b, 500).toLowerCase();
}

export function normalizeSyllabus(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return { title: cleanLine(item, LIMITS.TITLE_MAX), overview: "" };
      return {
        title: cleanLine(item?.title, LIMITS.TITLE_MAX),
        overview: cleanBlock(item?.overview, LIMITS.OVERVIEW_MAX),
      };
    })
    .filter((item) => item.title);
}

// Returns entries in the new shape. An old weekly note (a string) becomes { legacy: "Week text" }.
export function normalizeLessonPlan(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") {
        const text = cleanBlock(item, LIMITS.CONTENT_MAX);
        return text ? { topic: "", subtopics: [], objectives: [], content: "", legacy: text } : null;
      }
      if (!item || typeof item !== "object") return null;
      return {
        topic: cleanLine(item.topic, LIMITS.TITLE_MAX),
        subtopics: (Array.isArray(item.subtopics) ? item.subtopics : [])
          .map((s) => cleanLine(s, LIMITS.SUBTOPIC_MAX))
          .filter(Boolean),
        objectives: (Array.isArray(item.objectives) ? item.objectives : [])
          .map((s) => cleanLine(s, LIMITS.OBJECTIVE_MAX))
          .filter(Boolean),
        content: cleanBlock(item.content, LIMITS.CONTENT_MAX),
      };
    })
    .filter(Boolean);
}

export function findPlanEntry(plan, title) {
  return normalizeLessonPlan(plan).find((entry) => entry.topic && sameTitle(entry.topic, title)) || null;
}

// Syllabus topics that don't have a lesson plan entry yet.
export function unplannedTopics(syllabus, plan) {
  const planned = normalizeLessonPlan(plan).map((e) => e.topic);
  return normalizeSyllabus(syllabus).filter((s) => !planned.some((p) => sameTitle(p, s.title)));
}

// Checks one syllabus topic before it is added. Returns an error message or null.
export function validateSyllabusTopic(topic, existing = []) {
  const title = cleanLine(topic?.title, 500);
  const overview = cleanBlock(topic?.overview, 5000);
  if (title.length < LIMITS.TITLE_MIN || title.length > LIMITS.TITLE_MAX) {
    return `The topic name needs ${LIMITS.TITLE_MIN} to ${LIMITS.TITLE_MAX} characters.`;
  }
  if (overview.length < LIMITS.OVERVIEW_MIN) {
    return `Add a short overview of the topic (at least ${LIMITS.OVERVIEW_MIN} characters).`;
  }
  if (overview.length > LIMITS.OVERVIEW_MAX) {
    return `Keep the overview under ${LIMITS.OVERVIEW_MAX} characters.`;
  }
  if (existing.some((e) => sameTitle(e.title, title))) {
    return "That topic is already in your syllabus.";
  }
  return null;
}

// Checks one lesson plan entry before it is added. Returns an error message or null.
export function validatePlanEntry(entry, syllabus, plan = []) {
  const topic = cleanLine(entry?.topic, 500);
  if (!topic) return "Choose which syllabus topic this lesson plan is for.";
  if (!normalizeSyllabus(syllabus).some((s) => sameTitle(s.title, topic))) {
    return "Choose a topic from your syllabus.";
  }
  if (normalizeLessonPlan(plan).some((e) => e.topic && sameTitle(e.topic, topic))) {
    return "That topic already has a lesson plan.";
  }
  if (!entry.subtopics?.length) return "Add at least one subtopic.";
  if (entry.subtopics.length > LIMITS.MAX_SUBTOPICS) return `Use at most ${LIMITS.MAX_SUBTOPICS} subtopics.`;
  if (!entry.objectives?.length) return "Add at least one learning objective.";
  if (entry.objectives.length > LIMITS.MAX_OBJECTIVES) return `Use at most ${LIMITS.MAX_OBJECTIVES} learning objectives.`;
  const content = cleanBlock(entry.content, 5000);
  if (content.length < LIMITS.CONTENT_MIN) {
    return `Describe the content you'll cover (at least ${LIMITS.CONTENT_MIN} characters).`;
  }
  if (content.length > LIMITS.CONTENT_MAX) return `Keep the content under ${LIMITS.CONTENT_MAX} characters.`;
  return null;
}

// The whole-application check, used on submit. Returns an error message or null.
export function validatePlans(syllabusRaw, planRaw) {
  const syllabus = normalizeSyllabus(syllabusRaw);
  const plan = normalizeLessonPlan(planRaw);

  if (syllabus.length < LIMITS.MIN_SYLLABUS_TOPICS) {
    return `Please list at least ${LIMITS.MIN_SYLLABUS_TOPICS} topics in your syllabus.`;
  }
  if (syllabus.length > LIMITS.MAX_SYLLABUS_TOPICS) {
    return `Please keep your syllabus to ${LIMITS.MAX_SYLLABUS_TOPICS} topics or fewer.`;
  }
  if (plan.length < LIMITS.MIN_PLAN_ENTRIES) {
    return `Please write lesson plans for at least ${LIMITS.MIN_PLAN_ENTRIES} of your syllabus topics.`;
  }
  for (const entry of plan) {
    const problem = validatePlanEntry(entry, syllabus, []);
    if (problem) return `Lesson plan for "${entry.topic || "a topic"}": ${problem}`;
  }
  return null;
}

// What the database stores for a topic created from a plan entry.
export function topicDraftFromPlan(plan, syllabusTitle) {
  const entry = findPlanEntry(plan, syllabusTitle);
  return {
    title: cleanLine(syllabusTitle, LIMITS.TITLE_MAX),
    subtopics: entry?.subtopics || [],
    objectives: entry?.objectives || [],
  };
}

// Sanitises the lists coming out of the topic form before saving.
export function cleanList(list, maxItems, maxLength) {
  return (Array.isArray(list) ? list : [])
    .map((s) => cleanLine(s, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}
