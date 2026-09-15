import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import EnrollmentPayment from "./enrollment-payment";

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
      id, trial_ends_at, paid_until, student_id,
      student:profiles!enrollments_student_id_fkey(full_name, email),
      course:courses(code, title)
    `)
    .order("created_at", { ascending: false });

  const { data: plans } = await supabase
    .from("payment_plans")
    .select("*")
    .eq("active", true)
    .order("sort_order");

  // Group enrollments by student so bundles can be paid in one go
  const byStudent = new Map();
  (enrollments || []).forEach((e) => {
    const key = e.student_id;
    if (!byStudent.has(key)) {
      byStudent.set(key, { student: e.student, enrollments: [] });
    }
    byStudent.get(key).enrollments.push(e);
  });

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />
      <p><a href="/admin">← Back to admin panel</a></p>
      <h1>Enrollments & payments</h1>
      <p className="lede-sm">
        Select the courses a student paid for, pick the matching plan, then confirm. Bundles are paid in one action.
      </p>

      {byStudent.size === 0 && <p>No enrollments yet.</p>}

      {[...byStudent.entries()].map(([studentId, group]) => (
        <EnrollmentPayment
          key={studentId}
          student={group.student}
          enrollments={group.enrollments}
          plans={plans || []}
        />
      ))}
    </main>
  );
}