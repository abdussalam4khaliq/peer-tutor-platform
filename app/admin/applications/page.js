import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getMaxCoursesForRole } from "@/lib/config";
import { sanitizeHtml } from "@/lib/sanitize";
import ActionButton from "@/components/action-button";
import AppHeader from "@/components/app-header";

export default async function AdminApplicationsPage() {
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

    const {
      data: { user: reviewer },
    } = await supabase.auth.getUser();

    if (app.tutor_id === reviewer.id) {
      revalidatePath("/admin/applications");
      return;
    }

    const { data: applicantProfile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", app.tutor_id)
      .maybeSingle();

    const { count: currentCourseCount } = await supabase
      .from("courses")
      .select("id", { count: "exact", head: true })
      .eq("tutor_id", app.tutor_id);

    if ((currentCourseCount || 0) >= getMaxCoursesForRole(applicantProfile?.role)) {
      revalidatePath("/admin/applications");
      return;
    }

    await supabase
      .from("tutor_applications")
      .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: reviewer.id })
      .eq("id", applicationId);

    await supabase.from("profiles").update({ tutor_status: "approved" }).eq("id", app.tutor_id);
    await supabase.from("courses").update({ tutor_id: app.tutor_id, status: "active" }).eq("id", app.course_id);

    await supabase.rpc("notify", {
      p_profile_id: app.tutor_id,
      p_type: "tutor_application",
      p_title: "Application approved!",
      p_body: "You're now approved to teach that course.",
      p_link: "/tutor/courses",
    });

    revalidatePath("/admin/applications");
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

    await supabase.rpc("notify", {
      p_profile_id: app.tutor_id,
      p_type: "tutor_application",
      p_title: "Application not approved",
      p_body: "You can review and apply again.",
      p_link: "/apply-tutor",
    });

    revalidatePath("/admin/applications");
  }

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href="/admin">← Back to admin panel</a></p>
      <h1>Tutor applications</h1>

      {(!applications || applications.length === 0) && <p>Nothing pending.</p>}

      {(applications || []).map((app) => (
        <div key={app.id} className="card">
          <p>
            <strong>{app.tutor?.full_name}</strong> ({app.tutor?.email}) applying for{" "}
            <strong>{app.course?.code} — {app.course?.title}</strong>
          </p>
          <p style={{ fontWeight: "bold" }}>{app.sample_title}</p>
          <div className="prose" dangerouslySetInnerHTML={{ __html: sanitizeHtml(app.sample_content) }} />

          {app.tutor?.email === profile.email ? (
            <p style={{ color: "var(--ink-600)", fontSize: 14, marginTop: 10 }}>
              You can&apos;t approve or reject your own application — another admin needs to review this.
            </p>
          ) : (
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
          )}
        </div>
      ))}
    </main>
  );
}