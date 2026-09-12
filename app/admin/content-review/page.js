import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ActionButton from "@/components/action-button";

export default async function ContentReviewPage() {
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
  if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
    redirect("/dashboard");
  }

  const { data: flagged } = await supabase.rpc("get_flagged_topics");

  async function dismiss(formData) {
    "use server";
    const topicId = formData.get("topicId");
    const supabase = await createClient();
    await supabase.rpc("dismiss_topic_flag", { p_topic_id: topicId });
  }

  async function toggleHidden(formData) {
    "use server";
    const topicId = formData.get("topicId");
    const supabase = await createClient();
    await supabase.rpc("toggle_topic_hidden", { p_topic_id: topicId });
  }

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href="/admin">← Back to admin panel</a></p>
      <h1>Content review</h1>
      <p className="lede-sm">
        Topics with an average rating below 2.5★ across at least 5 ratings show up here automatically.
      </p>

      {(!flagged || flagged.length === 0) && <p>Nothing flagged right now.</p>}

      {(flagged || []).map((t) => (
        <div key={t.topic_id} className="card">
          <p style={{ margin: "0 0 4px" }}>
            <strong>{t.title}</strong>{" "}
            <span className="badge badge-amber">{t.avg_rating}★ ({t.rating_count} ratings)</span>
            {t.hidden && <span className="badge badge-grey" style={{ marginLeft: 6 }}>Unpublished</span>}
          </p>
          <p style={{ margin: "0 0 10px", fontSize: 14, color: "var(--ink-600)" }}>
            {t.course_code} — {t.course_title} · Tutor: {t.tutor_name} ({t.tutor_email})
          </p>
          <div className="action-row">
            <a className="btn btn-outline btn-sm" href={`/courses/${t.course_id}`}>View course →</a>
            <form action={dismiss}>
              <input type="hidden" name="topicId" value={t.topic_id} />
              <ActionButton pendingLabel="Dismissing..." className="btn btn-sm btn-outline">Leave as-is</ActionButton>
            </form>
            <form action={toggleHidden}>
              <input type="hidden" name="topicId" value={t.topic_id} />
              <ActionButton pendingLabel="Updating..." className="btn btn-sm btn-danger">
                {t.hidden ? "Republish" : "Unpublish"}
              </ActionButton>
            </form>
          </div>
        </div>
      ))}
    </main>
  );
}