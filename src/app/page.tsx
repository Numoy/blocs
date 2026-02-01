import { Suspense } from "react";
import { Grid } from "@/components/grid/Grid";

export default function Home() {
  return (
    <Suspense fallback={<div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading Grid...</div>}>
      <Grid />
    </Suspense>
  );
}
