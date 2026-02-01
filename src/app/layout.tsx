import type { Metadata } from "next";
import { Toaster } from 'sonner';
import { Outfit } from "next/font/google"; // Or use another font like Outfit if desired for modern look
import "./globals.css";
import "./env-init";
// import { Inter } from "next/font/google";
import "@solana/wallet-adapter-react-ui/styles.css";
import { WalletContextProvider } from "@/components/providers/WalletContextProvider";
import { Header } from "@/components/layout/Header";
import { ProgramProvider } from "@/context/ProgramContext";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Blocs - 10,000 Blocks on Solana",
  description: "A decentralized 100x100 grid. Buy, trade, and own blocks on the Solana blockchain. Permanently.",
  openGraph: {
    title: "Blocs on Solana",
    description: "Own a piece of the grid. 10,000 blocks, fully decentralized.",
    url: "https://blocs.solana", // Placeholder
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
      <body className={outfit.className} suppressHydrationWarning>
        <WalletContextProvider>
          <ProgramProvider>
            <ErrorBoundary>
              <Header />
              {children}
            </ErrorBoundary>
            <Toaster position="bottom-right" theme="dark" />
          </ProgramProvider>
        </WalletContextProvider>
      </body>
    </html>
  );
}
