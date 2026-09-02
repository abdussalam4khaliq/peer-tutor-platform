import AudienceToggle from "@/components/audience-toggle";
import NavMenu from "@/components/nav-menu";

export default function Home() {
  return (
    <>
      <header className="nav">
        <div className="wrap nav__row">
          <a className="nav__brand" href="/">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <rect x="2" y="4" width="16" height="20" rx="2" fill="#16233D" />
              <rect x="8" y="0" width="16" height="20" rx="2" fill="#2F6B52" fillOpacity="0.85" />
            </svg>
            Coursemate
          </a>
          <NavMenu />
        </div>
      </header>

      <section className="hero">
        <div className="wrap hero__grid">
          <AudienceToggle />

          <div className="hero-art">
            <div className="scrap-card scrap-card--notes" aria-hidden="true">
              <span className="scrap-line" style={{ width: "78%" }} />
              <span className="scrap-line" style={{ width: "92%" }} />
              <span className="scrap-line" style={{ width: "55%" }} />
              <span className="scrap-line" style={{ width: "85%" }} />
              <span className="scrap-line" style={{ width: "40%", marginBottom: 0 }} />
            </div>
            <div className="hero-art__arrow" aria-hidden="true">becomes</div>
            <div className="scrap-card scrap-card--topics" aria-hidden="true">
              <div className="scrap-card__tag">CSC201</div>
              <div className="topic-row">
                <span className="topic-check">✓</span> Arrays &amp; pointers
              </div>
              <div className="topic-row">
                <span className="topic-check">✓</span> Linked lists
              </div>
              <div className="topic-row topic-row--locked">
                🔒 Recursion
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="how-it-works">
        <div className="wrap">
          <h2>How Coursemate works</h2>
          <p className="section-lede">
            The same platform, two sides: students studying, and the students who already passed teaching them.
          </p>

          <div className="steps-grid">
            <div>
              <div className="steps-col__label">For students</div>
              <div className="step">
                <span className="step__num">1</span>
                <div>
                  <p className="step__title">Pick your department</p>
                  <p className="step__body">Only courses from your own department show up; nothing irrelevant to sift through.</p>
                </div>
              </div>
              <div className="step">
                <span className="step__num">2</span>
                <div>
                  <p className="step__title">Preview free</p>
                  <p className="step__body">Every course's first two topics are open before you commit to anything.</p>
                </div>
              </div>
              <div className="step">
                <span className="step__num">3</span>
                <div>
                  <p className="step__title">Start a 7-day trial</p>
                  <p className="step__body">Unlock the full course. Pay only if you want to keep going after.</p>
                </div>
              </div>
            </div>

            <div>
              <div className="steps-col__label">For tutors</div>
              <div className="step">
                <span className="step__num">1</span>
                <div>
                  <p className="step__title">Adopt an unclaimed course</p>
                  <p className="step__body">Pick a course in your department that's still looking for a tutor.</p>
                </div>
              </div>
              <div className="step">
                <span className="step__num">2</span>
                <div>
                  <p className="step__title">Submit a sample topic</p>
                  <p className="step__body">Show admins the quality of content you'd actually teach with.</p>
                </div>
              </div>
              <div className="step">
                <span className="step__num">3</span>
                <div>
                  <p className="step__title">Get approved, start teaching</p>
                  <p className="step__body">Build out your topics, and earn as students subscribe to your course.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="why">
        <div className="wrap">
          <h2>Why it's different</h2>
          <p className="section-lede">Coursemate isn't a general notes-sharing site. A few things are deliberate.</p>

          <div className="feature-list">
            <div className="feature">
              <p className="feature__title">Department-scoped, not campus-wide</p>
              <p className="feature__body">You only ever see courses that actually apply to you.</p>
            </div>
            <div className="feature">
              <p className="feature__title">Tutor-vetted content</p>
              <p className="feature__body">Every tutor is reviewed by an admin before their course goes live so not just anyone can post.</p>
            </div>
            <div className="feature">
              <p className="feature__title">A real free preview</p>
              <p className="feature__body">The first two topics of every course, no account trickery required.</p>
            </div>
            <div className="feature">
              <p className="feature__title">Earn by referring</p>
              <p className="feature__body">Share your code. Earn ₦100 the moment someone you referred becomes a paying student.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="referral">
            <div>
              <h3>Everyone gets a referral code</h3>
              <p>Share your link with classmates. The first time someone you referred pays for a course, you earn ₦100 — tracked right on your dashboard.</p>
            </div>
            <div className="referral-code">
              <div className="referral-code__label">Your dashboard shows</div>
              <div className="referral-code__value">coursemate.app/signup?ref=7F3K9D2A</div>
            </div>
          </div>
        </div>
      </section>

      <section className="wrap footer-cta">
        <h2>Pick your department. Start free.</h2>
        <div className="hero__actions">
          <a className="btn-primary" href="/signup">Create a free account</a>
        </div>
      </section>

      <footer className="wrap footer">
        <div>
          <a href="/login">Log in</a>
          <a href="/signup">Sign up</a>
          <a href="#how-it-works">How it works</a>
        </div>
        <div>© {new Date().getFullYear()} Coursemate</div>
      </footer>
    </>
  );
}