import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent, DialogClose } from "@/components/arc/dialog/dialog";

/** Dialog konfirmasi hapus generik untuk catatan LPJ, dana masuk, dan VA. */
export function ConfirmDelete({
  open, onOpenChange, title, description, onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 8 }}>
          <DialogClose asChild>
            <Button variant="secondary">Batal</Button>
          </DialogClose>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Hapus catatan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
