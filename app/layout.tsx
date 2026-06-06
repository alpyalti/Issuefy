import type { Metadata } from "next";
import { Newsreader, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

// Editorial serif (variable: optical size + italics) → --font-serif.
// preload:true because Newsreader is above the fold on the landing page
// (headline + hero) and every auth page, so a font-swap flash hurts LCP.
const serif = Newsreader({
  subsets: ["latin"],
  display: "swap",
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-serif",
  preload: true,
});

// Interface sans (variable) → --font-sans
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

// Data mono (static weights) → --font-mono
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
  variable: "--font-mono",
});

const SITE = process.env.APP_URL?.replace(/\/+$/, "") || "https://issuefy.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: {
    default: "Issuefy — Daily AI market intelligence",
    template: "%s · Issuefy",
  },
  description:
    "Issuefy monitors competitors, market signals, customer pain points, and business risks from public web sources, then delivers a short, sourced brief to your inbox every morning.",
  applicationName: "Issuefy",
  keywords: [
    "market intelligence", "competitor monitoring", "AI brief",
    "competitive intelligence", "B2B SaaS", "daily market briefing",
  ],
  authors: [{ name: "Issuefy" }],
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/brand/favicon.svg",
  },
  openGraph: {
    type: "website",
    siteName: "Issuefy",
    url: "/",
    title: "Issuefy — Daily AI market intelligence",
    description: "One short, sourced market brief every morning. Built for teams that read the room.",
    images: [{
      url: "/og-image.png",
      width: 1200, height: 630,
      alt: "Issuefy — Daily AI market intelligence",
    }],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Issuefy — Daily AI market intelligence",
    description: "One short, sourced market brief every morning. Built for teams that read the room.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true, follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/onboarding"
    >
      <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
        <body>
          {/* Keyboard-only skip link — first focusable element on every page,
              jumps over the global chrome to the page's main content. */}
          <a href="#main-content" className="skip-link">Skip to main content</a>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
