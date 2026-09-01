import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import MarkPaidButton from "./mark-paid-button";

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

    const {
      data: { user: reviewer },
    } = await supabase.auth.getUser();

    await supabase
      .from("tutor_applications")
      .update({ status: "approved", reviewed_at: new Date().toISOString(), reviewed_by: reviewer.id })
      .eq("id", applicationId);

    await supabase
      .from("profiles")
      .update({ tutor_status: "approved" })
      .eq("id", app.tutor_id);

    await supabase
      .from("courses")
      .update({ tutor_id: app.tutor_id, status: "active" })
      .eq("id", app.course_id);

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

    await supabase
      .from("profiles")
      .update({ tutor_status: "rejected" })
      .eq("id", app.tutor_id);

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
        // Ignores the error if a credit already exists for this student (unique constraint) —
        // that's expected on repeat payments, since credit is only earned once.
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
    <main style={{ maxWidth: 700, margin: "3rem auto", fontFamily: "sans-serif" }}>
            <h1>Admin panel</h1>
            <p><a href="/admin/content">Manage schools, faculties & courses →</a></p>

      <h2>Pending Tutor applications</h2>
      {(!applications || applications.length === 0) && <p>Nothing pending.</p>}

      {(applications || []).map((app) => (
        <div key={app.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem", marginBottom: "1rem" }}>
          <p>
            <strong>{app.tutor?.full_name}</strong> ({app.tutor?.email}) applying for{" "}
            <strong>{app.course?.code} — {app.course?.title}</strong>
          </p>
          <p style={{ fontWeight: "bold" }}>{app.sample_title}</p>
          <p style={{ whiteSpace: "pre-wrap", color: "#333" }}>{app.sample_content}</p>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <form action={approveApplication}>
              <input type="hidden" name="applicationId" value={app.id} />
              <button type="submit">✅ Approve</button>
            </form>
            <form action={rejectApplication}>
              <input type="hidden" name="applicationId" value={app.id} />
              <button type="submit">❌ Reject</button>
            </form>
          </div>
        </div>
      ))}

      <hr style={{ margin: "2rem 0" }} />
      <h2>Enrollments</h2>
      {(!enrollments || enrollments.length === 0) && <p>No enrollments yet.</p>}
      {(enrollments || []).map((e) => {
        const now = new Date();
        const trialActive = now < new Date(e.trial_ends_at);
        const paidActive = e.paid_until && now < new Date(e.paid_until);
        return (
          <div key={e.id} style={{ border: "1px solid #eee", borderRadius: 6, padding: "0.5rem", marginBottom: "0.5rem" }}>
            <p style={{ margin: 0 }}>
              <strong>{e.student?.full_name}</strong> ({e.student?.email}) — {e.course?.code} {e.course?.title}
            </p>
            <p style={{ margin: 0, fontSize: 14, color: "#666" }}>
              {paidActive
                ? `Paid until ${new Date(e.paid_until).toLocaleDateString()}`
                : trialActive
                ? `Trial until ${new Date(e.trial_ends_at).toLocaleDateString()}`
                : "No active access"}
            </p>
            <form action={markPaid}>
              <input type="hidden" name="enrollmentId" value={e.id} />
              <MarkPaidButton />
            </form>
          </div>
        );
      })}

      {profile.role === "super_admin" && (
        <>
          <hr style={{ margin: "2rem 0" }} />
          <h2>Promote a user to admin</h2>
          <form action={promoteToAdmin} style={{ display: "flex", gap: 8 }}>
            <input name="email" type="email" placeholder="user@email.com" required />
            <button type="submit">Make admin</button>
          </form>
        </>
      )}
    </main>
  );
}