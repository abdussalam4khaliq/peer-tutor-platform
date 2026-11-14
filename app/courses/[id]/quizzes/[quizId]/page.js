import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import StartQuizButton from "./start-quiz-button";
import QuizRunner from "./quiz-runner";
import { quizPhase, PHASE_BADGE, KIND_LABEL } from "@/lib/quiz";
import { formatDateTime, formatPoints } from "@/lib/format";

export default async function QuizPage({ params }) {
  const { id, quizId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/complete-profile");

  const { data: course } = await supabase
    .from("courses")
    .select("id, code, title, tutor_id")
    .eq("id", id)
    .maybeSingle();
  if (!course) notFound();

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, instructions, opens_at, closes_at, duration_minutes, published")
    .eq("id", quizId)
    .eq("course_id", id)
    .maybeSingle();
  if (!quiz) notFound();

  const isAdmin = profile.role === "admin" || profile.role === "super_admin";
  const isCourseTutor = course.tutor_id === user.id;

  const backLink = <p><a href={`/courses/${id}`}>← Back to {course.code}</a></p>;

  // Tutors and admins manage the quiz instead of taking it.
  if (isCourseTutor || isAdmin) {
    return (
      <main className="app-container">
        <AppHeader profile={profile} />
        {backLink}
        <h1>{quiz.title}</h1>
        <p className="lede-sm">You manage this course, so you can&apos;t take its quizzes.</p>
        {isCourseTutor && (
          <a className="btn btn-sm" href={`/tutor/courses/${id}/quizzes/${quiz.id}`}>View submissions and marks →</a>
        )}
      </main>
    );
  }

  const loadAttempt = async () => {
    const { data } = await supabase
      .from("quiz_attempts")
      .select("id, status, deadline_at, total_points, auto_points, manual_points, pending_manual")
      .eq("quiz_id", quizId)
      .eq("student_id", user.id)
      .maybeSingle();
    return data;
  };

  let attempt = await loadAttempt();

  // If the student's time ran out without submitting, close the attempt out now.
  if (attempt && attempt.status === "in_progress" && new Date(attempt.deadline_at).getTime() + 15000 < Date.now()) {
    await supabase.rpc("finalize_expired_quiz_attempts", { p_quiz_id: quizId });
    attempt = await loadAttempt();
  }

  const now = new Date();
  const phase = quizPhase(quiz, attempt, now);
  const badge = PHASE_BADGE[phase];

  const header = (
    <>
      <AppHeader profile={profile} />
      {backLink}
      <h1>{quiz.title}</h1>
      <p>
        <span className={`badge ${badge.className}`}>{badge.label}</span>{" "}
        <span style={{ color: "var(--ink-600)", fontSize: 14 }}>
          {course.code} · {quiz.duration_minutes} min · Closes {formatDateTime(quiz.closes_at)}
        </span>
      </p>
    </>
  );

  // ----- taking the quiz -----
  if (phase === "in_progress") {
    return (
      <main className="app-container">
        {header}
        <QuizRunner
          attemptId={attempt.id}
          userId={user.id}
          title={quiz.title}
          deadlineIso={attempt.deadline_at}
          serverNowIso={now.toISOString()}
        />
      </main>
    );
  }

  // ----- not started -----
  if (phase === "upcoming" || phase === "open" || phase === "missed") {
    return (
      <main className="app-container">
        {header}
        {quiz.instructions && (
          <div className="card">
            <strong>Instructions</strong>
            <p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{quiz.instructions}</p>
          </div>
        )}
        <div className="card">
          <div className="field-row">
            <span className="field-row__label">Opens</span>
            <span className="field-row__value">{formatDateTime(quiz.opens_at)}</span>
          </div>
          <div className="field-row">
            <span className="field-row__label">Closes</span>
            <span className="field-row__value">{formatDateTime(quiz.closes_at)}</span>
          </div>
          <div className="field-row">
            <span className="field-row__label">Time once you start</span>
            <span className="field-row__value">{quiz.duration_minutes} minutes</span>
          </div>
        </div>

        {phase === "open" && (
          <>
            <p style={{ color: "var(--ink-600)" }}>
              You can only attempt this quiz once. The clock starts when you press Start and can&apos;t be paused.
              If the quiz closes before your time is up, you&apos;ll get less time.
            </p>
            <StartQuizButton quizId={quiz.id} durationMinutes={quiz.duration_minutes} />
          </>
        )}
        {phase === "upcoming" && <p>This quiz opens {formatDateTime(quiz.opens_at)}.</p>}
        {phase === "missed" && <p>This quiz has closed and you didn&apos;t take it.</p>}
      </main>
    );
  }

  // ----- submitted, waiting for the quiz to close -----
  if (phase === "submitted") {
    return (
      <main className="app-container">
        {header}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Your answers are in ✓</h2>
          <p style={{ margin: 0, color: "var(--ink-600)" }}>
            Marks and correct answers are shown after the quiz closes on {formatDateTime(quiz.closes_at)}.
          </p>
        </div>
      </main>
    );
  }

  // ----- results -----
  const { data: rows, error: resultError } = await supabase.rpc("get_quiz_result", { p_attempt_id: attempt.id });
  const results = rows || [];

  const imageUrls = new Map();
  for (const r of results) {
    if (r.r_image_path) {
      const { data: signed } = await supabase.storage.from("quiz-answers").createSignedUrl(r.r_image_path, 3600);
      if (signed?.signedUrl) imageUrls.set(r.r_question_id, signed.signedUrl);
    }
  }

  const earned = Number(attempt.auto_points) + Number(attempt.manual_points);
  const total = Number(attempt.total_points);
  const pct = total > 0 ? Math.round((earned / total) * 100) : 0;

  return (
    <main className="app-container">
      {header}

      <div className="card">
        <p style={{ fontSize: 28, fontWeight: 600, margin: "0 0 4px" }}>
          {formatPoints(earned)} / {formatPoints(total)} <span style={{ fontSize: 16, color: "var(--ink-600)" }}>({pct}%)</span>
        </p>
        {attempt.pending_manual > 0 ? (
          <p style={{ margin: 0, color: "var(--ink-600)" }}>
            {attempt.pending_manual} answer{attempt.pending_manual === 1 ? " is" : "s are"} still waiting to be marked by your tutor, so this score may go up.
          </p>
        ) : (
          <p style={{ margin: 0, color: "var(--ink-600)" }}>Everything has been marked.</p>
        )}
      </div>

      {resultError && <p style={{ color: "#a83a3a" }}>{resultError.message}</p>}

      {results.map((r, i) => (
        <div key={r.r_question_id} className="card">
          <div className="action-row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "var(--ink-400)" }}>{KIND_LABEL[r.r_kind]}</span>
            {r.r_needs_manual && !r.r_graded ? (
              <span className="badge badge-amber">Awaiting marking</span>
            ) : (
              <span className={`badge ${r.r_points_awarded > 0 ? "badge-green" : "badge-grey"}`}>
                {formatPoints(r.r_points_awarded)} / {formatPoints(r.r_points)}
              </span>
            )}
          </div>
          <p style={{ fontWeight: 600, margin: "0 0 10px", whiteSpace: "pre-wrap" }}>{i + 1}. {r.r_prompt}</p>

          {r.r_kind === "mcq" &&
            ["a", "b", "c", "d"].map((key) => {
              const isMine = r.r_selected_option === key;
              const isCorrect = r.r_correct_option === key;
              return (
                <p key={key} style={{ margin: "4px 0", color: isCorrect ? "var(--moss)" : isMine ? "#a83a3a" : "inherit", fontWeight: isMine || isCorrect ? 600 : 400 }}>
                  {isCorrect ? "✓" : isMine ? "✗" : "·"} {r[`r_option_${key}`]}
                  {isMine && " (your answer)"}
                </p>
              );
            })}

          {r.r_kind === "mcq" && !r.r_selected_option && (
            <p style={{ color: "var(--ink-400)", margin: "4px 0" }}>You didn&apos;t answer this one.</p>
          )}

          {r.r_kind !== "mcq" && (
            <>
              {r.r_answer_text ? (
                <p style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}><strong>Your answer:</strong> {r.r_answer_text}</p>
              ) : !imageUrls.get(r.r_question_id) ? (
                <p style={{ color: "var(--ink-400)", margin: "4px 0" }}>You didn&apos;t answer this one.</p>
              ) : null}
              {imageUrls.get(r.r_question_id) && (
                <a href={imageUrls.get(r.r_question_id)} target="_blank" rel="noreferrer">
                  <img src={imageUrls.get(r.r_question_id)} alt="Your uploaded working" className="quiz-photo" />
                </a>
              )}
            </>
          )}

          {r.r_tutor_comment && (
            <p style={{ margin: "10px 0 0", padding: "8px 10px", background: "var(--paper)", borderRadius: 6 }}>
              <strong>Tutor:</strong> {r.r_tutor_comment}
            </p>
          )}
        </div>
      ))}
    </main>
  );
}
