import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import PricingPlans from '@/components/PricingPlans';
import Comparison from '@/components/sections/Comparison';
import FAQ from '@/components/sections/FAQ';
import CTABand from '@/components/sections/CTABand';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Pricing — LeadsIQ',
  description: 'Simple, results-based pricing. Pay only when a real person replies with interest.',
};

export default function PricingPage() {
  return (
    <>
      <Navbar />
      <main>
        <section className="px-6 pt-36 pb-10 md:pt-44 md:px-10">
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-primary">
              Pricing
            </span>
            <h1 className="mt-3 text-[clamp(2.25rem,5vw,3.75rem)] font-bold leading-tight tracking-tight text-foreground">
              Simple, results-based pricing
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
              {"You're charged only when a real person replies with interest. Not for opens. Not for clicks."}
            </p>
          </div>
        </section>

        <section className="px-6 pb-10 md:px-10">
          <div className="mx-auto max-w-6xl">
            <PricingPlans />
          </div>
        </section>

        <Comparison />
        <FAQ />
        <CTABand />
      </main>
      <Footer />
    </>
  );
}
