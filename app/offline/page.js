import OfflineCourses from "@/components/offline-courses";

export const metadata = { title: "Offline — Coursemate" };

// Public on purpose: this is what people see when a page can't be loaded without a connection.
export default function OfflinePage() {
  return (
    <main className="app-container app-container--narrow">
      <h1>You&apos;re offline</h1>
      <p className="lede-sm">
        There&apos;s no connection right now. Courses you&apos;ve opened recently are saved on this device, so you can still read them.
      </p>
      <OfflineCourses />
      <p style={{ marginTop: 24 }}>
        <a className="btn btn-outline btn-sm" href="/dashboard">Try again</a>
      </p>
    </main>
  );
}
