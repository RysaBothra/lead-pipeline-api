import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import Steps from '@/components/sections/Steps';
import Capabilities from '@/components/sections/Capabilities';
import PricingPlans from '@/components/PricingPlans';
import FAQ from '@/components/sections/FAQ';
import CTABand from '@/components/sections/CTABand';
import Footer from '@/components/Footer';
import Reveal from '@/components/Reveal';

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <HeroSection />
        <Steps />
        <Capabilities />

        <section id="pricing" className="border-t border-border/50 px-6 py-24 md:px-10 md:py-32">
          <div className="mx-auto max-w-6xl">
            <Reveal className="text-center">
              <span className="font-mono text-xs font-medium uppercase tracking-widest text-primary">
                Pricing
              </span>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
                Simple, results-based pricing
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
                {"You're charged only when a real person replies with interest. Not for opens. Not for clicks."}
              </p>
            </Reveal>
            <div className="mt-14">
              <PricingPlans />
            </div>
          </div>
        </section>

        <FAQ />
        <CTABand />
      </main>
      <Footer />
    </>
  );
}
