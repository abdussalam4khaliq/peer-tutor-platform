import { NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { initializeTransaction } from "@/lib/paystack";
import { buildSplit, platformKeepsEnough } from "@/lib/split";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const planId = typeof body?.planId === "string" ? body.planId : null;
  const enrollmentIds = Array.isArray(body?.enrollmentIds)
    ? [...new Set(body.enrollmentIds.filter((x) => typeof x === "string"))]
    : [];

  if (!planId || enrollmentIds.length === 0 || enrollmentIds.length > 20) {
    return NextResponse.json({ error: "Pick a plan and at least one course." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.status !== "active") {
    return NextResponse.json({ error: "Your account can't make payments right now." }, { status: 403 });
  }

  // Both lookups run as the logged-in user, so RLS applies.
  const { data: plan } = await supabase
    .from("payment_plans")
    .select("id, name, course_count, price_naira, active")
    .eq("id", planId)
    .maybeSingle();

  if (!plan || !plan.active) {
    return NextResponse.json({ error: "That plan isn't available." }, { status: 400 });
  }

  if (enrollmentIds.length > plan.course_count) {
    return NextResponse.json(
      { error: `That plan covers up to ${plan.course_count} course(s).` },
      { status: 400 }
    );
  }

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select("id")
    .in("id", enrollmentIds)
    .eq("student_id", user.id);

  if (!enrollments || enrollments.length !== enrollmentIds.length) {
    return NextResponse.json({ error: "One of those courses isn't in your enrollments." }, { status: 400 });
  }

  // The price always comes from the database, never from the browser.
  const amountKobo = Math.round(Number(plan.price_naira) * 100);

  const admin = createAdminClient();

  // Work out who gets paid what. Everything here is decided on the server.
  const { data: planned, error: planError } = await admin.rpc("plan_payment_shares", {
    p_student: user.id,
    p_enrollment_ids: enrollmentIds,
    p_plan_id: plan.id,
  });

  if (planError || !planned) {
    console.error("plan_payment_shares failed:", planError);
    return NextResponse.json({ error: "Couldn't start the payment. Please try again." }, { status: 500 });
  }

  // A tutor without a verified payout account can't be paid directly, so we don't take the money.
  // (Otherwise their share would sit with Coursemate, which is exactly what we avoid.)
  if (Array.isArray(planned.missing_tutors) && planned.missing_tutors.length > 0) {
    const courses = [...new Set(planned.missing_tutors.map((m) => m.course_code))].join(", ");
    return NextResponse.json(
      {
        error: `The tutor for ${courses} hasn't finished setting up their payout account yet, so this can't be paid for right now. Please try again later or choose other courses.`,
      },
      { status: 409 }
    );
  }

  const shares = planned.shares || [];

  if (!platformKeepsEnough(amountKobo, shares)) {
    // Only possible if commissions/bonuses are set too high for the plan price.
    console.error("Payout shares too large for plan", { plan: plan.id, amountKobo, shares });
    return NextResponse.json(
      { error: "Payments for this plan are temporarily unavailable. Please contact support." },
      { status: 500 }
    );
  }

  let split;
  try {
    split = buildSplit(shares);
  } catch (err) {
    console.error("buildSplit failed:", err);
    return NextResponse.json({ error: "Couldn't start the payment. Please try again." }, { status: 500 });
  }

  const reference = `CM-${crypto.randomUUID()}`;

  const { data: payment, error: insertError } = await admin
    .from("payments")
    .insert({
      reference,
      student_id: user.id,
      plan_id: plan.id,
      enrollment_ids: enrollmentIds,
      amount_kobo: amountKobo,
      split_mode: true,
    })
    .select("id")
    .single();

  if (insertError || !payment) {
    console.error("payments insert failed:", insertError);
    return NextResponse.json({ error: "Couldn't start the payment. Please try again." }, { status: 500 });
  }

  const { error: planInsertError } = await admin.from("payment_split_plans").insert({
    payment_id: payment.id,
    shares,
    referrer_id: planned.referrer_id || null,
    referral_recurring: planned.referral_recurring ?? null,
  });

  if (planInsertError) {
    console.error("payment_split_plans insert failed:", planInsertError);
    await admin.from("payments").update({ status: "failed", note: "Could not save the payout plan" }).eq("id", payment.id);
    return NextResponse.json({ error: "Couldn't start the payment. Please try again." }, { status: 500 });
  }

  // Always send the student back to the same site they paid from.
  const siteUrl = new URL(request.url).origin;

  try {
    const tx = await initializeTransaction({
      email: profile.email || user.email,
      amountKobo,
      reference,
      callbackUrl: `${siteUrl}/payment/callback`,
      metadata: { student_id: user.id, plan_id: plan.id, plan_name: plan.name },
      split,
    });

    return NextResponse.json({ authorization_url: tx.authorization_url, reference });
  } catch (err) {
    console.error("Paystack initialize failed:", err);
    await admin
      .from("payments")
      .update({ status: "failed", note: "Could not initialize with Paystack" })
      .eq("reference", reference);
    return NextResponse.json({ error: "Couldn't reach the payment provider. Please try again." }, { status: 502 });
  }
}
