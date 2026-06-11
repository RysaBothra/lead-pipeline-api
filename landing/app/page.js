// Where "Get started" / "Log in" point — the product dashboard (Render URL for
// now; switch to https://app.leadsiq.app/app once that subdomain's DNS is set up).
const APP_URL = 'https://lead-pipeline-api-8dj0.onrender.com/app';

function Brand() {
  return (
    <span className="brand">
      Leads<img className="markimg" src="/mark.png" alt="iQ" />
    </span>
  );
}

export default function Home() {
  return (
    <>
      <header>
        <div className="wrap">
          <nav>
            <a className="brand" href="#top">
              Leads<img className="markimg" src="/mark.png" alt="iQ" />
            </a>
            <div className="links">
              <a href="#how">How it works</a>
            </div>
            <div className="right">
              <a className="login" href={APP_URL}>Log in</a>
              <a className="btn btn-primary" href={APP_URL}>Get started</a>
            </div>
          </nav>
        </div>
      </header>

      <span id="top" />
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <h1>
              Qualified leads from
              <br />a single domain.
            </h1>
            <p className="sub">
              Drop in a potential client&apos;s domain and LeadsIQ runs your
              entire outbound on autopilot — finding the right decision-makers,
              writing and sending the outreach, following up, and delivering warm
              replies straight to your inbox. End-to-end, hands-off.
            </p>
            <div className="cta">
              <a className="btn btn-primary" href={APP_URL}>Try it free — no card required</a>
              <a className="btn btn-ghost" href="#how">See how it works</a>
            </div>
          </div>
          <div className="demo">
            <div className="vpoints">
              <div className="vp">Finds dozens of companies just like the domain you drop in.</div>
              <div className="vp">Pinpoints their real decision-makers — founders, CEOs, directors — with verified work emails.</div>
              <div className="vp">Personalizes your email template with each prospect&apos;s name and company.</div>
              <div className="vp">Sends it for you, with follow-ups on demand — and never emails the same person twice.</div>
            </div>
          </div>
        </div>
      </section>

      <section id="how">
        <div className="wrap">
          <div className="center">
            <span className="eyebrow">How it works</span>
            <h2>Domain in. Leads out.</h2>
          </div>
          <div className="steps">
            <div className="step">
              <div className="n">1</div>
              <h3>Drop a potential client&apos;s domain</h3>
              <p>We detect your ideal customer automatically.</p>
            </div>
            <div className="step">
              <div className="n">2</div>
              <h3>Find the buyers</h3>
              <p>Look-alike companies and their verified decision-makers.</p>
            </div>
            <div className="step">
              <div className="n">3</div>
              <h3>We reach out</h3>
              <p>Personalizes your template, sends it, and follows up on demand.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="contact">
        <div className="wrap">
          <div className="cta-band">
            <h2>See your first leads today</h2>
            <p>Drop in a potential client&apos;s domain — LeadsIQ does the rest.</p>
            <a className="btn btn-primary" href={APP_URL}>Start free — no card required</a>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap frow">
          <Brand />
          <div className="flinks">
            <a href="#how">How it works</a>
            <a href={APP_URL}>Get started</a>
            <a href="#">Privacy</a>
          </div>
          <div>© 2026 LeadsIQ</div>
        </div>
      </footer>
    </>
  );
}
