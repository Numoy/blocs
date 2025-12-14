import { BlockData } from "@/types";

export const generateMockBlocks = (count: number): BlockData[] => {
    return Array.from({ length: count }, (_, i) => {
        const isOwned = Math.random() > 0.9; // 10% owned

        // If owned, it has a 50% chance of being for sale by the owner
        // If NOT owned, it is ALWAYS for sale (primary market)
        const isForSale = isOwned ? Math.random() > 0.5 : true;

        return {
            id: i + 1,
            owner: isOwned ? "MockOwnerPublicKey" : null,
            color: isOwned ? getRandomColor() : null,
            image: null,
            imageUrl: isOwned && Math.random() > 0.7 ? `https://picsum.photos/seed/${i}/200` : null,
            text: isOwned ? `Block #${i + 1}` : null,
            url: isOwned ? "https://example.com" : null,
            isForSale: isForSale,
            // Price: If unowned, standard price (e.g. 0.05 SOL). If owned & for sale, random price.
            price: isForSale ? (isOwned ? parseFloat((Math.random() * 10).toFixed(2)) : 0.05) : null,
        };
    });
};

const getRandomColor = () => {
    const colors = ["#FF5733", "#33FF57", "#3357FF", "#F1C40F", "#9B59B6", "#E74C3C"];
    return colors[Math.floor(Math.random() * colors.length)];
};
