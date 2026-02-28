"use client";

import { useEffect } from "react";
import { web3 } from "@coral-xyz/anchor";
import { toast } from "sonner";
import {
    asBlocsProgram,
    type BlockBoughtEvent,
    type BlockResoldEvent,
    type BlockSoldEvent,
} from "@/utils/programTypes";
import { EVENTUAL_GRID_SYNC_DELAY_MS } from "@/context/program/shared";
import type { QueueGridSync, UpdateBlockInState } from "@/context/program/useGridFetch";

type UseGridRealtimeOptions = {
    program: ReturnType<typeof asBlocsProgram>;
    queueGridSync: QueueGridSync;
    updateBlockInState: UpdateBlockInState;
};

export const useGridRealtime = ({
    program,
    queueGridSync,
    updateBlockInState,
}: UseGridRealtimeOptions) => {
    useEffect(() => {
        let disposed = false;
        const listenerIds: number[] = [];

        const registerListener = async <TEvent,>(
            eventName: "BlockBought" | "BlockSold" | "BlockResold",
            handler: (event: TEvent) => void,
        ) => {
            try {
                const listenerId = await program.addEventListener(eventName, (rawEvent) => {
                    handler(rawEvent as TEvent);
                });
                if (disposed) {
                    await program.removeEventListener(listenerId);
                    return;
                }
                listenerIds.push(listenerId);
            } catch (error) {
                console.error(`Failed to subscribe to ${eventName}:`, error);
            }
        };

        const setupListener = async () => {
            await registerListener<BlockBoughtEvent>("BlockBought", (event) => {
                const id = event.id;
                const buyer = event.buyer.toBase58();

                updateBlockInState(id, (existing) => ({
                    ...existing,
                    owner: buyer,
                    price: 0,
                    isForSale: false,
                }));
                toast.info(`Block #${id} was just bought!`);
                queueGridSync(EVENTUAL_GRID_SYNC_DELAY_MS);
            });

            await registerListener<BlockSoldEvent>("BlockSold", (event) => {
                const id = event.id;
                const isForSale = Boolean(event.isForSale ?? event.is_for_sale);
                const priceLamports = typeof event.price?.toNumber === "function"
                    ? event.price.toNumber()
                    : Number(event.price || 0);
                const priceSol = isForSale ? priceLamports / web3.LAMPORTS_PER_SOL : 0;

                updateBlockInState(id, (existing) => ({
                    ...existing,
                    isForSale,
                    price: priceSol,
                }));
                queueGridSync(EVENTUAL_GRID_SYNC_DELAY_MS);
            });

            await registerListener<BlockResoldEvent>("BlockResold", (event) => {
                const id = event.id;
                const buyer = event.buyer.toBase58();

                updateBlockInState(id, (existing) => ({
                    ...existing,
                    owner: buyer,
                    price: 0,
                    isForSale: false,
                }));
                toast.info(`Block #${id} was resold.`);
                queueGridSync(EVENTUAL_GRID_SYNC_DELAY_MS);
            });
        };

        void setupListener();

        return () => {
            disposed = true;
            for (const listenerId of listenerIds) {
                void program.removeEventListener(listenerId);
            }
        };
    }, [program, queueGridSync, updateBlockInState]);
};
