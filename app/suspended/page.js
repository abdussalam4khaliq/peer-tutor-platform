import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "@/app/dashboard/sign-out-button";

export default async function SuspendedPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("status, status_reason")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.status === "active") {
    redirect("/dashboard");
  }

  return (
    <main className="app-container app-container--narrow" style={{ textAlign: "center", paddingTop: 80 }}>
      <h1 style={{ textTransform: "capitalize" }}>Account {profile.status}</h1>
      <p className="lede-sm">
        Your account has been {profile.status} by an admin.
        {profile.status_reason && <> Reason given: {profile.status_reason}</>}
      </p>
      <p className="lede-sm">If you believe this is a mistake, please reach out to support.</p>
      <SignOutButton />
    </main>
  );
}