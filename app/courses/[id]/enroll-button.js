"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function EnrollButton({ courseId }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleEnroll() {
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("enrollments").insert({
      student_id: user.id,
      course_id: courseId,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.refresh();
  }

  return (
    <>
      <button onClick={handleEnroll} disabled={loading}>
        {loading ? "Starting..." : "Start 7-day free trial"}
      </button>
      {error && <span style={{ color: "red", marginLeft: 8 }}>{error}</span>}
    </>
  );
}