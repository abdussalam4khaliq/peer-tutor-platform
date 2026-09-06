import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import ActionButton from "@/components/action-button";
import AppHeader from "@/components/app-header";

export default async function AdminEnrollmentsPage() {
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

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select(`
      id, trial_ends_at, paid_until,
      student:profiles!enrollments_student_id_fkey(full_name, email),
      course:courses(code, title)
    `)
    .order("created_at", { ascending: false });

  async function markPaid(formData) {
    "use server";
    const enrollmentId = formData.get("enrollmentId");
    const supabase = await createClient();
    await supabase.rpc("mark_enrollment_paid", { p_enrollment_id: enrollmentId });
    revalidatePath("/admin/enrollments");
  }

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href="/admin">← Back to admin panel</a></p>
      <h1>Enrollments & payments</h1>

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
              <ActionButton pendingLabel="Marking...">Mark paid (+30 days) — ₦1000</ActionButton>
            </form>
          </div>
        );
      })}
    </main>
  );
}