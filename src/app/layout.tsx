import type { Metadata } from "next";
import { Toaster } from 'sonner';
import PlausibleProvider from "next-plausible";
import "./env-init";
import "./globals.css";
// import { Inter } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletContextProvider } from "@/components/providers/WalletContextProvider";
import { Header } from "@/components/layout/Header";
import { ProgramProvider } from "@/context/ProgramContext";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

const parseMetadataBase = () => {
  const fallback = "http://localhost:3000";
  const rawUrl = process.env.NEXT_PUBLIC_SITE_URL || fallback;

  try {
    return new URL(rawUrl);
  } catch {
    return new URL(fallback);
  }
};

const parsePlausibleDomain = () => parseMetadataBase().hostname;
const metadataBase = parseMetadataBase();
const siteUrl = metadataBase.toString().replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase,
  title: "Blocs - 10,000 Blocks on Solana",
  description: "A decentralized 100x100 grid. Buy, trade, and own blocks on the Solana blockchain. Permanently.",
  openGraph: {
    title: "Blocs on Solana",
    description: "Own a piece of the grid. 10,000 blocks, fully decentralized.",
    url: siteUrl,
    siteName: "Blocs",
    images: [
      {
        url: "/og-image.png", // We should create this
        width: 1200,
        height: 630,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blocs - Own the Grid",
    description: "Participate in the decentralized 10k block experiment on Solana.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="app-font" suppressHydrationWarning>
        <PlausibleProvider
          domain={parsePlausibleDomain()}
          enabled={process.env.NODE_ENV === "production"}
          scriptProps={{
            src: "https://analytics.marvinmaerz.com/js/pa-3HPsBPc6MtBPaeuGOplYw.js",
          }}
        >
          <WalletContextProvider>
            <ProgramProvider>
              <ErrorBoundary>
                <Header />
                {children}
              </ErrorBoundary>
              <Toaster position="bottom-right" theme="dark" />
            </ProgramProvider>
          </WalletContextProvider>
        </PlausibleProvider>
      </body>
    </html>
  );
}
