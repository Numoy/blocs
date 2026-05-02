import type { Metadata } from "next";
import OwnerClient from "./OwnerClient";

type OwnerPageProps = {
    params: Promise<{ address: string }>;
};

export async function generateMetadata({ params }: OwnerPageProps): Promise<Metadata> {
    const { address } = await params;
    const shortAddress = `${address.slice(0, 4)}...${address.slice(-4)}`;
    return {
        title: `Owner ${shortAddress}`,
        description: `View blocks owned by ${shortAddress} on Blocs.`,
        alternates: {
            canonical: `/owner/${address}`,
        },
    };
}

export default async function OwnerPage({ params }: OwnerPageProps) {
    const { address } = await params;
    return <OwnerClient address={address} />;
}
