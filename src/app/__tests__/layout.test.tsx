// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-plausible", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("next/font/google", () => ({
    Orbitron: () => ({ variable: "--font-display" }),
    Space_Grotesk: () => ({ variable: "--font-sans" }),
}));

vi.mock("sonner", () => ({
    Toaster: () => null,
}));

vi.mock("@/components/providers/ClientRoot", () => ({
    ClientRoot: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/layout/Header", () => ({
    Header: () => null,
}));

vi.mock("@/context/ProgramContext", () => ({
    ProgramProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/common/ErrorBoundary", () => ({
    ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/utils/siteUrl", () => ({
    getSiteOrigin: () => "https://10000-blocks.com",
    getSiteUrl: () => new URL("https://10000-blocks.com"),
}));

describe("RootLayout", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = {
            ...originalEnv,
        };
        delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("imports without requiring wallet env on the server", async () => {
        await expect(import("../layout")).resolves.toMatchObject({
            default: expect.any(Function),
        });
    });
});
