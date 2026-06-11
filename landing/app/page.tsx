export default function Home() {
  return (
    <section className="relative h-screen w-full overflow-hidden bg-black">
      {/* Fullscreen looping background video */}
      <video
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        loop
        muted
        playsInline
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_063509_7d167302-4fd4-480b-8260-18ab572333d4.mp4"
      />

      {/* Bottom gradient overlay (sits above the video, below the text) */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-b from-transparent to-black" />

      {/* Floating pill navbar */}
      <nav className="absolute top-0 left-0 right-0 z-20 px-6 md:px-10 pt-6 flex items-center justify-between gap-4">
        {/* Left pill — the LeadsIQ logo lockup: "Leads" + the iQ mark */}
        <div className="flex items-center gap-[3px] bg-neutral-900/90 backdrop-blur rounded-full pl-5 pr-6 py-3">
          <span className="text-white text-[15px] font-semibold tracking-tight">Leads</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mark.png" alt="iQ" className="h-6 w-auto" />
        </div>

        {/* Center pill — nav links (hidden on mobile) */}
        <div className="hidden md:flex items-center gap-1 bg-neutral-900/90 backdrop-blur rounded-full px-3 py-2">
          <a href="#" className="text-neutral-300 hover:text-white transition-colors text-sm px-5 py-2 rounded-full">
            platform
          </a>
          <a href="#" className="text-neutral-300 hover:text-white transition-colors text-sm px-5 py-2 rounded-full">
            how it works
          </a>
          <a href="#" className="text-neutral-300 hover:text-white transition-colors text-sm px-5 py-2 rounded-full">
            pricing
          </a>
          <a href="#" className="text-neutral-300 hover:text-white transition-colors text-sm px-5 py-2 rounded-full">
            support
          </a>
        </div>

        {/* Right — CTA button */}
        <a
          href="/app"
          className="bg-white text-black text-sm font-normal rounded-full px-6 py-3 hover:bg-neutral-200 transition-colors"
        >
          get started
        </a>
      </nav>

      {/* Foreground content */}
      <div className="relative h-full w-full">
        {/* Staggered giant headline */}
        <h1 className="hero-title absolute text-white font-medium text-[14vw] md:text-[13vw] left-4 md:left-10 top-[18%]">
          find
        </h1>
        <h1 className="hero-title absolute text-white font-medium text-[14vw] md:text-[13vw] right-4 md:right-10 top-[38%]">
          your
        </h1>
        <h1 className="hero-title absolute text-white font-medium text-[14vw] md:text-[13vw] left-[18%] md:left-[28%] top-[58%]">
          buyers
        </h1>

        {/* Description */}
        <p className="absolute left-6 md:left-10 top-[46%] max-w-[240px] text-[15px] leading-snug text-white/90">
          drop in a domain and we find the right buyers, write the outreach, and send it for you
        </p>

        {/* Stat — top right */}
        <div className="absolute right-6 md:right-24 top-[14%]">
          <div className="flex items-center gap-3 justify-end">
            <span className="hidden md:block h-px w-24 bg-white/40 rotate-[20deg]" />
            <span className="text-4xl md:text-5xl font-medium tracking-tight">+65k</span>
          </div>
          <div className="text-xs md:text-sm text-white/70 mt-1 text-right">leads found</div>
        </div>

        {/* Stat — bottom left */}
        <div className="absolute left-6 md:left-20 bottom-20 md:bottom-24">
          <div className="flex items-center gap-3">
            <span className="text-4xl md:text-5xl font-medium tracking-tight">+1.5m</span>
            <span className="hidden md:block h-px w-24 bg-white/40 rotate-[-20deg]" />
          </div>
          <div className="text-xs md:text-sm text-white/70 mt-1">emails sent</div>
        </div>

        {/* Stat — bottom right */}
        <div className="absolute right-6 md:right-20 bottom-16 md:bottom-20">
          <div className="flex items-center gap-3 justify-end">
            <span className="hidden md:block h-px w-24 bg-white/40 rotate-[-20deg]" />
            <span className="text-4xl md:text-5xl font-medium tracking-tight">+300k</span>
          </div>
          <div className="text-xs md:text-sm text-white/70 mt-1 text-right">replies</div>
        </div>
      </div>
    </section>
  );
}
