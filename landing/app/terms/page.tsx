import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Terms of Service — LeadsIQ',
  description: 'The terms that govern your use of LeadsIQ.',
};

const sections = [
  {
    h: 'Acceptance of terms',
    p: 'By accessing or using LeadsIQ, you agree to be bound by these Terms of Service. If you do not agree, do not use the service.',
  },
  {
    h: 'The service',
    p: 'LeadsIQ provides AI-powered outbound: identifying best-fit buyers, generating outreach, sending it on your behalf, and delivering qualified replies. You are responsible for the messaging and templates you approve.',
  },
  {
    h: 'Billing',
    p: 'Paid plans and pay-as-you-go charges are billed as described on our Pricing page. For qualified-lead billing, you are charged only when a real person replies with genuine interest. Fees are non-refundable except where required by law.',
  },
  {
    h: 'Acceptable use',
    p: 'You agree not to use LeadsIQ for unlawful, deceptive, or abusive outreach, and to comply with all applicable anti-spam and data-protection laws in the markets you target.',
  },
  {
    h: 'Limitation of liability',
    p: 'LeadsIQ is provided on an as-is basis. To the maximum extent permitted by law, we are not liable for indirect or consequential damages arising from your use of the service.',
  },
  {
    h: 'Contact',
    p: 'Questions about these terms? Email us at hello@leadsiq.app.',
  },
];

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="px-6 pt-36 pb-24 md:px-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Terms of Service</h1>
          <p className="mt-3 text-sm text-muted-foreground">Last updated: June 2026</p>
          <div className="mt-10 space-y-8">
            {sections.map((s) => (
              <div key={s.h}>
                <h2 className="text-xl font-semibold text-foreground">{s.h}</h2>
                <p className="mt-3 leading-relaxed text-muted-foreground">{s.p}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
