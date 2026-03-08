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
