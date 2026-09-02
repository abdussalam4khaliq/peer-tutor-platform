"use client";

import { useFormStatus } from "react-dom";

export default function ActionButton({ children, pendingLabel = "Working...", className = "btn btn-sm" }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}