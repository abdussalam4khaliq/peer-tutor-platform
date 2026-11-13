import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import GradeForm from "./grade-form";
import { formatDateTime, formatPoints } from "@/lib/format";
import { KIND_LABEL } from "@/lib/quiz";

export default async function QuizSubmissionsPage({ params }) {
  const { courseId, quizId } = params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile) redirect("/complete-profile");

  const { data: course } = await supabase
    .from("courses")
    .select("id, code, title, tutor_id")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) notFound();
  if (course.tutor_id !== user.id) redirect("/tutor/courses");

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, opens_at, closes_at, duration_minutes, published")
    .eq("id", quizId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!quiz) notFound();

  // This also closes out any attempts whose time has run out.
  const { data: attemptRows } = await supabase.rpc("get_quiz_attempts", { p_quiz_id: quizId });
  const attempts = (attemptRows || []).slice().sort((a, b) => {
    if ((b.a_pending_manual > 0) - (a.a_pending_manual > 0) !== 0) return (b.a_pending_manual > 0) - (a.a_pending_manual > 0);
    return a.a_student_name.localeCompare(b.a_student_name);
  });

  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("id, position, kind, prompt, points")
    .eq("quiz_id", quizId);
  const questionById = new Map((questions || []).map((q) => [q.id, q]));

  const attemptIds = attempts.map((a) => a.a_attempt_id);
  const { data: manualAnswers } = attemptIds.length
    ? await supabase
        .from("quiz_answers")
        .select("id, attempt_id, question_id, answer_text, image_path, points_awarded, tutor_comment, graded_at")
        .in("attempt_id", attemptIds)
        .eq("needs_manual", true)
    : { data: [] };

  const paths = (manualAnswers || []).map((a) => a.image_path).filter(Boolean);
  const urlByPath = new Map();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("quiz-answers").createSignedUrls(paths, 3600);
    for (const s of signed || []) {
      if (s.signedUrl) urlByPath.set(s.path, s.signedUrl);
    }
  }

  const answersByAttempt = new Map();
  for (const a of manualAnswers || []) {
    const list = answersByAttempt.get(a.attempt_id) || [];
    list.push(a);
    answersByAttempt.set(a.attempt_id, list);
  }
  for (const list of answersByAttempt.values()) {
    list.sort((x, y) => (questionById.get(x.question_id)?.position || 0) - (questionById.get(y.question_id)?.position || 0));
  }

  const finished = attempts.filter((a) => a.a_status !== "in_progress");
  const toMark = attempts.reduce((n, a) => n + a.a_pending_manual, 0);
  const avg = finished.length
    ? Math.round(
        (finished.reduce((sum, a) => sum + (a.a_total_points > 0 ? (Number(a.a_auto_points) + Number(a.a_manual_points)) / Number(a.a_total_points) : 0), 0) /
          finished.length) *
          100
      )
    : null;

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />
      <p><a href={`/tutor/courses/${courseId}/quizzes`}>← Back to quizzes</a></p>
      <h1>{quiz.title}</h1>
      <p className="lede-sm">
        {course.code} · {quiz.duration_minutes} min · {formatDateTime(quiz.opens_at)} → {formatDateTime(quiz.closes_at)}
      </p>
      <p><a className="btn btn-outline btn-sm" href={`/tutor/courses/${courseId}/quizzes/${quizId}/edit`}>Edit quiz</a></p>

      <div className="card">
        <div className="field-row"><span className="field-row__label">Submissions</span><span className="field-row__value">{attempts.length}</span></div>
        <div className="field-row"><span className="field-row__label">Answers waiting to be marked</span><span className="field-row__value">{toMark}</span></div>
        <div className="field-row"><span className="field-row__label">Class average</span><span className="field-row__value">{avg === null ? "—" : `${avg}%`}</span></div>
      </div>

      <p style={{ color: "var(--ink-600)", fontSize: 14 }}>
        Multiple choice and short answers with accepted answers are marked automatically. Students see their marks and the correct answers after the quiz closes.
      </p>

      {attempts.length === 0 && <p>No one has started this quiz yet.</p>}

      {attempts.map((a) => {
        const manual = answersByAttempt.get(a.a_attempt_id) || [];
        const earned = Number(a.a_auto_points) + Number(a.a_manual_points);
        return (
          <details key={a.a_attempt_id} className="card" open={a.a_pending_manual > 0}>
            <summary style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong>{a.a_student_name}</strong>
              <span>
                {a.a_status === "in_progress" ? (
                  <span className="badge badge-amber">Still writing</span>
                ) : (
                  <>
                    {formatPoints(earned)} / {formatPoints(a.a_total_points)}{" "}
                    {a.a_pending_manual > 0 ? (
                      <span className="badge badge-amber">{a.a_pending_manual} to mark</span>
                    ) : (
                      <span className="badge badge-green">Marked</span>
                    )}
                  </>
                )}
              </span>
            </summary>

            {a.a_submitted_at && (
              <p style={{ color: "var(--ink-600)", fontSize: 13, margin: "10px 0 0" }}>Submitted {formatDateTime(a.a_submitted_at)}</p>
            )}

            {manual.length === 0 && a.a_status !== "in_progress" && (
              <p style={{ color: "var(--ink-600)", margin: "10px 0 0" }}>Nothing to mark by hand for this student.</p>
            )}

            {manual.map((ans) => {
              const q = questionById.get(ans.question_id);
              const imageUrl = ans.image_path ? urlByPath.get(ans.image_path) : null;
              return (
                <div key={ans.id} style={{ borderTop: "1px solid var(--rule)", marginTop: 12, paddingTop: 12 }}>
                  <p style={{ margin: "0 0 4px", fontSize: 12, color: "var(--ink-400)" }}>
                    Question {q?.position} · {KIND_LABEL[q?.kind]} · {formatPoints(q?.points)} pt
                  </p>
                  <p style={{ margin: "0 0 8px", fontWeight: 600, whiteSpace: "pre-wrap" }}>{q?.prompt}</p>
                  {ans.answer_text && <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}><strong>Answer:</strong> {ans.answer_text}</p>}
                  {imageUrl && (
                    <a href={imageUrl} target="_blank" rel="noreferrer">
                      <img src={imageUrl} alt={`${a.a_student_name}'s working`} className="quiz-photo" />
                    </a>
                  )}
                  <GradeForm
                    answerId={ans.id}
                    maxPoints={Number(q?.points || 0)}
                    initialPoints={Number(ans.points_awarded)}
                    initialComment={ans.tutor_comment}
                    graded={!!ans.graded_at}
                  />
                </div>
              );
            })}
          </details>
        );
      })}
    </main>
  );
}
