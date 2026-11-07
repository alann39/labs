import { useMemo, useState } from "react";
import { Info, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Badge } from "@/components/arc/badge/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/arc/popover/popover";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { PageHead } from "../components/PageHead";
import { StatCell } from "../components/Stat";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { fmtNum, fmtRp, fmtTgl, fmtTglPanjang } from "../format";
import {
  useStore, vaStats, khususSudahAdaLpj, type LpjRecord, type DanaMasukRecord,
} from "../store";
import type { View } from "../App";
import { LpjFormDialog } from "./LpjView";
import { MasukFormDialog } from "./DanaMasukView";

type Entry = {
  id: string;
  tanggal: string;
  jenis: string;
  tone: "success" | "warning" | "info" | "neutral";
  keterangan: string;
  tautan: string;
  masuk: number | null;
  lpj: number | null;
  kind: "lpj" | "masuk";
  recordId: string;
};

const LPJ_TONE: Record<string, Entry["tone"]> = { closing: "success", khusus: "info", reguler: "neutral" };
const MASUK_TONE: Record<DanaMasukRecord["jenis"], Entry["tone"]> = { awal: "neutral", kembali: "success", khusus: "info" };
const MASUK_LABEL: Record<DanaMasukRecord["jenis"], string> = { awal: "Isi Awal", kembali: "Pengisian Kembali", khusus: "Pengisian Khusus" };

