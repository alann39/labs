import { useState } from "react";
import { Button } from "@/components/arc/button/button";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Badge } from "@/components/arc/badge/badge";
import { Dialog, DialogContent, DialogClose } from "@/components/arc/dialog/dialog";
import { PageHead } from "../components/PageHead";
import { fmtNum, fmtRp } from "../format";
import { useStore } from "../store";

export function MasterVA({ onHelp }: { onHelp: () => void }) {
  const { month, reset } = useStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const totalNormal = month.vas.reduce((a, v) => a + v.saldoNormal, 0);

  return (
    <>
      <PageHead title="Master VA" sub="Daftar virtual account (VA) kas kecil dan saldo normalnya" onHelp={onHelp} />
      <section className="card">
        <SortableDataTable
          caption="Daftar virtual account"
          rows={month.vas.map((v) => ({ id: v.id, nama: v.nama, nomor: v.nomor, grup: v.grup, saldoNormal: v.saldoNormal }))}
          rowKey="id"
          defaultSort={{ key: "nama", direction: "asc" }}
          columns={[
            { key: "nama", label: "VA / departemen" },
            { key: "nomor", label: "No. VA" },
            { key: "grup", label: "Grup", render: (v) => <Badge tone="neutral">{v as string}</Badge> },
            { key: "saldoNormal", label: "Saldo normal", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
          ]}
        />
        <p className="footnote" style={{ marginTop: 16 }}>
          Total saldo normal semua VA: <span className="num" style={{ color: "var(--foreground)", fontWeight: 500 }}>{fmtRp(totalNormal)}</span>. Saldo normal adalah plafon imprest tiap VA dan besaran isi ulang full setiap awal bulan setelah closing.
        </p>
      </section>

      <section className="card">
        <div className="card-title">Data contoh</div>
        <p className="card-sub" style={{ marginBottom: 16 }}>
          Prototipe ini menyimpan perubahan di browser ini (localStorage). Reset mengembalikan data ke rekap Oktober 2026 awal dan menghapus bulan-bulan yang dibuat dari closing.
        </p>
        <Button variant="secondary" onClick={() => setConfirmOpen(true)}>Reset data contoh</Button>
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent title="Reset data contoh?" description="Semua proses, sisa bank, dan bulan hasil closing yang tersimpan di browser ini akan dihapus.">
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20 }}>
            <DialogClose asChild>
              <Button variant="secondary">Batal</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                reset();
                setConfirmOpen(false);
              }}
            >
              Reset data
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
