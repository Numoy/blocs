import type { BN, Idl, Program } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";

export interface GridStateAccount {
    admin: PublicKey;
}

export interface RawBlockAccount {
    id: number;
    owner: PublicKey;
    price: BN;
    isForSale: boolean;
    color: number[];
    text: number[];
    imageUrl: number[];
    url: number[];
}

export interface BlockAccountEntry {
    account: RawBlockAccount;
}

export interface BlockBoughtEvent {
    id: number;
    buyer: PublicKey;
    price: BN;
}

export interface BlockSoldEvent {
    id: number;
    price: BN | number;
    isForSale?: boolean;
    is_for_sale?: boolean;
}

export interface BlockResoldEvent {
    id: number;
    buyer: PublicKey;
    price: BN;
}

interface GridStateNamespace {
    fetch(pubkey: PublicKey): Promise<GridStateAccount>;
    fetchNullable(pubkey: PublicKey): Promise<GridStateAccount | null>;
}

interface BlockNamespace {
    all(): Promise<BlockAccountEntry[]>;
    fetch(pubkey: PublicKey): Promise<RawBlockAccount>;
}

interface ProgramAccountNamespace {
    gridState: GridStateNamespace;
    block: BlockNamespace;
}

export type BlocsProgram = Program<Idl> & {
    account: ProgramAccountNamespace;
};

export const asBlocsProgram = (program: Program<Idl>): BlocsProgram => {
    return program as BlocsProgram;
};
