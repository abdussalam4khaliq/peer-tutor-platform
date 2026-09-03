import SignOutButton from "@/app/dashboard/sign-out-button";

export default function AppHeader({ profile }) {
  return (
    <header className="app-header">
      <a href="/dashboard" className="app-header__brand">
        <svg width="20" height="20" viewBox="0 0 26 26" fill="none" aria-hidden="true">
          <rect x="2" y="4" width="16" height="20" rx="2" fill="#16233D" />
          <rect x="8" y="0" width="16" height="20" rx="2" fill="#2F6B52" fillOpacity="0.85" />
        </svg>
        Coursemate
      </a>
      <nav className="app-header__links">
        <a href="/courses">Courses</a>
        <a href="/leaderboards">Leaderboards</a>
        <a href="/leagues">Leagues</a>
        {profile?.role === "tutor" && <a href="/tutor/courses">My courses</a>}
        {(profile?.role === "admin" || profile?.role === "super_admin") && <a href="/admin">Admin</a>}
      </nav>
      <SignOutButton />
    </header>
  );
}