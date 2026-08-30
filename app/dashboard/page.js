import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    redirect("/complete-profile");
  }

  return (
    <main style={{ maxWidth: 500, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <h1>Welcome, {profile.full_name || user.email}</h1>
      <p>
        Role: <strong>{profile.role}</strong>
      </p>
      <p>
        School: <strong>{profile.school}</strong>
      </p>
      <SignOutButton />
    </main>
  );
}
