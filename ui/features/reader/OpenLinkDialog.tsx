import { ExternalLink } from "lucide-react";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";

interface OpenLinkDialogProps {
  /** The link to confirm, or null when the dialog is closed. */
  url: URL | null;
  onCancel: () => void;
  onConfirm: (url: URL) => void;
}

/**
 * Asks before a book link leaves the app. The real destination is shown, host first: the text of
 * a link can say anything.
 */
export function OpenLinkDialog({ url, onCancel, onConfirm }: OpenLinkDialogProps) {
  return (
    <Dialog
      open={url !== null}
      onClose={onCancel}
      title="Open this link in your browser?"
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => url && onConfirm(url)}>
            <ExternalLink className="size-4" />
            Open link
          </Button>
        </>
      }
    >
      {url && (
        <>
          <p>This book links to a website. It will open in your default browser.</p>
          <div className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5">
            <p className="font-medium break-all text-text">{url.host}</p>
            <p className="mt-0.5 text-xs break-all">{url.href}</p>
          </div>
        </>
      )}
    </Dialog>
  );
}
