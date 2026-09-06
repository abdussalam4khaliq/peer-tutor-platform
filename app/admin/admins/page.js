import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import ActionButton from "@/components/action-button";
import AppHeader from "@/components/app-header";

export default async function AdminAdminsPage() {
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
  if (!profile || profile.role !== "super_admin") {
    redirect("/dashboard");
  }

  const { data: admins } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "admin")
    .order("full_name");

  const { data: superAdmins } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "super_admin")
    .order("full_name");

  async function promoteToAdmin(formData) {
    "use server";
    const email = formData.get("email")?.toLowerCase().trim();
    const supabase = await createClient();
    await supabase.from("profiles").update({ role: "admin" }).eq("email", email);
    revalidatePath("/admin/admins");
  }

  async function demoteAdmin(formData) {
    "use server";
    const targetId = formData.get("targetId");
    const supabase = await createClient();

    const { count } = await supabase
      .from("courses")
      .select("id", { count: "exact", head: true })
      .eq("tutor_id", targetId);

    if ((count || 0) > 0) {
      revalidatePath("/admin/admins");
      return;
    }

    await supabase.from("profiles").update({ role: "student" }).eq("id", targetId);
    revalidatePath("/admin/admins");
  }

  return (
    <main className="app-container">
      <AppHeader profile={profile} />
      <p><a href="/admin">← Back to admin panel</a></p>
      <h1>Manage admins</h1>

      <h2>Promote a user to admin</h2>
      <form action={promoteToAdmin} className="action-row">
        <input name="email" type="email" placeholder="user@email.com" required style={{ flex: 1, minWidth: 200 }} />
        <ActionButton pendingLabel="Promoting...">Make admin</ActionButton>
      </form>

      <h2>Current admins</h2>
      {(!admins || admins.length === 0) && <p>No admins yet.</p>}
      {(admins || []).map((a) => (
        <div key={a.id} className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span>{a.full_name} ({a.email})</span>
          <form action={demoteAdmin}>
            <input type="hidden" name="targetId" value={a.id} />
            <ActionButton pendingLabel="Demoting..." className="btn btn-sm btn-outline">Demote to student</ActionButton>
          </form>
        </div>
      ))}

      <h2>Super admins</h2>
      {(superAdmins || []).map((a) => (
        <div key={a.id} className="card">{a.full_name} ({a.email})</div>
      ))}
    </main>
  );
}