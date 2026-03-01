import { Suspense } from "react";
import type { Metadata } from "next";
import { Grid } from "@/components/grid/Grid";

const homeDescription =
  "Explore the live 100x100 on-chain grid on Solana. Discover, buy, and trade ownership of one of 10,000 permanent blocks.";

export const metadata: Metadata = {
  title: {
    absolute: "Blocs | 10,000 Blocks on Solana",
  },
  description: homeDescription,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Blocs | 10,000 Blocks on Solana",
    description: homeDescription,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blocs | 10,000 Blocks on Solana",
    description: homeDescription,
    images: ["/og-image.png"],
  },
};

export default function Home() {
  return (
    <>
      <h1 className="sr-only">Blocs: 10,000 blocks on Solana</h1>
      <p className="sr-only">
        Buy, sell, and manage ownership of permanent blocks on a decentralized 100x100 grid.
      </p>
      <Suspense fallback={<div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading Grid...</div>}>
        <Grid />
      </Suspense>
    </>
  );
}
