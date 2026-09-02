"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SchoolPicker from "@/components/school-picker";

export default function SignupForm() {
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();

  const [fullName, setFullName] = useState("");
  const [referralCode, setReferralCode] = useState(searchParams.get("ref") || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("student");
  const [pickerValue, setPickerValue] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e) {
    e.preventDefault();
    setError(null);

    if (!pickerValue?.departmentId) {
      setError("Please select your school, faculty, and department.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
          school: pickerValue.schoolName,
          department_id: pickerValue.departmentId,
          referral_code: referralCode,
        },
      },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  async function handleGoogleSignup() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="app-container app-container--narrow">
      <h1>Sign up</h1>

      <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />

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
          {loading ? "Creating account..." : "Sign up"}
        </button>
      </form>

      <hr style={{ margin: "1.5rem 0" }} />

      <button onClick={handleGoogleSignup}>Continue with Google</button>

      <p>
        Already have an account? <a href="/login">Log in</a>
      </p>
    </main>
  );
}