import { Suspense } from "react";
import type { Metadata } from "next";
import { Grid } from "@/components/grid/Grid";

const homeDescription =
  "1 Planet. 10,000 Plots. Claim your piece of Mars. Explore the interactive 3D globe of Mars on Solana, claim land plots, and customize your settlement.";

export const metadata: Metadata = {
  title: {
    absolute: "Mars Blocs | 10,000 Plots on Planet Mars",
  },
  description: homeDescription,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Mars Blocs | 10,000 Plots on Planet Mars",
    description: homeDescription,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mars Blocs | 10,000 Plots on Planet Mars",
    description: homeDescription,
    images: ["/og-image.png"],
  },
};

export default function Home() {
  return (
    <>
      <h1 className="sr-only">Mars Blocs: 10,000 land plots on Planet Mars</h1>
      <p className="sr-only">
        Claim, trade, and build settlements on a decentralized 100x100 Mars map registered on Solana.
      </p>
      <Suspense fallback={<div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading Grid...</div>}>
        <Grid />
      </Suspense>
    </>
  );
}
