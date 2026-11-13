// Where a quiz stands for one student.
//   upcoming    - not open yet
//   open        - open and the student hasn't started
//   in_progress - student started and still has time
//   submitted   - student is done; results appear once the quiz closes
//   results     - quiz closed and the student took it
//   missed      - quiz closed and the student never started
export function quizPhase(quiz, attempt, now = new Date()) {
  const opens = new Date(quiz.opens_at);
  const closes = new Date(quiz.closes_at);

  if (attempt) {
    if (attempt.status === "in_progress") {
      return new Date(attempt.deadline_at) > now ? "in_progress" : "submitted";
    }
    return now >= closes ? "results" : "submitted";
  }
  if (now < opens) return "upcoming";
  if (now >= closes) return "missed";
  return "open";
}

export const PHASE_BADGE = {
  upcoming: { label: "Upcoming", className: "badge-grey" },
  open: { label: "Open now", className: "badge-green" },
  in_progress: { label: "In progress", className: "badge-amber" },
  submitted: { label: "Submitted", className: "badge-green" },
  results: { label: "Results ready", className: "badge-green" },
  missed: { label: "Missed", className: "badge-grey" },
};

export const KIND_LABEL = {
  mcq: "Multiple choice",
  short: "Short answer",
  upload: "Worked solution (photo)",
};
