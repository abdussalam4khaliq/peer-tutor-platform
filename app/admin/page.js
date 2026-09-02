import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MAX_TUTOR_COURSES } from "@/lib/config";
import { sanitizeHtml } from "@/lib/sanitize";
import ActionButton from "@/components/action-button";
import AppHeader from "@/components/app-header";

export default async function AdminPage() {
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

  const { data: applications } = await supabase
    .from("tutor_applications")
    .select(`
      id, sample_title, sample_content, status, created_at,
      tutor:profiles!tutor_applications_tutor_id_fkey(full_name, email),
      course:courses(code, title)
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select(`
      id, trial_ends_at, paid_until,
      student:profiles!enrollments_student_id_fkey(full_name, email),
      course:courses(code, title)
    `)
    .order("created_at", { ascending: false });

  async function approveApplication(formData) {
    "use server";
    const applicationId = formData.get("applicationId");
    const supabase = await createClient();

    const { data: app } = await supabase
      .from("tutor_applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (!app) return;

    const { count: currentCourseCount } = await supabase
      .from("courses")
      .select("id", { count: "exact", head: true })
      .eq("tutor_id", app.tutor_id);

    if ((currentCourseCount || 0) >= MAX_TUTOR_COURSES) {
      revalidatePath("/admin");
      return;
    }

    const {
      data: { user: reviewer },
    } = await supabase.auth.getUser();

    await supabase
      .from("tutor_applications")
      .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: reviewer.id })
      .eq("id", applicationId);

    await supabase.from("profiles").update({ tutor_status: "approved" }).eq("id", app.tutor_id);
    await supabase.from("courses").update({ tutor_id: app.tutor_id, status: "active" }).eq("id", app.course_id);

    revalidatePath("/admin");
  }

  async function rejectApplication(formData) {
    "use server";
    const applicationId = formData.get("applicationId");
    const supabase = await createClient();

    const { data: app } = await supabase
      .from("tutor_applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (!app) return;

    const {
      data: { user: reviewer },
    } = await supabase.auth.getUser();

    await supabase
      .from("tutor_applications")
      .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: reviewer.id })
      .eq("id", applicationId);

    await supabase.from("profiles").update({ tutor_status: "rejected" }).eq("id", app.tutor_id);

    revalidatePath("/admin");
  }

  async function markPaid(formData) {
    "use server";
    const enrollmentId = formData.get("enrollmentId");
    const supabase = await createClient();
    const paidUntil = new Date();
    paidUntil.setDate(paidUntil.getDate() + 30);

    await supabase.from("enrollments").update({ paid_until: paidUntil.toISOString() }).eq("id", enrollmentId);

    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("student_id")
      .eq("id", enrollmentId)
      .single();

    if (enrollment) {
      const { data: student } = await supabase
        .from("profiles")
        .select("referred_by")
        .eq("id", enrollment.student_id)
        .single();

      if (student?.referred_by) {
        await supabase.from("referral_credits").insert({
          referrer_id: student.referred_by,
          referred_student_id: enrollment.student_id,
          enrollment_id: enrollmentId,
          amount: 100,
        });
      }
    }

    revalidatePath("/admin");
  }

  async function promoteToAdmin(formData) {
    "use server";
    const email = formData.get("email")?.toLowerCase().trim();
    const supabase = await createClient();
    await supabase.from("profiles").update({ role: "admin" }).eq("email", email);
    revalidatePath("/admin");
  }

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />
      <h1>Admin panel</h1>
      <p><a href="/admin/content">Manage schools, faculties & courses →</a></p>

      <h2>Pending Tutor applications</h2>
      {(!applications || applications.length === 0) && <p>Nothing pending.</p>}

      {(applications || []).map((app) => (
        <div key={app.id} className="card">
          <p>
            <strong>{app.tutor?.full_name}</strong> ({app.tutor?.email}) applying for{" "}
            <strong>{app.course?.code} — {app.course?.title}</strong>
          </p>
          <p style={{ fontWeight: "bold" }}>{app.sample_title}</p>
          <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(app.sample_content) }} />

          <div className="action-row" style={{ marginTop: 10 }}>
            <form action={approveApplication}>
              <input type="hidden" name="applicationId" value={app.id} />
              <ActionButton pendingLabel="Approving...">✅ Approve</ActionButton>
            </form>
            <form action={rejectApplication}>
              <input type="hidden" name="applicationId" value={app.id} />
              <ActionButton pendingLabel="Rejecting..." className="btn btn-sm btn-danger">❌ Reject</ActionButton>
            </form>
          </div>
        </div>
      ))}

      <hr style={{ margin: "2rem 0", border: "none", borderTop: "1px solid var(--rule)" }} />
      <h2>Enrollments</h2>
      {(!enrollments || enrollments.length === 0) && <p>No enrollments yet.</p>}
      {(enrollments || []).map((e) => {
        const now = new Date();
        const trialActive = now < new Date(e.trial_ends_at);
        const paidActive = e.paid_until && now < new Date(e.paid_until);
        return (
          <div key={e.id} className="card">
            <p style={{ margin: 0 }}>
              <strong>{e.student?.full_name}</strong> ({e.student?.email}) — {e.course?.code} {e.course?.title}
            </p>
            <p style={{ margin: "4px 0 10px", fontSize: 14, color: "var(--ink-600)" }}>
              {paidActive
                ? `Paid until ${new Date(e.paid_until).toLocaleDateString()}`
                : trialActive
                ? `Trial until ${new Date(e.trial_ends_at).toLocaleDateString()}`
                : "No active access"}
            </p>
            <form action={markPaid}>
              <input type="hidden" name="enrollmentId" value={e.id} />
              <ActionButton pendingLabel="Marking...">Mark paid (+30 days)</ActionButton>
            </form>
          </div>
        );
      })}

      {profile.role === "super_admin" && (
        <>
          <hr style={{ margin: "2rem 0", border: "none", borderTop: "1px solid var(--rule)" }} />
          <h2>Promote a user to admin</h2>
          <form action={promoteToAdmin} className="action-row">
            <input name="email" type="email" placeholder="user@email.com" required style={{ flex: 1, minWidth: 200 }} />
            <ActionButton pendingLabel="Promoting...">Make admin</ActionButton>
          </form>
        </>
      )}
    </main>
  );
}