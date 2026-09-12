export const metadata = { title: "Privacy Policy — Coursemate" };

export default function PrivacyPage() {
  return (
    <main className="app-container" style={{ maxWidth: 720 }}>
      <p><a href="/">← Back to Coursemate</a></p>
      <h1>Privacy Policy</h1>
      <p className="lede-sm">Last updated: September 2026</p>

      <div className="prose">
        <h2>1. What we collect</h2>
        <ul>
          <li><strong>Account info:</strong> name, email, school, department, and role</li>
          <li><strong>Activity data:</strong> courses taken, test scores, forum posts and ratings, EXP and streaks</li>
          <li><strong>Payment-related info:</strong> bank name, account number, and account name — collected only if you request a withdrawal</li>
          <li><strong>Profile content:</strong> a profile photo and short bio, if you choose to add them</li>
          <li><strong>Report evidence:</strong> screenshots you submit when reporting an account or a bug</li>
        </ul>

        <h2>2. How we use it</h2>
        <p>
          We use this information to run the platform: matching you to the right courses, tracking
          your progress, processing payments and payouts, moderating reports, and improving the
          service. We don&apos;t sell your personal data to third parties.
        </p>

        <h2>3. Who can see what</h2>
        <ul>
          <li>Your name and activity in forums/leaderboards are visible to other users at your school, as part of normal platform use</li>
          <li>Your bank details are visible only to you and to Admins reviewing withdrawal requests — never to other students or Tutors</li>
          <li>Screenshots you submit in a report are visible only to you and Admins</li>
          <li>Admins can view account details as needed for moderation and support</li>
        </ul>

        <h2>4. Where your data lives</h2>
        <p>
          Your data is stored with our infrastructure providers. These providers have their own security and
          privacy practices as major infrastructure companies.
        </p>

        <h2>5. Security</h2>
        <p>
          Passwords are handled by our authentication provider and never stored as plain text.
          Sensitive data like bank details and report screenshots are protected by access-control
          rules that restrict who can view them, enforced at the database level.
        </p>

        <h2>6. Your rights</h2>
        <p>
          You can edit most of your profile information yourself at any time. To request correction
          or deletion of other data, or to ask what data we hold about you, contact the support
          contact listed on the platform.
        </p>

        <h2>7. Age</h2>
        <p>
          Coursemate is intended for university students. If you believe a user is under the minimum
          age required in your jurisdiction, please report it to us.
        </p>

        <h2>8. Cookies and analytics</h2>
        <p>
          We use essential cookies to keep you logged in. We also use a third-party product analytics
          service, to understand how the platform is used and how to better cater for your needs. This 
          is limited to your account role and school for grouping purposes; we don&apos;t send your name 
          or email to this service, and we don&apos;t record your screen. We don&apos;t use advertising or
          third-party tracking cookies, and analytics data isn&apos;t used to target ads.
        </p>

        <h2>9. Changes to this policy</h2>
        <p>We may update this policy as the platform evolves, and will update the date above when we do.</p>

        <h2>10. Contact</h2>
        <p>Questions about this policy can be sent to the support contact listed on the platform.</p>
      </div>
    </main>
  );
}