import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/app-header";
import ProfileForm from "./profile-form";

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, department:departments(name, faculty:faculties(name))")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/complete-profile");

  return (
    <main className="app-container app-container--narrow">
      <AppHeader profile={profile} />
      <h1>Your profile</h1>

      <div className="card">
        <div className="field-row">
          <span className="field-row__label">Email</span>
          <span className="field-row__value">{profile.email}</span>
        </div>
        <div className="field-row">
          <span className="field-row__label">Role</span>
          <span className="field-row__value" style={{ textTransform: "capitalize" }}>{profile.role}</span>
        </div>
        <div className="field-row">
          <span className="field-row__label">School</span>
          <span className="field-row__value">{profile.school}</span>
        </div>
        {profile.department && (
          <div className="field-row">
            <span className="field-row__label">Department</span>
            <span className="field-row__value">{profile.department.faculty?.name} · {profile.department.name}</span>
          </div>
        )}
      </div>

      <h2>Edit details</h2>
      <ProfileForm
        fullName={profile.full_name || ""}
        bio={profile.bio || ""}
        avatarUrl={profile.avatar_url || ""}
      />
    </main>
  );
}