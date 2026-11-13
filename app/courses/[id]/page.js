import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EnrollButton from "./enroll-button";
import { sanitizeHtml } from "@/lib/sanitize";
import AppHeader from "@/components/app-header";
import RatingWidget from "@/components/rating-widget";
import VideoEmbed from "@/components/video-embed";
import CourseReader from "@/components/course-reader";
import { computeTopicStates, pickResumeIndex } from "@/lib/topic-lock";
import { quizPhase, PHASE_BADGE } from "@/lib/quiz";
import { formatDate, formatDateTime } from "@/lib/format";

export default async function CourseDetailPage({ params, searchParams }) {
  const { id } = params;
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
    .select("id, code, title, status, department_id, tutor_id, tutor:profiles(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!course) notFound();

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("*")
    .eq("student_id", user.id)
    .eq("course_id", id)
    .maybeSingle();

  const { data: topics } = await supabase
    .from("topics")
    .select("id, title, content, order_index, questions_per_test, question_count, avg_rating, rating_count, youtube_video_id, hidden")
    .eq("course_id", id)
    .order("order_index", { ascending: true });

  const topicList = topics || [];
  const topicIds = topicList.map((t) => t.id);

  const { data: myTopicRatings } = topicIds.length
    ? await supabase
        .from("forum_ratings")
        .select("target_id, stars")
        .eq("rater_id", user.id)
        .eq("target_type", "topic")
        .in("target_id", topicIds)
    : { data: [] };
  const myTopicRatingMap = new Map((myTopicRatings || []).map((r) => [r.target_id, r.stars]));

  const { data: attempts } = topicIds.length
    ? await supabase
        .from("test_attempts")
        .select("topic_id, passed")
        .eq("student_id", user.id)
        .in("topic_id", topicIds)
    : { data: [] };
  const passedSet = new Set((attempts || []).filter((a) => a.passed).map((a) => a.topic_id));

  const isAdmin = profile.role === "admin" || profile.role === "super_admin";
  const now = new Date();
  const onTrial = enrollment && now < new Date(enrollment.trial_ends_at);
  const isPaid = enrollment?.paid_until && now < new Date(enrollment.paid_until);
  const entitled = isAdmin || onTrial || isPaid;
  const sameDepartment = profile.department_id === course.department_id;

  // --- topic locking + which topic to open on ---
  const states = computeTopicStates(topicList, passedSet);

  let initialIndex = pickResumeIndex(states);
  const wanted = searchParams?.topic;
  const after = searchParams?.after;
  if (wanted) {
    const i = topicList.findIndex((t) => t.id === wanted);
    if (i >= 0) initialIndex = i;
  } else if (after) {
    const i = topicList.findIndex((t) => t.id === after);
    if (i >= 0) initialIndex = Math.min(i + 1, topicList.length - 1);
  }

  const panels = topicList.map((topic, index) => {
    const state = states[index];
    const base = {
      id: topic.id,
      title: topic.title,
      locked: state.locked,
      passed: state.passed,
    };

    if (state.locked) {
      return {
        ...base,
        blockerIndex: topicList.findIndex((t) => t.id === state.blockedBy.id),
        blockerTitle: state.blockedBy.title,
        node: null,
      };
    }

    return {
      ...base,
      node: (
        <article className="card reader__topic">
          <h2 style={{ marginTop: 0 }}>
            {topic.title}
            {topic.hidden && <span className="badge badge-amber" style={{ marginLeft: 8 }}>Hidden from students</span>}
          </h2>
          <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(topic.content) }} />
          <VideoEmbed videoId={topic.youtube_video_id} />
          {state.hasTest && (
            <div className="action-row" style={{ marginTop: 12, alignItems: "center" }}>
              {state.passed ? (
                <>
                  <span className="badge badge-green">Test passed ✓</span>
                  <a className="btn btn-outline btn-sm" href={`/courses/${course.id}/topics/${topic.id}/test`}>
                    Retake test
                  </a>
                </>
              ) : (
                <a className="btn btn-sm" href={`/courses/${course.id}/topics/${topic.id}/test`}>
                  Take the test ({topic.questions_per_test} questions, need 80%)
                </a>
              )}
            </div>
          )}
          <RatingWidget
            targetType="topic"
            targetId={topic.id}
            avgRating={topic.avg_rating}
            ratingCount={topic.rating_count}
            myRating={myTopicRatingMap.get(topic.id)}
            disabled={course.tutor_id === user.id}
          />
        </article>
      ),
    };
  });

  const testCount = states.filter((s) => s.hasTest).length;
  const passedCount = states.filter((s) => s.hasTest && s.passed).length;

  // --- quizzes (the table may not exist until migration 21 is run) ---
  const { data: quizRows } = await supabase
    .from("quizzes")
    .select("id, title, opens_at, closes_at, duration_minutes")
    .eq("course_id", id)
    .eq("published", true)
    .order("closes_at", { ascending: false });
  const quizzes = quizRows || [];

  const { data: quizAttempts } = quizzes.length
    ? await supabase
        .from("quiz_attempts")
        .select("quiz_id, status, deadline_at")
        .eq("student_id", user.id)
        .in("quiz_id", quizzes.map((q) => q.id))
    : { data: [] };
  const attemptByQuiz = new Map((quizAttempts || []).map((a) => [a.quiz_id, a]));

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />
      <p><a href="/courses">← Back to courses</a></p>
      <h1>{course.code} — {course.title}</h1>
      <p style={{ color: "var(--ink-600)" }}>Taught by {course.tutor?.full_name || "a Tutor"}</p>

      {!isAdmin && !enrollment && sameDepartment && <p><EnrollButton courseId={course.id} /></p>}
      {isAdmin && <p><span className="badge badge-green">Admin access</span></p>}

      {entitled && <p><a href={`/courses/${course.id}/forum`}>Go to course forum →</a></p>}

      {onTrial && (
        <p><span className="badge badge-green">Free trial until {formatDate(enrollment.trial_ends_at)}</span></p>
      )}
      {isPaid && (
        <p><span className="badge badge-green">Full access until {formatDate(enrollment.paid_until)}</span></p>
      )}
      {enrollment && !entitled && (
        <p>
          <span className="badge badge-amber">Trial ended</span>{" "}
          <a href="/payment-info">See how to unlock full access →</a>
        </p>
      )}

      {topicList.length === 0 ? (
        <p>No content added yet.</p>
      ) : (
        <CourseReader
          topics={panels}
          initialIndex={initialIndex}
          passedCount={passedCount}
          testCount={testCount}
        />
      )}

      {!entitled && topicList.length > 0 && (
        <p style={{ color: "var(--ink-600)" }}>
          This is a free preview. Start your free trial above to unlock the rest of this course.
        </p>
      )}

      {quizzes.length > 0 && (
        <section style={{ marginTop: 32 }}>
          <h2>Quizzes</h2>
          {quizzes.map((quiz) => {
            const attempt = attemptByQuiz.get(quiz.id);
            const phase = quizPhase(quiz, attempt, now);
            const badge = PHASE_BADGE[phase];
            return (
              <div key={quiz.id} className="card">
                <div className="action-row" style={{ justifyContent: "space-between" }}>
                  <strong>{quiz.title}</strong>
                  <span className={`badge ${badge.className}`}>{badge.label}</span>
                </div>
                <p style={{ color: "var(--ink-600)", margin: "6px 0 10px", fontSize: 14 }}>
                  {quiz.duration_minutes} min · Opens {formatDateTime(quiz.opens_at)} · Closes {formatDateTime(quiz.closes_at)}
                </p>
                <a className="btn btn-sm btn-outline" href={`/courses/${course.id}/quizzes/${quiz.id}`}>
                  {phase === "open" ? "Open quiz" : phase === "in_progress" ? "Continue quiz" : phase === "results" ? "View results" : "View details"}
                </a>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
