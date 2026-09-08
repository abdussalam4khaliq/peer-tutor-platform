export const metadata = { title: "Terms of Service — Coursemate" };

export default function TermsPage() {
  return (
    <main className="app-container" style={{ maxWidth: 720 }}>
      <p><a href="/">← Back to Coursemate</a></p>
      <h1>Terms of Service</h1>
      <p className="lede-sm">Last updated: September 2026</p>

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
          Courses are offered on a free preview (limited topics), a free trial period, and a paid
          monthly subscription. Payment is currently collected by direct bank transfer, manually
          confirmed by an Admin as there is no automated payment gateway at this time, and access is
          granted at the Admin&apos;s discretion once a transfer is confirmed. Course pricing may change;
          changes don&apos;t affect access already granted at a previous price.
        </p>
        <p>
          <strong>Refunds:</strong> because pricing is low and access is granted manually, payments are
          generally non-refundable once access has been unlocked, except where required by law or at
          an Admin&apos;s discretion for genuine errors (e.g. a duplicate payment).
        </p>

        <h2>5. EXP, streaks, leagues, and tournaments</h2>
        <p>
          EXP, streaks, league rankings, and tournament standings are gamified features with{" "}
          <strong>no cash value</strong> and are not redeemable for money. They exist to encourage
          engagement and may be adjusted, reset, or discontinued by us at any time without
          compensation. This is separate from your <strong>wallet balance</strong> (see below), which
          does represent real money owed to you.
        </p>

        <h2>6. Wallet, commissions, and withdrawals</h2>
        <p>
          Tutors earn a commission for each paying student in their course, and any user earns a
          one-time bonus for referring a student who becomes a paying subscriber. These amounts
          accumulate in your in-app wallet and can be withdrawn, subject to a minimum withdrawal
          amount, once you&apos;ve provided accurate bank account details. Withdrawals are processed
          manually by an Admin via bank transfer and are not instant — we aim to process them
          promptly but don&apos;t guarantee a specific timeframe. You&apos;re responsible for the accuracy of
          the bank details you provide; we&apos;re not liable for funds sent to an incorrect account you
          supplied.
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
          access to the platform but retain any wallet balance already earned, which can still be
          withdrawn subject to normal processing.
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
        <p>Questions about these Terms can be sent to the support contact listed on the platform.</p>
      </div>
    </main>
  );
}