export function Ledger({ vaId, setVaId, go, onHelp }: { vaId: string; setVaId: (id: string) => void; go: (v: View) => void; onHelp: () => void }) {
  const { month, deleteLpj, deleteMasuk } = useStore();
  const [filter, setFilter] = useState("semua");
  const [editLpj, setEditLpj] = useState<LpjRecord | null>(null);
  const [lpjFormOpen, setLpjFormOpen] = useState(false);
  const [editMasuk, setEditMasuk] = useState<DanaMasukRecord | null>(null);
  const [masukFormOpen, setMasukFormOpen] = useState(false);
  const [hapus, setHapus] = useState<Entry | null>(null);
  const [hapusGagal, setHapusGagal] = useState<string | null>(null);
  const va = month.vas.find((v) => v.id === vaId) ?? month.vas[0];
  const s = vaStats(month, va);
  const terkunci = va.closingSelesai;

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [];
    for (const r of month.masuk) {
      if (r.vaId !== va.id) continue;
      let tautan = "";
      if (r.jenis === "kembali") {
        const target = r.lpjId ? month.lpj.find((x) => x.id === r.lpjId) : undefined;
        tautan = target ? `Untuk ${target.no}` : "Tanpa tautan LPJ";
      } else if (r.jenis === "khusus") {
        const anak = month.lpj.find((x) => x.khususDariMasukId === r.id);
        tautan = anak ? `Sudah ada ${anak.no}` : "Belum ada LPJ khusus";
      } else {
        tautan = "Saldo normal penuh";
      }
      list.push({
        id: `m-${r.id}`, tanggal: r.tanggal,
        jenis: MASUK_LABEL[r.jenis], tone: MASUK_TONE[r.jenis],
        keterangan: r.keterangan ?? MASUK_LABEL[r.jenis], tautan,
        masuk: r.nominal, lpj: null, kind: "masuk", recordId: r.id,
      });
    }
    for (const r of month.lpj) {
      if (r.vaId !== va.id) continue;
      const label = r.lpjClosing ? "LPJ Closing" : r.jenis === "khusus" ? "LPJ Khusus" : "LPJ Reguler";
      let tautan = "";
      if (r.jenis === "khusus") {
        const induk = month.masuk.find((x) => x.id === r.khususDariMasukId);
        tautan = induk ? `Dari pengisian khusus ${fmtTgl(induk.tanggal)}` : "Pengisian khusus";
      } else {
        const isi = month.masuk.find((x) => x.jenis === "kembali" && x.lpjId === r.id);
        tautan = isi ? `Diisi kembali ${fmtTgl(isi.tanggal)}` : "Belum diisi kembali";
      }
      list.push({
        id: `l-${r.id}`, tanggal: r.tanggal, jenis: label,
        tone: LPJ_TONE[r.lpjClosing ? "closing" : r.jenis],
        keterangan: `${r.no} · ${r.keterangan}`, tautan,
        masuk: null, lpj: r.nominal, kind: "lpj", recordId: r.id,
      });
    }
    return list.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.id.localeCompare(b.id));
  }, [month, va]);

  const filtered = entries.filter((e) =>
    filter === "semua" ? true : filter === "lpj" ? e.kind === "lpj" : e.kind === "masuk",
  );

  const bukaEdit = (e: Entry) => {
    if (e.kind === "lpj") {
      setEditLpj(month.lpj.find((r) => r.id === e.recordId) ?? null);
      setLpjFormOpen(true);
    } else {
      setEditMasuk(month.masuk.find((r) => r.id === e.recordId) ?? null);
      setMasukFormOpen(true);
    }
  };

  return (
    <>
      <PageHead title={va.nama} sub={`Ledger VA · Saldo normal ${fmtRp(va.saldoNormal)}`} onHelp={onHelp}>
        <div style={{ width: 264 }}>
          <Select
            label="Virtual account"
            value={va.id}
            onValueChange={setVaId}
            options={month.vas.map((v) => ({ value: v.id, label: `${v.nama} · ${v.nomor}` }))}
          />
        </div>
        <Button onClick={() => go("lpj")}>
          <Plus size={16} strokeWidth={1.75} /> Input LPJ
        </Button>
      </PageHead>

      <section className="card">
        <div className="stat-strip five">
          <StatCell label="Saldo normal" value={va.saldoNormal} />
          <StatCell label="Total dana masuk" value={s.masuk} />
          <StatCell label="Total LPJ" value={s.lpj} />
          <StatCell label="Sisa saldo di bank" value={va.sisaBank} />
          <StatCell
            label="Selisih (dana dikembalikan)"
            value={s.dk}
            highlight
            action={
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" aria-label="Rumus dana dikembalikan" style={{ border: 0, background: "none", cursor: "pointer", color: "var(--text-muted)", display: "grid", placeItems: "center" }}>
                    <Info size={16} strokeWidth={1.75} />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="end">
                  <div className="pop-rows">
                    <div className="pop-row"><span className="k">Total dana masuk</span><span className="num">{fmtRp(s.masuk)}</span></div>
                    <div className="pop-row"><span className="k">Total LPJ</span><span className="num">− {fmtRp(s.lpj)}</span></div>
                    <div className="pop-row"><span className="k">Sisa saldo di bank</span><span className="num">− {fmtRp(va.sisaBank)}</span></div>
                    <div className="pop-row total"><span>Selisih</span><span className="num" style={{ color: "var(--accent)" }}>{fmtRp(s.dk)}</span></div>
                    <p className="pop-note">Hasil minus tidak mengurangi total. VA minus menutup kekurangannya secara terpisah.</p>
                  </div>
                </PopoverContent>
              </Popover>
            }
          />
        </div>
      </section>

      <div className="toolbar">
        <h2 style={{ fontSize: 16 }}>Transaksi</h2>
        <div className="spacer" />
        <SegmentedControl
          label="Filter jenis transaksi"
          options={[
            { value: "semua", label: "Semua" },
            { value: "lpj", label: "LPJ" },
            { value: "masuk", label: "Dana masuk" },
          ]}
          value={filter}
          onValueChange={setFilter}
        />
      </div>

      {hapusGagal && <p className="footnote" role="alert" style={{ color: "var(--danger)" }}>{hapusGagal}</p>}

      <section className="card">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Wallet size={24} strokeWidth={1.75} />}
            title="Belum ada transaksi"
            description="Transaksi VA ini muncul setelah LPJ atau dana masuk pertama dicatat."
            action={<Button variant="secondary" onClick={() => go("lpj")}>Input LPJ</Button>}
          />
        ) : (
          <SortableDataTable
            caption={`Transaksi ${va.nama}`}
            rows={filtered}
            rowKey="id"
            defaultSort={{ key: "tanggal", direction: "asc" }}
            columns={[
              { key: "tanggal", label: "Tanggal", render: (v) => fmtTglPanjang(v as string) },
              { key: "jenis", label: "Jenis", render: (v, row) => <Badge tone={(row as unknown as Entry).tone}>{v as string}</Badge> },
              { key: "keterangan", label: "Keterangan" },
              { key: "tautan", label: "Tautan" },
              { key: "masuk", label: "Masuk (Rp)", numeric: true, render: (v) => (v == null ? "–" : <span className="num">{fmtNum(v as number)}</span>) },
              { key: "lpj", label: "LPJ (Rp)", numeric: true, render: (v) => (v == null ? "–" : <span className="num">{fmtNum(v as number)}</span>) },
              {
                key: "aksi", label: "Aksi", sortable: false,
                render: (_v, row) => {
                  const e = row as unknown as Entry;
                  return (
                    <span className="row-actions">
                      <Button size="sm" variant="secondary" disabled={terkunci} onClick={() => bukaEdit(e)}>Edit</Button>
                      <Button size="sm" variant="ghost" disabled={terkunci} onClick={() => { setHapusGagal(null); setHapus(e); }}>Hapus</Button>
                    </span>
                  );
                },
              },
            ]}
          />
        )}
      </section>
      <p className="footnote">Timeline gabungan LPJ dan dana masuk VA ini. Setiap pengisian kembali tertaut ke LPJ yang diisi, dan setiap LPJ khusus tertaut ke pengisian khususnya.</p>

      <LpjFormDialog open={lpjFormOpen} onOpenChange={setLpjFormOpen} editing={editLpj} />
      <MasukFormDialog open={masukFormOpen} onOpenChange={setMasukFormOpen} editing={editMasuk} />
      <ConfirmDelete
        open={hapus !== null}
        onOpenChange={(o) => { if (!o) setHapus(null); }}
        title={`Hapus catatan ${hapus?.jenis ?? ""}?`}
        description={hapus ? `${hapus.keterangan}, ${fmtTglPanjang(hapus.tanggal)}. Catatan ini dihapus dari ${va.nama} untuk bulan ini.` : ""}
        onConfirm={() => {
          if (!hapus) return;
          if (hapus.kind === "lpj") deleteLpj(hapus.recordId);
          else if (!deleteMasuk(hapus.recordId)) {
            setHapusGagal("Dana masuk khusus ini sudah punya LPJ khusus. Hapus LPJ khususnya dulu sebelum menghapus dana masuknya.");
          }
          setHapus(null);
        }}
      />
    </>
  );
}
