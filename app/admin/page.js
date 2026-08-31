import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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