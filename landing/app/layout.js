import './globals.css';

export const metadata = {
  title: 'LeadsIQ — Qualified leads from a single domain',
  description:
    "Drop in a potential client's domain and LeadsIQ runs your outbound on autopilot — finds the decision-makers, personalizes the outreach, sends it, and follows up.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
