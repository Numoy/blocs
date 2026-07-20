import type { Metadata, Viewport } from "next";
import { Toaster } from 'sonner';
import PlausibleProvider from "next-plausible";
import "./globals.css";
import { Orbitron, Space_Grotesk } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import { ClientRoot } from "@/components/providers/ClientRoot";
import { Header } from "@/components/layout/Header";
import { ProgramProvider } from "@/context/ProgramContext";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { getSiteOrigin, getSiteUrl } from "@/utils/siteUrl";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  variable: "--font-display",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

const metadataBase = getSiteUrl();
const siteUrl = getSiteOrigin();
const siteName = "Mars Blocs";
const siteDescription =
  "Claim, own, and trade land plots on Planet Mars on-chain using Solana. Join the 10,000 plots planetary colony.";
const defaultOgImage = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "Mars Blocs: 10,000 ownable plots on Planet Mars",
};


export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Mars Blocs | 10,000 Plots on Planet Mars",
    template: "%s | Mars Blocs",
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: [
    "Mars Plots",
    "Mars land plots",
    "Solana Mars",
    "decentralized land",
    "space real estate",
    "planetary colony map",
    "Solana",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  openGraph: {
    title: siteName,
    description: siteDescription,
    url: siteUrl,
    siteName,
    images: [defaultOgImage],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteName,
    description: siteDescription,
    images: [defaultOgImage.url],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0a14",
};

const webSiteStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteName,
  url: siteUrl,
  description: siteDescription,
  inLanguage: "en-US",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${orbitron.variable} ${spaceGrotesk.variable} app-font`} suppressHydrationWarning>
        <div className="aurora" aria-hidden="true">
          <b className="auroraP1" />
          <b className="auroraP2" />
          <b className="auroraP3" />
          <span className="auroraGrain" />
        </div>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteStructuredData) }}
        />
        <PlausibleProvider
          src="https://analytics.marvinmaerz.com/js/pa-3HPsBPc6MtBPaeuGOplYw.js"
          enabled={process.env.NODE_ENV === "production"}
        >
          <ClientRoot>
            <ProgramProvider>
              <ErrorBoundary>
                <Header />
                {children}
              </ErrorBoundary>
              <Toaster position="bottom-right" theme="dark" />
            </ProgramProvider>
          </ClientRoot>
        </PlausibleProvider>
      </body>
    </html>
  );
}
