export const isMobile = (): boolean => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export const isWalletBrowser = (): boolean => {
    if (typeof window === 'undefined') return false;
    // Check for common injected providers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    return !!(win.solana || win.backpack || win.ethereum || win.phantom);
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

    // Using window.location.origin as ref if available, otherwise just 'https://blocs.app' (placeholder)
    const refUrl = typeof window !== 'undefined' ? window.location.origin : 'https://10000-blocks.com';
    const encodedRef = encodeURIComponent(refUrl);

    return {
        phantom: `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedRef}`,
        solflare: `https://solflare.com/ul/v1/browse/${encodedUrl}?ref=${encodedRef}`,
        backpack: `https://backpack.app/ul/browse/?url=${encodedUrl}&ref=${encodedRef}`,
        metamask: `https://metamask.app.link/dapp/${urlNoProtocol}`,
    };
};
