import type { Metadata, Viewport } from "next";
import { Toaster } from 'sonner';
import PlausibleProvider from "next-plausible";
import "./globals.css";
// import { Inter } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import { ClientRoot } from "@/components/providers/ClientRoot";
import { Header } from "@/components/layout/Header";
import { ProgramProvider } from "@/context/ProgramContext";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { getSiteOrigin, getSiteUrl } from "@/utils/siteUrl";

const metadataBase = getSiteUrl();
const siteUrl = getSiteOrigin();
const siteName = "Blocs";
const siteDescription =
  "A decentralized 100x100 grid on Solana where you can buy, trade, and own one of 10,000 blocks permanently.";
const defaultOgImage = {
  url: "/og-image.png",
  width: 1200,
  height: 630,
  alt: "Blocs: 10,000 ownable blocks on Solana",
};

const parsePlausibleDomain = () => metadataBase.hostname;

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Blocs | 10,000 Blocks on Solana",
    template: "%s | Blocs",
  },
  description: siteDescription,
  applicationName: siteName,
  keywords: [
    "Solana",
    "on-chain grid",
    "NFT alternative",
    "decentralized ownership",
    "digital real estate",
    "block marketplace",
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
  themeColor: "#000000",
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
      <body className="app-font" suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteStructuredData) }}
        />
        <PlausibleProvider
          domain={parsePlausibleDomain()}
          enabled={process.env.NODE_ENV === "production"}
          scriptProps={{
            src: "https://analytics.marvinmaerz.com/js/pa-3HPsBPc6MtBPaeuGOplYw.js",
          }}
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
