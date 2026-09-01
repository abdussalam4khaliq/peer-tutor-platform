"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SchoolPicker from "@/components/school-picker";

export default function CompleteProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [role, setRole] = useState("student");
  const [pickerValue, setPickerValue] = useState(null);
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!pickerValue?.departmentId) {
      setError("Please select your school, faculty, and department.");
      return;
    }

    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    let referredBy = null;
    if (referralCode.trim()) {
      const { data: referrerId } = await supabase.rpc("lookup_referrer", { code: referralCode.trim() });
      if (referrerId && referrerId !== user.id) referredBy = referrerId;
    }

    const generatedCode = user.id.replace(/-/g, "").slice(0, 8).toUpperCase();

    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      full_name: user.user_metadata?.full_name || user.user_metadata?.name || "",
      role,
      school: pickerValue.schoolName,
      department_id: pickerValue.departmentId,
      email: user.email,
      referral_code: generatedCode,
      referred_by: referredBy,
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 400, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <h1>Almost done</h1>
      <p>Tell us a bit more about yourself.</p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <SchoolPicker onChange={setPickerValue} />

        <input
          placeholder="Referral code (optional)"
          value={referralCode}
          onChange={(e) => setReferralCode(e.target.value)}
        />

        <label>
          I am a:{" "}
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="student">Student</option>
            <option value="tutor">Tutor</option>
          </select>
        </label>

        {error && <p style={{ color: "red" }}>{error}</p>}

        <button type="submit" disabled={loading}>
          {loading ? "Saving..." : "Continue"}
        </button>
      </form>
    </main>
  );
}