import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Flag, Info, Landmark, Link2, Pencil, Plus, Sparkles, Trash2, Unlink, Wallet } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/arc/popover/popover";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { PageHead } from "../components/PageHead";
import { StatCell } from "../components/Stat";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { RecordDetailDialog, type DetailTarget } from "../components/RecordDetailDialog";
import { fmtNum, fmtRp, fmtTgl, fmtTglPanjang, fmtTglSingkat } from "../format";
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
  tautanTipe: "link" | "unlink" | "none" | "closing";
  tautanSingkat: string;
  /** Catatan di ujung tautan (untuk dialog detail saat sel tautan diklik). */
  tautanRecordId?: string;
  tautanTargetKind?: "lpj" | "masuk";
  closing: boolean;
  masuk: number | null;
  lpj: number | null;
  kind: "lpj" | "masuk";
  /** Varian chip ikon kolom Jenis: awal/kembali/khusus untuk dana masuk,
      reguler/khusus-lpj/closing untuk LPJ. */
  varian: "awal" | "kembali" | "khusus" | "reguler" | "khusus-lpj" | "closing";
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
      let tautanTipe: Entry["tautanTipe"] = "none";
      let tautanSingkat = "";
      let tautanRecordId: string | undefined;
      let tautanTargetKind: Entry["tautanTargetKind"];
      if (r.jenis === "kembali") {
        const target = r.lpjId ? month.lpj.find((x) => x.id === r.lpjId) : undefined;
        tautan = target ? `Untuk ${target.no}` : "Tanpa tautan LPJ";
        if (target) { tautanTipe = "link"; tautanSingkat = target.no; tautanRecordId = target.id; tautanTargetKind = "lpj"; }
        else tautanTipe = "unlink";
      } else if (r.jenis === "khusus") {
        const anak = month.lpj.find((x) => x.khususDariMasukId === r.id);
        tautan = anak ? `Sudah ada ${anak.no}` : "Belum ada LPJ khusus";
        if (anak) { tautanTipe = "link"; tautanSingkat = anak.no; tautanRecordId = anak.id; tautanTargetKind = "lpj"; }
        else tautanTipe = "unlink";
      } else {
        tautan = "Saldo normal penuh";
        tautanSingkat = "Saldo normal";
      }
      list.push({
        id: `m-${r.id}`, tanggal: r.tanggal,
        jenis: MASUK_LABEL[r.jenis], tone: MASUK_TONE[r.jenis],
        keterangan: r.keterangan ?? MASUK_LABEL[r.jenis], tautan,
        tautanTipe, tautanSingkat, tautanRecordId, tautanTargetKind, closing: false,
        masuk: r.nominal, lpj: null, kind: "masuk", varian: r.jenis, recordId: r.id,
      });
    }
    for (const r of month.lpj) {
      if (r.vaId !== va.id) continue;
      const label = r.lpjClosing ? "LPJ Closing" : r.jenis === "khusus" ? "LPJ Khusus" : "LPJ Reguler";
      let tautan = "";
      let tautanTipe: Entry["tautanTipe"] = "none";
      let tautanSingkat = "";
      let tautanRecordId: string | undefined;
      let tautanTargetKind: Entry["tautanTargetKind"];
      if (r.jenis === "khusus") {
        const induk = month.masuk.find((x) => x.id === r.khususDariMasukId);
        tautan = induk ? `Dari pengisian khusus ${fmtTgl(induk.tanggal)}` : "Pengisian khusus";
        if (induk) { tautanTipe = "link"; tautanSingkat = fmtTglSingkat(induk.tanggal); tautanRecordId = induk.id; tautanTargetKind = "masuk"; }
        else tautanTipe = "unlink";
      } else {
        const isi = month.masuk.find((x) => x.jenis === "kembali" && x.lpjId === r.id);
        if (isi) {
          tautan = `Diisi kembali ${fmtTgl(isi.tanggal)}`;
          tautanTipe = "link"; tautanSingkat = fmtTglSingkat(isi.tanggal);
          tautanRecordId = isi.id; tautanTargetKind = "masuk";
        } else if (r.lpjClosing) {
          // LPJ Closing tidak perlu diisi ulang — terisi otomatis dari isi awal bulan berikutnya.
          tautan = "LPJ closing — terisi otomatis dari isi awal bulan berikutnya";
          tautanTipe = "closing"; tautanSingkat = "Closing";
        } else {
          tautan = "Belum diisi kembali";
          tautanTipe = "unlink"; tautanSingkat = "Belum diisi";
        }
      }
      list.push({
        id: `l-${r.id}`, tanggal: r.tanggal, jenis: label,
        tone: LPJ_TONE[r.lpjClosing ? "closing" : r.jenis],
        keterangan: `${r.no} · ${r.keterangan}`, tautan,
        tautanTipe, tautanSingkat, tautanRecordId, tautanTargetKind, closing: r.lpjClosing,
        masuk: null, lpj: r.nominal, kind: "lpj",
        varian: r.lpjClosing ? "closing" : r.jenis === "khusus" ? "khusus-lpj" : "reguler",
        recordId: r.id,
      });
    }
    return list.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.id.localeCompare(b.id));
  }, [month, va]);

  const filtered = entries.filter((e) =>
    filter === "semua" ? true : filter === "lpj" ? e.kind === "lpj" : e.kind === "masuk",
  );

  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const bukaDetail = (e: Entry) => {
    if (!e.tautanRecordId || !e.tautanTargetKind) return;
    if (e.tautanTargetKind === "lpj") {
      const rec = month.lpj.find((r) => r.id === e.tautanRecordId);
      if (rec) setDetail({ kind: "lpj", record: rec });
    } else {
      const rec = month.masuk.find((r) => r.id === e.tautanRecordId);
      if (rec) setDetail({ kind: "masuk", record: rec });
    }
  };
  const editDariDetail = (t: DetailTarget) => {
    setDetail(null);
    if (t.kind === "lpj") { setEditLpj(t.record); setLpjFormOpen(true); }
    else { setEditMasuk(t.record); setMasukFormOpen(true); }
  };

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

      <section className="card ledger-summary">
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
         <div className="ledger-table">
          <SortableDataTable
            caption={`Transaksi ${va.nama}`}
            rows={filtered}
            rowKey="id"
            defaultSort={{ key: "tanggal", direction: "asc" }}
            columns={[
              { key: "tanggal", label: "Tanggal", width: 92, render: (v) => <span title={fmtTglPanjang(v as string)}>{fmtTglSingkat(v as string)}</span> },
              {
                key: "jenis", label: "Jenis", width: 68,
                render: (v, row) => {
                  const e = row as unknown as Entry;
                  const chip = {
                    awal: { cls: "awal", Icon: Landmark },
                    kembali: { cls: "masuk", Icon: ArrowDownLeft },
                    khusus: { cls: "khusus", Icon: Sparkles },
                    reguler: { cls: "lpj", Icon: ArrowUpRight },
                    "khusus-lpj": { cls: "khusus", Icon: ArrowUpRight },
                    closing: { cls: "lpj", Icon: ArrowUpRight },
                  }[e.varian];
                  const { Icon } = chip;
                  return (
                    <span className={`entry-chip ${chip.cls}`} title={v as string}>
                      <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                      {e.closing && <Flag size={10} strokeWidth={1.75} fill="currentColor" style={{ color: "var(--warning)" }} aria-hidden="true" />}
                      <span className="sr-only">{v as string}</span>
                    </span>
                  );
                },
              },
              {
                key: "keterangan", label: "Keterangan",
                render: (v) => {
                  const t = (v as string) || "";
                  return t ? <span className="cell-truncate" title={t}>{t}</span> : <span style={{ color: "var(--text-muted)" }}>–</span>;
                },
              },
              {
                key: "tautan", label: "Tautan", width: 150,
                render: (_v, row) => {
                  const e = row as unknown as Entry;
                  if (e.tautanTipe === "link") {
                    const isiSel = (
                      <>
                        <Link2 size={14} strokeWidth={1.75} aria-hidden="true" />
                        <span className="link-txt">{e.tautanSingkat}</span>
                      </>
                    );
                    if (e.tautanRecordId) {
                      return (
                        <button type="button" className="link-cell" title={`${e.tautan} — klik untuk detail`} onClick={() => bukaDetail(e)}>
                          {isiSel}
                        </button>
                      );
                    }
                    return <span className="link-cell" title={e.tautan}>{isiSel}</span>;
                  }
                  if (e.tautanTipe === "unlink") {
                    return (
                      <span className="link-cell dim" title={e.tautan}>
                        <Unlink size={14} strokeWidth={1.75} aria-hidden="true" />
                        <span className="link-txt">{e.tautanSingkat}</span>
                      </span>
                    );
                  }
                  if (e.tautanTipe === "closing") {
                    return (
                      <span className="link-cell dim" title={e.tautan}>
                        <Flag size={14} strokeWidth={1.75} fill="currentColor" style={{ color: "var(--warning)" }} aria-hidden="true" />
                        <span className="link-txt">{e.tautanSingkat}</span>
                      </span>
                    );
                  }
                  return <span style={{ color: "var(--text-muted)" }} title={e.tautan}>{e.tautanSingkat}</span>;
                },
              },
              { key: "masuk", label: "Masuk", numeric: true, width: 132, render: (v) => (v == null ? "–" : <span className="num">{fmtNum(v as number)}</span>) },
              { key: "lpj", label: "LPJ", numeric: true, width: 132, render: (v) => (v == null ? "–" : <span className="num">{fmtNum(v as number)}</span>) },
              {
                key: "aksi", label: "", sortable: false, width: 76,
                render: (_v, row) => {
                  const e = row as unknown as Entry;
                  return (
                    <span className="row-actions">
                      <Tooltip content="Edit">
                        <Button type="button" variant="ghost" size="sm" className="btn-icon" disabled={terkunci} aria-label={`Edit ${e.jenis}`} onClick={() => bukaEdit(e)}>
                          <Pencil size={15} strokeWidth={1.75} />
                        </Button>
                      </Tooltip>
                      <Tooltip content="Hapus">
                        <Button type="button" variant="ghost" size="sm" className="btn-icon btn-icon-danger" disabled={terkunci} aria-label={`Hapus ${e.jenis}`} onClick={() => { setHapusGagal(null); setHapus(e); }}>
                          <Trash2 size={15} strokeWidth={1.75} />
                        </Button>
                      </Tooltip>
                    </span>
                  );
                },
              },
            ]}
          />
         </div>
        )}
      </section>
      <p className="footnote">Timeline gabungan LPJ dan dana masuk VA ini. Setiap pengisian kembali tertaut ke LPJ yang diisi, dan setiap LPJ khusus tertaut ke pengisian khususnya.</p>

      <LpjFormDialog open={lpjFormOpen} onOpenChange={setLpjFormOpen} editing={editLpj} />
      <MasukFormDialog open={masukFormOpen} onOpenChange={setMasukFormOpen} editing={editMasuk} />
      <RecordDetailDialog
        target={detail}
        onOpenChange={(o) => { if (!o) setDetail(null); }}
        onEdit={editDariDetail}
      />
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
