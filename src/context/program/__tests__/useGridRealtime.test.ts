import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGridRealtime } from "@/context/program/useGridRealtime";

const makeProgram = () => ({
    addEventListener: vi.fn().mockReturnValue(0),
    removeEventListener: vi.fn().mockResolvedValue(undefined),
});

describe("useGridRealtime", () => {
    const originalRealtimeFlag = process.env.NEXT_PUBLIC_ENABLE_GRID_REALTIME;

    afterEach(() => {
        process.env.NEXT_PUBLIC_ENABLE_GRID_REALTIME = originalRealtimeFlag;
        vi.clearAllMocks();
    });

    it("does not open websocket log subscriptions by default", () => {
        delete process.env.NEXT_PUBLIC_ENABLE_GRID_REALTIME;
        const program = makeProgram();

        renderHook(() => useGridRealtime({
            program: program as never,
            queueGridSync: vi.fn(),
            updateBlockInState: vi.fn(),
        }));

        expect(program.addEventListener).not.toHaveBeenCalled();
    });

    it("registers event listeners when realtime is explicitly enabled", async () => {
        process.env.NEXT_PUBLIC_ENABLE_GRID_REALTIME = "true";
        const program = makeProgram();

        renderHook(() => useGridRealtime({
            program: program as never,
            queueGridSync: vi.fn(),
            updateBlockInState: vi.fn(),
        }));

        await waitFor(() => {
            expect(program.addEventListener).toHaveBeenCalledTimes(3);
        });
    });
});
