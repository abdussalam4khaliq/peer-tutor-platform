"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export default function ReportForm() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
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

    if (!email.trim() || !reason.trim()) {
      setError("Please provide the account's email and a reason.");
      return;
    }

    setBusy(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (email.trim().toLowerCase() === user.email.toLowerCase()) {
      setBusy(false);
      setError("You cannot report your own account.");
      return;
    }

    const { data: reportedId, error: lookupError } = await supabase.rpc("lookup_user_by_email", {
      p_email: email.trim(),
    });

    if (lookupError || !reportedId) {
      setBusy(false);
      setError("No account found with that email.");
      return;
    }

    let screenshotPath = null;
    if (file) {
      const path = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("report-evidence").upload(path, file);
      if (uploadError) {
        setBusy(false);
        setError(uploadError.message);
        return;
      }
      screenshotPath = path;
    }

    const { error: insertError } = await supabase.from("reports").insert({
      reporter_id: user.id,
      reported_user_id: reportedId,
      reason: reason.trim(),
      screenshot_path: screenshotPath,
    });

    setBusy(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setEmail("");
    setReason("");
    setFile(null);
    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        placeholder="Email of the account you're reporting"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <textarea
        placeholder="What happened?"
        rows={4}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <label style={{ fontSize: 13 }}>
        Screenshot (optional, image only, under 5MB)
        <input type="file" accept="image/*" onChange={handleFileChange} />
      </label>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {success && <p style={{ color: "var(--moss)" }}>Report submitted. An admin will review it.</p>}

      <button type="submit" className="btn btn-sm" disabled={busy} style={{ alignSelf: "flex-start" }}>
        {busy ? "Submitting..." : "Submit report"}
      </button>
    </form>
  );
}