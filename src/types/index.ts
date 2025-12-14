export interface BlockData {
    id: number;
    owner: string | null; // Public Key string
    color: string | null; // Hex color
    image: string | null; // URL
    text: string | null;
    imageUrl: string | null;
    url: string | null;
    isForSale: boolean;
    price: number | null; // SOL
}
