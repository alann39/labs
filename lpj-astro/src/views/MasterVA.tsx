import { useEffect, useState } from "react";
import { Pencil, Plus, Power, Trash2 } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Badge } from "@/components/arc/badge/badge";
import { Dialog, DialogContent, DialogClose } from "@/components/arc/dialog/dialog";
import { ScrollArea } from "@/components/arc/scroll-area/scroll-area";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
import { Input } from "@/components/arc/input/input";
import { MoneyInput } from "@/components/arc/money-input/money-input";
import { PageHead } from "../components/PageHead";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { fmtNum, fmtRp } from "../format";
import { useStore, type MasterVa } from "../store";

type Row = {
  id: string; nama: string; nomor: string; grup: string;
  saldoNormal: number; aktif: boolean; punyaCatatan: boolean;
};

export function MasterVA({ onHelp }: { onHelp: () => void }) {
  const { state, reset, addMasterVa, updateMasterVa, setMasterVaAktif, deleteMasterVa } = useStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MasterVa | null>(null);
  const [nama, setNama] = useState("");
  const [nomor, setNomor] = useState("");
  const [grup, setGrup] = useState("");
  const [saldo, setSaldo] = useState<number | null>(null);
  const [hapus, setHapus] = useState<Row | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    if (!formOpen) return;
    setNama(editing?.nama ?? "");
    setNomor(editing?.nomor ?? "");
    setGrup(editing?.grup ?? "");
    setSaldo(editing?.saldoNormal ?? null);
  }, [formOpen, editing]);

  const rows: Row[] = state.masterVa.map((mv) => ({
    id: mv.id, nama: mv.nama, nomor: mv.nomor, grup: mv.grup,
    saldoNormal: mv.saldoNormal, aktif: mv.aktif,
    punyaCatatan: state.months.some(
      (m) => m.lpj.some((r) => r.vaId === mv.id) || m.masuk.some((r) => r.vaId === mv.id),
    ),
  }));
  const totalNormalAktif = state.masterVa.filter((m) => m.aktif).reduce((a, m) => a + m.saldoNormal, 0);
  const formValid = nama.trim() !== "" && nomor.trim() !== "" && grup.trim() !== "" && saldo !== null && saldo > 0;

  const simpan = () => {
    if (!formValid || saldo === null) return;
    const data = { nama: nama.trim(), nomor: nomor.trim(), grup: grup.trim(), saldoNormal: saldo };
    if (editing) updateMasterVa(editing.id, data);
    else addMasterVa(data);
    setFormOpen(false);
  };

  return (
    <>
      <PageHead title="Master VA" sub="Daftar virtual account (VA) kas kecil dan saldo normalnya" onHelp={onHelp}>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus size={16} strokeWidth={1.75} /> Tambah VA
        </Button>
      </PageHead>

      <section className="card">
        <SortableDataTable
          caption="Daftar virtual account"
          rows={rows}
          rowKey="id"
          defaultSort={{ key: "nama", direction: "asc" }}
          columns={[
            { key: "nama", label: "VA / departemen", render: (v) => <span className="va-cell-name">{v as string}</span> },
            { key: "nomor", label: "No. VA" },
            { key: "grup", label: "Grup", render: (v) => <Badge tone="neutral">{v as string}</Badge> },
            { key: "saldoNormal", label: "Saldo normal", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
            { key: "aktif", label: "Status", render: (v) => (v ? <Badge tone="success">Aktif</Badge> : <Badge tone="neutral">Nonaktif</Badge>) },
            {
              key: "aksi", label: "", sortable: false,
              render: (_v, row) => {
                const r = row as unknown as Row;
                const mv = state.masterVa.find((x) => x.id === r.id) ?? null;
                return (
                  <span className="row-actions">
                    <Tooltip content="Edit">
                      <Button type="button" variant="ghost" size="sm" className="btn-icon" aria-label={`Edit ${r.nama}`} onClick={() => { setEditing(mv); setFormOpen(true); }}>
                        <Pencil size={15} strokeWidth={1.75} />
                      </Button>
                    </Tooltip>
                    <Tooltip content={r.aktif ? "Nonaktifkan" : "Aktifkan"}>
                      <Button type="button" variant="ghost" size="sm" className="btn-icon" aria-label={r.aktif ? `Nonaktifkan ${r.nama}` : `Aktifkan ${r.nama}`} onClick={() => setMasterVaAktif(r.id, !r.aktif)}>
                        <Power size={15} strokeWidth={1.75} />
                      </Button>
                    </Tooltip>
                    <Tooltip content={r.punyaCatatan ? "VA punya catatan, tidak bisa dihapus" : "Hapus"}>
                      <Button type="button" variant="ghost" size="sm" className="btn-icon btn-icon-danger" disabled={r.punyaCatatan} aria-label={`Hapus ${r.nama}`} onClick={() => setHapus(r)}>
                        <Trash2 size={15} strokeWidth={1.75} />
                      </Button>
                    </Tooltip>
                  </span>
                );
              },
            },
          ]}
        />
        <p className="footnote" style={{ marginTop: 16 }}>
          Total saldo normal VA aktif: <span className="num" style={{ color: "var(--foreground)", fontWeight: 500 }}>{fmtRp(totalNormalAktif)}</span>. Saldo normal adalah plafon imprest tiap VA dan besaran isi ulang full setiap awal bulan setelah closing. VA yang punya catatan tidak bisa dihapus permanen, nonaktifkan saja. VA nonaktif tidak muncul di pilihan form LPJ dan dana masuk bulan berjalan, tapi tetap tampil di data historis.
        </p>
      </section>

      <section className="card">
        <div className="card-title">Reset data</div>
        <p className="card-sub" style={{ marginBottom: 16 }}>
          Reset mengembalikan seluruh data ke seed rekap Juli sampai Oktober 2026 dan menghapus perubahan yang belum menjadi data final.
        </p>
        <Button variant="secondary" onClick={() => setResetOpen(true)}>Reset data</Button>
      </section>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="form-dialog" title={editing ? `Edit VA ${editing.nama}` : "Tambah VA"} description="Perubahan berlaku ke bulan-bulan di mana VA ini belum closing.">
          <ScrollArea className="form-scroll" label="Formulir master VA">
            <div className="form-stack">
              <div className="form-grid">
                <Input label="Nama VA / departemen" value={nama} onChange={(e) => setNama(e.target.value)} />
                <Input label="No. VA" value={nomor} onChange={(e) => setNomor(e.target.value)} />
              </div>
              <Input label="Grup" value={grup} onChange={(e) => setGrup(e.target.value)} placeholder="Konstruksi" />
              <MoneyInput
                label="Saldo normal"
                currency="IDR"
                currencies={["IDR"]}
                locale="id-ID"
                value={saldo}
                onValueChange={setSaldo}
                quickAdd={[]}
              />
            </div>
          </ScrollArea>
          <div className="form-actions" style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <DialogClose asChild>
              <Button variant="secondary">Batal</Button>
            </DialogClose>
            <Button disabled={!formValid} onClick={simpan}>
              {editing ? "Simpan perubahan" : "Tambah VA"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDelete
        open={hapus !== null}
        onOpenChange={(o) => { if (!o) setHapus(null); }}
        title={`Hapus VA ${hapus?.nama ?? ""}?`}
        description="VA ini belum punya catatan LPJ atau dana masuk, jadi bisa dihapus permanen dari master dan dari snapshot bulan yang belum closing."
        onConfirm={() => { if (hapus) deleteMasterVa(hapus.id); setHapus(null); }}
      />

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent title="Reset data?" description="Semua bulan, catatan, pengembalian, dan master VA kembali ke seed Juli sampai Oktober 2026.">
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 20 }}>
            <DialogClose asChild>
              <Button variant="secondary">Batal</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                reset();
                setResetOpen(false);
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
