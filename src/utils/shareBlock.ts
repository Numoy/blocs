import { toast } from 'sonner';
import { trackPlausibleEvent } from './analytics';

export async function shareBlock(blockId: number, source: string): Promise<void> {
    const url = `${window.location.origin}/block/${blockId}`;
    try {
        if (navigator.share) {
            await navigator.share({
                title: `Block #${blockId} on Blocs`,
                text: "Check out this block on the Blocs grid.",
                url,
            });
            trackPlausibleEvent("share_block_link_clicked", {
                block_id: blockId,
                ui_source: source,
                method: "native_share",
            });
            return;
        }

        await navigator.clipboard.writeText(url);
        trackPlausibleEvent("share_block_link_clicked", {
            block_id: blockId,
            ui_source: source,
            method: "clipboard",
        });
        toast.success("Link copied to clipboard!");
    } catch (error) {
        if ((error as DOMException)?.name === "AbortError") return;
        toast.error("Could not share this block right now.");
    }
}
