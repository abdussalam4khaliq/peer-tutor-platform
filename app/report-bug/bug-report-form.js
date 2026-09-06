"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function BugReportForm() {
  const router = useRouter();
  const supabase = createClient();

  const [category, setCategory] = useState("bug");
  const [description, setDescription] = useState("");
  const [pageContext, setPageContext] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.type.startsWith("image/")) {
      setError("Screenshot must be an image file.");
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError("Screenshot must be under 5MB.");
      return;
    }
    setError(null);
    setFile(f);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!description.trim()) {
      setError("Please describe the issue.");
      return;
    }

    setBusy(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let screenshotPath = null;
    if (file) {
      const path = `${user.id}/bug/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("report-evidence").upload(path, file);
      if (uploadError) {
        setBusy(false);
        setError(uploadError.message);
        return;
      }
      screenshotPath = path;
    }

    const { error: insertError } = await supabase.from("bug_reports").insert({
      reporter_id: user.id,
      category,
      description: description.trim(),
      page_context: pageContext.trim() || null,
      screenshot_path: screenshotPath,
    });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setDescription("");
    setPageContext("");
    setFile(null);
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label>
        Type
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="bug">Bug — something's broken</option>
          <option value="feature_request">Feature request</option>
          <option value="other">Other</option>
        </select>
      </label>

      <textarea
        placeholder="Describe what happened, and what you expected instead..."
        rows={4}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      <input
        placeholder="Which page or feature? (optional)"
        value={pageContext}
        onChange={(e) => setPageContext(e.target.value)}
      />

      <label style={{ fontSize: 13 }}>
        Screenshot (optional, image only, under 5MB)
        <input type="file" accept="image/*" onChange={handleFileChange} />
      </label>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {success && <p style={{ color: "var(--moss)" }}>Thanks — this has been reported.</p>}

      <button type="submit" className="btn btn-sm" disabled={busy} style={{ alignSelf: "flex-start" }}>
        {busy ? "Submitting..." : "Submit"}
      </button>
    </form>
  );
}