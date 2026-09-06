"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ReportScreenshot({ path }) {
  const supabase = createClient();
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    supabase.storage
      .from("report-evidence")
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (error || !data?.signedUrl) {
          setError(true);
          return;
        }
        setUrl(data.signedUrl);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  if (error) return <p style={{ fontSize: 13, color: "var(--ink-600)" }}>Couldn&apos;t load screenshot.</p>;
  if (!url) return <p style={{ fontSize: 13, color: "var(--ink-600)" }}>Loading screenshot...</p>;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img src={url} alt="Report evidence" style={{ maxWidth: 300, borderRadius: 8, marginTop: 8 }} />
    </a>
  );
}