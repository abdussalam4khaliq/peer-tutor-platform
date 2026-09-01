"use client";

import { useFormStatus } from "react-dom";

export default function MarkPaidButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending}>
      {pending ? "Marking..." : "Mark paid (+30 days)"}
    </button>
  );
}