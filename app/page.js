export default function Home() {
  const supabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  return (
    <main style={{ padding: "4rem", fontFamily: "sans-serif" }}>
      <h1>Peer Tutor Platform 🎓</h1>
      <p>Phase 0 checkpoint: the app is deployed and running.</p>
      <p>
        Supabase connection:{" "}
        <strong>{supabaseConfigured ? "✅ configured" : "❌ not configured yet"}</strong>
      </p>
    </main>
  );
}
