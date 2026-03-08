"use client";

import dynamic from "next/dynamic";
import { type ReactNode } from "react";

/**
 * Wraps WalletContextProvider (and all wallet/auth providers) with ssr: false
 * to prevent Privy from initializing during static prerendering.
 * Wallet state is always client-side, so no meaningful SSR is lost.
 */
const WalletContextProvider = dynamic(
    () => import("./WalletContextProvider").then((m) => ({ default: m.WalletContextProvider })),
    { ssr: false }
);

export function ClientRoot({ children }: { children: ReactNode }) {
    return <WalletContextProvider>{children}</WalletContextProvider>;
}
