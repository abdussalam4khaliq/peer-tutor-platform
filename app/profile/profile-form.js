"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX_FILE_SIZE = 3 * 1024 * 1024;

export default function ProfileForm({ fullName, bio, avatarUrl }) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState(fullName);
  const [bioText, setBioText] = useState(bio);
  const [preview, setPreview] = useState(avatarUrl);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setError("Profile picture must be an image file.");
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setError("Image must be under 3MB.");
      return;
    }
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!name.trim()) {
      setError("Name can't be empty.");
      return;
    }

    setBusy(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    let avatar_url = avatarUrl;

    if (file) {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });

      if (uploadError) {
        setBusy(false);
        setError(uploadError.message);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(path);
      avatar_url = publicUrlData.publicUrl;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ full_name: name.trim(), bio: bioText.trim(), avatar_url })
      .eq("id", user.id);

    setBusy(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {preview ? (
          <img
            src={preview}
            alt="Profile"
            style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover", border: "1px solid var(--rule)" }}
          />
        ) : (
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-display)",
              fontSize: 22,
              color: "var(--ink-600)",
            }}
          >
            {name?.[0]?.toUpperCase() || "?"}
          </div>
        )}
        <label style={{ fontSize: 13 }}>
          Change photo
          <input type="file" accept="image/*" onChange={handleFileChange} />
        </label>
      </div>

      <label>
        Full name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <label>
        Bio (optional)
        <textarea rows={3} value={bioText} onChange={(e) => setBioText(e.target.value)} placeholder="A short line about yourself..." />
      </label>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {success && <p style={{ color: "var(--moss)" }}>Saved.</p>}

      <button type="submit" className="btn btn-sm" disabled={busy} style={{ alignSelf: "flex-start" }}>
        {busy ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}