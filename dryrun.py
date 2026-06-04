"""Dry run: exercises the whole pipeline with FAKE data and NO real API calls.

Nothing is searched, enriched, or emailed for real. This proves the
Ocean -> Kipplo -> EazyReach -> draft -> report chain works and lets you
inspect the report format before you have real API keys.

Run from the project root:
    python dryrun.py

Then open report.csv to see the output. Change FROM_EMAIL below to test how
the per-run sender shows up in the report (from_domain / from_username / from_name).
"""
from leadpipeline.models import Company, DecisionMaker, EmailContact, EmailDraft
from leadpipeline.pipeline import Pipeline, Params
from leadpipeline.clients.ocean import SearchFilter
from leadpipeline.report import Report
from leadpipeline.agent import AutoApprover

# ---- change these per run ----
FROM_EMAIL = "roshan@dentco.in"
FROM_NAME = "Roshan"
# -------------------------------


class FakeOcean:
    def find_companies(self, f):
        return [
            Company("DentCo", "dentco.in", "Health", "11-50", "IN"),
            Company("MediKab", "medikab.in", "Health", "51-200", "IN"),
        ]


class FakeKipplo:
    def find_decision_makers(self, domain, titles, limit):
        slug = domain.split(".")[0]
        return [
            DecisionMaker("Asha Rao", "Asha", "Rao", "Founder",
                          f"https://linkedin.com/in/{slug}-asha", domain, slug),
        ]


class FakeEazy:
    def find_email(self, dm):
        return EmailContact(dm, f"{dm.first_name.lower()}@{dm.domain}", True, 0.95), True


class FakeAgent:
    def draft(self, c):
        dm = c.decision_maker
        return EmailDraft(
            id=c.email,
            from_domain=FROM_EMAIL.split("@")[1],
            from_email=FROM_EMAIL,
            from_name=FROM_NAME,
            to_email=c.email,
            to_name=dm.full_name,
            subject=f"Quick question, {dm.first_name}",
            body=f"<p>Hi {dm.first_name}, reaching out about your work at {dm.company_name}...</p>",
            cc=[],
        )


class FakeBrevo:
    def send(self, d):
        return "FAKE-MSG-" + d.to_email.split("@")[0]


def main():
    rep = Report()
    pipeline = Pipeline(
        FakeOcean(), FakeKipplo(), FakeEazy(),
        FakeAgent(), AutoApprover(), FakeBrevo(), rep,
    )
    pipeline.run(Params(
        company_filter=SearchFilter(limit=2),
        decision_titles=["Founder", "CEO"],
        per_company_limit=1,
    ))
    rep.write_csv("report.csv")
    rep.write_json("report.json")
    print("\nDONE:", rep.summary())
    print("Wrote report.csv and report.json")


if __name__ == "__main__":
    main()
