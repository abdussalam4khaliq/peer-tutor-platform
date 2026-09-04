export default function NotFound() {
  return (
    <main className="app-container app-container--narrow" style={{ textAlign: "center", paddingTop: 80 }}>
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" style={{ margin: "0 auto 20px" }}>
        <rect x="2" y="4" width="16" height="20" rx="2" fill="#16233D" />
        <rect x="8" y="0" width="16" height="20" rx="2" fill="#2F6B52" fillOpacity="0.85" />
      </svg>
      <h1>Page not found</h1>
      <p className="lede-sm">
        This page doesn&apos;t exist, or the link might be broken. Let&apos;s get you back on track.
      </p>
      <div className="action-row" style={{ justifyContent: "center" }}>
        <a className="btn" href="/dashboard">Go to dashboard</a>
        <a className="btn btn-outline" href="/">Go home</a>
      </div>
    </main>
  );
}