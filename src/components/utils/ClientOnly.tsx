"use client";

import { useEffect, useState, ReactNode } from "react";

export const ClientOnly = ({ children }: { children: ReactNode }) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
    }, []);

    if (!mounted) return null;

    return <>{children}</>;
};
