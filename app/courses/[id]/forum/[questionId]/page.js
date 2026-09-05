import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ReplyForm from "./reply-form";
import DeleteButton from "./delete-button";
import RatingWidget from "@/components/rating-widget";

export default async function QuestionPage({ params }) {
  const { id, questionId } = params;
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

  const { data: question } = await supabase
    .from("forum_questions")
    .select("id, title, body, author_id, created_at, avg_rating, rating_count, author:profiles(full_name)")
    .eq("id", questionId)
    .eq("course_id", id)
    .maybeSingle();
  if (!question) notFound();

  const { data: replies } = await supabase
    .from("forum_replies")
    .select("id, body, author_id, created_at, avg_rating, rating_count, author:profiles(full_name)")
    .eq("question_id", questionId)
    .order("created_at", { ascending: true });

  const allReplies = replies || [];
  const tutorReplies = allReplies.filter((r) => r.author_id === course.tutor_id);
  const studentReplies = allReplies
    .filter((r) => r.author_id !== course.tutor_id)
    .sort((a, b) => b.avg_rating - a.avg_rating || new Date(a.created_at) - new Date(b.created_at));

  const allTargetIds = [question.id, ...allReplies.map((r) => r.id)];
  const { data: myRatings } = await supabase
    .from("forum_ratings")
    .select("target_type, target_id, stars")
    .eq("rater_id", user.id)
    .in("target_id", allTargetIds);

  const myRatingMap = new Map((myRatings || []).map((r) => [`${r.target_type}:${r.target_id}`, r.stars]));

  const canModerate = course.tutor_id === user.id || profile.role === "admin" || profile.role === "super_admin";

  function Reply({ r }) {
    const isTutor = r.author_id === course.tutor_id;
    return (
      <div className="card" style={isTutor ? { borderColor: "var(--moss)", borderWidth: 2 } : undefined}>
        <div className="action-row" style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 14, color: "var(--ink-600)" }}>
            {r.author?.full_name || "a student"}
            {isTutor && <span className="badge badge-green" style={{ marginLeft: 6 }}>Tutor</span>}
          </span>
        </div>
        <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{r.body}</p>
        <RatingWidget
          targetType="reply"
          targetId={r.id}
          avgRating={r.avg_rating}
          ratingCount={r.rating_count}
          myRating={myRatingMap.get(`reply:${r.id}`)}
          disabled={r.author_id === user.id}
        />
        {(r.author_id === user.id || canModerate) && <DeleteButton table="forum_replies" id={r.id} />}
      </div>
    );
  }

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href={`/courses/${id}/forum`}>← Back to forum</a></p>

      <div className="card">
        <h1 style={{ marginTop: 0 }}>{question.title}</h1>
        <div className="action-row" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 14, color: "var(--ink-600)" }}>
            Asked by {question.author?.full_name || "a student"}
            {question.author_id === course.tutor_id && <span className="badge badge-green" style={{ marginLeft: 6 }}>Tutor</span>}
          </span>
        </div>
        <p style={{ whiteSpace: "pre-wrap" }}>{question.body}</p>
        <RatingWidget
          targetType="question"
          targetId={question.id}
          avgRating={question.avg_rating}
          ratingCount={question.rating_count}
          myRating={myRatingMap.get(`question:${question.id}`)}
          disabled={question.author_id === user.id}
        />
        {(question.author_id === user.id || canModerate) && (
          <DeleteButton table="forum_questions" id={question.id} redirectTo={`/courses/${id}/forum`} />
        )}
      </div>

      {tutorReplies.length > 0 && (
        <>
          <h2>Tutor's answer</h2>
          {tutorReplies.map((r) => <Reply key={r.id} r={r} />)}
        </>
      )}

      <h2>Replies</h2>
      {studentReplies.length === 0 && <p>No replies yet.</p>}
      {studentReplies.map((r) => <Reply key={r.id} r={r} />)}

      <h2>Add a reply</h2>
      <ReplyForm courseId={id} questionId={questionId} />
    </main>
  );
}