export const isMobile = (): boolean => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export const isWalletBrowser = (): boolean => {
    if (typeof window === 'undefined') return false;

    type WalletWindow = Window & {
        solana?: unknown;
        backpack?: unknown;
        ethereum?: unknown;
        phantom?: unknown;
    };

    const win = window as WalletWindow;
    return Boolean(win.solana || win.backpack || win.ethereum || win.phantom);
};

export interface WalletDeepLinks {
    phantom: string;
    solflare: string;
    backpack: string;
    metamask: string;
}

export const generateWalletDeepLinks = (currentUrl: string): WalletDeepLinks => {
    const encodedUrl = encodeURIComponent(currentUrl);
    // MetaMask usually expects dApp url without protocol for some deep links, 
    // but the standard universal link format is https://metamask.app.link/dapp/example.com
    const urlNoProtocol = currentUrl.replace(/^https?:\/\//, '');

    // Use current origin when available; fallback to localhost for deterministic local behavior.
    const refUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const encodedRef = encodeURIComponent(refUrl);

    return {
        phantom: `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedRef}`,
        solflare: `https://solflare.com/ul/v1/browse/${encodedUrl}?ref=${encodedRef}`,
        backpack: `https://backpack.app/ul/browse/?url=${encodedUrl}&ref=${encodedRef}`,
        metamask: `https://metamask.app.link/dapp/${urlNoProtocol}`,
    };
};
