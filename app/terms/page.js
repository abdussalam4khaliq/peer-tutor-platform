import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site";

export const metadata = { title: "Terms of Service — Coursemate" };

export default function TermsPage() {
  return (
    <main className="app-container" style={{ maxWidth: 720 }}>
      <p><a href="/">← Back to Coursemate</a></p>
      <h1>Terms of Service</h1>
      <p className="lede-sm">Last updated: November 2026</p>

      <div className="prose">
        <h2>1. Who we are</h2>
        <p>
          Coursemate ("we," "us," "the platform") is a peer-tutoring platform where students who
          have completed a course create structured content and practice tests for other students
          at their school, in exchange for payment.
        </p>

        <h2>2. Eligibility</h2>
        <p>
          You must be a currently enrolled student (or staff acting in a Tutor/Admin capacity) at a
          participating school, and provide accurate information when signing up — including your
          school and department. You&apos;re responsible for keeping your login credentials secure and
          for all activity on your account.
        </p>

        <h2>3. Accounts and roles</h2>
        <p>
          Every account is a Student, Tutor, or Admin. Tutors must apply and be approved
          by an Admin before they can teach a course, based on a sample of their proposed content.
          Approval isn&apos;t a guarantee of ongoing quality as Admins may revoke a Tutor&apos;s access at any
          time if content or conduct falls below acceptable standards.
        </p>

        <h2>4. Payments and access</h2>
        <p>
          Courses are offered with a free preview (limited topics), a free trial period, and paid
          plans: monthly or semester access to one course or to a bundle of courses. The available
          plans and their prices are shown on the payment page before you pay. Pricing may change;
          changes don&apos;t affect access you have already paid for.
        </p>
        <p>
          Payments are made online through <strong>Paystack</strong>, our payment processor, using the
          payment options Paystack offers at checkout. Coursemate never sees or stores your card
          details or bank login. Your access unlocks automatically once Paystack confirms your
          payment. If you were charged and your access hasn&apos;t unlocked, email{" "}
          <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> with your payment reference.
        </p>
        <p>
          <strong>Refunds:</strong> payments are generally non-refundable once access has been
          unlocked, except where required by law or for genuine errors (for example a duplicate
          payment, or a payment that did not unlock your access). Approved refunds are returned to
          your original payment method through Paystack, and the access that payment gave is removed.
        </p>

        <h2>5. EXP, streaks, leagues, and tournaments</h2>
        <p>
          EXP, streaks, league rankings, and tournament standings are gamified features with{" "}
          <strong>no cash value</strong> and are not redeemable for money. They exist to encourage
          engagement and may be adjusted, reset, or discontinued by us at any time without
          compensation. They are separate from the money earned by Tutors and referrers, described
          in the next section.
        </p>

        <h2>6. How Tutors and referrers are paid (settlement)</h2>
        <p>
          <strong>Coursemate does not hold money on behalf of Tutors or referrers.</strong> 
          Instead, every payment is split automatically by Paystack at the moment the student pays:
        </p>
        <ul>
          <li>
            <strong>Tutor commission:</strong> for each paying student in a Tutor&apos;s course, the
            Tutor&apos;s commission is sent by Paystack directly to the Tutor&apos;s own bank account.
          </li>
          <li>
            <strong>Referral rewards:</strong> when a student you referred pays, a Tutor&apos;s
            referral bonus is sent to their bank account in the same way. Users who are not Tutors
            receive extra days of access instead of cash.
          </li>
          <li>
            <strong>Coursemate&apos;s share:</strong> Coursemate receives only its own platform share of
            the payment. Paystack&apos;s processing fee is covered from Coursemate&apos;s share and is not
            deducted from a Tutor&apos;s commission or referral bonus.
          </li>
        </ul>
        <p>
          <strong>Payout account:</strong> to be paid, a Tutor adds a bank account on the Payouts page.
          We verify the account through Paystack before it is used, and a Paystack settlement account
          is created for it. A Tutor who has not finished setting up a payout account cannot be paid,
          so students are not able to pay for that Tutor&apos;s courses until they have; this is so that
          no one&apos;s earnings are ever held by Coursemate. You are responsible for the accuracy of
          the bank details you provide, and we are not liable for funds settled to an incorrect
          account you supplied.
        </p>
        <p>
          <strong>Timing:</strong> once a payment succeeds, Paystack settles your share to your bank
          account according to Paystack&apos;s settlement schedule. Coursemate does not control
          settlement timing. The Payouts page lists the payments that have been sent to you.
        </p>
        <p>
          <strong>Refunds and reversals:</strong> if a payment is refunded or reversed, the commission
          and referral reward linked to that payment are reversed as well.
        </p>
        
        <p>
          You are responsible for any taxes that apply to money you earn through Coursemate. Commission
          and bonus amounts are set by us, are shown in the app, and may change; changes don&apos;t affect
          payments already made.
        </p>

        <h2>7. Content and conduct</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Upload plagiarized, false, or intentionally misleading course content</li>
          <li>Harass, threaten, or abuse other users in forums or elsewhere on the platform</li>
          <li>Attempt to manipulate tests, ratings, EXP, leagues, or tournaments through fraud, self-dealing, or automation</li>
          <li>Share your account credentials or impersonate another person</li>
          <li>Use the platform for anything unlawful</li>
        </ul>
        <p>
          Tutors retain ownership of the course content they create, but grant Coursemate a license to
          host, display, and distribute it to students on the platform for as long as they remain a
          Tutor for that course.
        </p>

        <h2>8. Reports and moderation</h2>
        <p>
          Users may report accounts or content to Admins, optionally with screenshot evidence. Admins
          may suspend or ban accounts found to violate these Terms. Suspended or banned accounts lose
          access to the platform. Money already paid to your bank account is not affected.
        </p>

        <h2>9. No guarantee of outcomes</h2>
        <p>
          Coursemate provides a platform for peer-created educational content. We don&apos;t guarantee
          the accuracy, completeness, or quality of any Tutor&apos;s content, nor any particular academic
          outcome from using it.
        </p>

        <h2>10. Changes to these Terms</h2>
        <p>
          We may update these Terms as the platform evolves. Continued use after a change means you
          accept the updated Terms.
        </p>

        <h2>11. Contact</h2>
        <p>Questions about these Terms can be sent to <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.</p>
      </div>
    </main>
  );
}