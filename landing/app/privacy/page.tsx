import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Privacy Policy — LeadsIQ',
  description: 'How LeadsIQ collects, uses, and protects your data.',
};

const sections = [
  {
    h: 'Overview',
    p: 'This Privacy Policy explains how LeadsIQ collects, uses, and protects information when you use our website and services. By using LeadsIQ, you agree to the practices described here.',
  },
  {
    h: 'Information we collect',
    p: 'We collect the website URL you provide, account details such as your name and email, and usage data needed to run and improve your campaigns. We also process publicly available business contact data to identify best-fit buyers.',
  },
  {
    h: 'How we use information',
    p: 'We use your information to detect your ideal customer profile, find and rank prospects, generate and send outreach on your behalf, deliver qualified replies, and provide support and billing.',
  },
  {
    h: 'Data sharing',
    p: 'We do not sell your personal data. We share information only with the service providers needed to operate LeadsIQ (for example, email delivery and data enrichment partners), and only as required by law.',
  },
  {
    h: 'Data retention & security',
    p: 'We retain data for as long as your account is active or as needed to provide the service, and we apply industry-standard safeguards to protect it. You may request deletion of your data at any time.',
  },
  {
    h: 'Contact',
    p: 'Questions about this policy? Email us at hello@leadsiq.app.',
  },
];

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="px-6 pt-36 pb-24 md:px-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Privacy Policy</h1>
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
