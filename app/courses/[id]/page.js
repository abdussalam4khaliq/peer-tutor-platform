import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EnrollButton from "./enroll-button";
import { sanitizeHtml } from "@/lib/sanitize";
import AppHeader from "@/components/app-header";
import RatingWidget from "@/components/rating-widget";

export default async function CourseDetailPage({ params }) {
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
    .select("id, code, title, status, department_id, tutor:profiles(full_name)")
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
    .select("id, title, content, order_index, questions_per_test, question_count, avg_rating, rating_count")
    .eq("course_id", id)
    .order("order_index", { ascending: true });

  const topicIdsForRating = (topics || []).map((t) => t.id);
  const { data: myTopicRatings } = topicIdsForRating.length
    ? await supabase
        .from("forum_ratings")
        .select("target_id, stars")
        .eq("rater_id", user.id)
        .eq("target_type", "topic")
        .in("target_id", topicIdsForRating)
    : { data: [] };
  const myTopicRatingMap = new Map((myTopicRatings || []).map((r) => [r.target_id, r.stars]));

  const topicList = topics || [];
  const topicIds = topicList.map((t) => t.id);

  const { data: attempts } = topicIds.length
    ? await supabase
        .from("test_attempts")
        .select("topic_id, passed")
        .eq("student_id", user.id)
        .in("topic_id", topicIds)
    : { data: [] };

  const passedSet = new Set((attempts || []).filter((a) => a.passed).map((a) => a.topic_id));

  const now = new Date();
  const onTrial = enrollment && now < new Date(enrollment.trial_ends_at);
  const isPaid = enrollment?.paid_until && now < new Date(enrollment.paid_until);
  const entitled = onTrial || isPaid;
  const sameDepartment = profile.department_id === course.department_id;

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href="/courses">← Back to courses</a></p>
      <h1>{course.code} — {course.title}</h1>
      <p style={{ color: "var(--ink-600)" }}>Taught by {course.tutor?.full_name || "a Tutor"}</p>

      {!enrollment && sameDepartment && <p><EnrollButton courseId={course.id} /></p>}

      {(onTrial || isPaid) && <p><a href={`/courses/${course.id}/forum`}>Go to course forum →</a></p>}

      {onTrial && (
        <p><span className="badge badge-green">Free trial until {new Date(enrollment.trial_ends_at).toLocaleDateString()}</span></p>
      )}
      {isPaid && (
        <p><span className="badge badge-green">Full access until {new Date(enrollment.paid_until).toLocaleDateString()}</span></p>
      )}
      {enrollment && !entitled && (
        <p>
          <span className="badge badge-amber">Trial ended</span>{" "}
          <a href="/payment-info">See how to unlock full access →</a>
        </p>
      )}

      {topicList.length === 0 && <p>No content added yet.</p>}

      {topicList.map((topic, index) => {
        const hasQuestions = topic.question_count > 0;
        const passed = passedSet.has(topic.id);
        const prevTopic = index > 0 ? topicList[index - 1] : null;
        const prevHasQuestions = prevTopic ? prevTopic.question_count > 0 : false;
        const prevPassed = prevTopic ? passedSet.has(prevTopic.id) : true;
        const locked = index > 0 && prevHasQuestions && !prevPassed;

        if (locked) {
          return (
            <div key={topic.id} className="card">
              <strong>🔒 {topic.title}</strong>
              <p style={{ color: "var(--ink-600)", margin: "6px 0 0" }}>
                Pass &quot;{prevTopic.title}&quot;&apos;s test to unlock this topic.
              </p>
            </div>
          );
        }

        return (
          <div key={topic.id} className="card">
            <strong>{topic.title}</strong>
            <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(topic.content) }} />
            {hasQuestions && (
              <div className="action-row" style={{ marginTop: 8 }}>
                {passed ? (
                  <span className="badge badge-green">Test passed ✓</span>
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
          </div>
        );
      })}

      {!entitled && topicList.length > 0 && (
        <p style={{ color: "var(--ink-600)" }}>
          This is a free preview. Start your free trial above to unlock the rest of this course.
        </p>
      )}
    </main>
  );
}