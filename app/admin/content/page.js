import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ContentManager from "./content-manager";
import AppHeader from "@/components/app-header";

export default async function AdminContentPage() {
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

  const { data: schools } = await supabase
    .from("schools")
    .select(`
      id, name,
      faculties (
        id, name,
        departments (
          id, name,
          courses ( id, code, title, status )
        )
      )
    `)
    .order("name");

  return (
    <main className="app-container app-container--wide">
      <AppHeader profile={profile} />
      <h1>Manage schools & courses</h1>
      <p><a href="/admin">← Back to admin panel</a></p>
      <ContentManager schools={schools || []} />
    </main>
  );
}