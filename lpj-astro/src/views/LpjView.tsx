import { useEffect, useMemo, useState } from "react";
import { FileText, Flag, Link2, Pencil, Plus, Sparkles, Trash2, Unlink } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import { Textarea } from "@/components/arc/textarea/textarea";
import { MoneyInput } from "@/components/arc/money-input/money-input";
import { DatePicker } from "@/components/arc/date-picker/date-picker";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Badge } from "@/components/arc/badge/badge";
import { Dialog, DialogContent, DialogClose } from "@/components/arc/dialog/dialog";
import { Alert } from "@/components/arc/alert/alert";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { PageHead } from "../components/PageHead";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { fmtNum, fmtRp, fmtTglPanjang, fmtTglSingkat, toISO } from "../format";
import { useStore, lpjSudahDiisi, type LpjRecord, type DanaMasukRecord } from "../store";
import { RecordDetailDialog, type DetailTarget } from "../components/RecordDetailDialog";
import { MasukFormDialog } from "./DanaMasukView";

const parseISO = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export function LpjFormDialog({
  open, onOpenChange, editing, presetVaId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: LpjRecord | null;
  presetVaId?: string;
}) {
  const { state, month, addLpj, updateLpj } = useStore();
  const [vaId, setVaId] = useState("");
  const [tanggal, setTanggal] = useState<Date | undefined>(undefined);
  const [nominal, setNominal] = useState<number | null>(null);
  const [jenis, setJenis] = useState<"reguler" | "khusus">("reguler");
  const [khususDari, setKhususDari] = useState("");
  const [closing, setClosing] = useState(false);
  const [keterangan, setKeterangan] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setVaId(editing.vaId);
      setTanggal(parseISO(editing.tanggal));
      setNominal(editing.nominal);
      setJenis(editing.jenis);
      setKhususDari(editing.khususDariMasukId ?? "");
      setClosing(editing.lpjClosing);
      setKeterangan(editing.keterangan);
    } else {
      setVaId(presetVaId ?? month.vas[0]?.id ?? "");
      setTanggal(parseISO(`${month.key}-01`));
      setNominal(null);
      setJenis("reguler");
      setKhususDari("");
      setClosing(false);
      setKeterangan("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const vaOptions = month.vas
    .filter((v) => state.masterVa.find((mv) => mv.id === v.id)?.aktif !== false || v.id === editing?.vaId)
    .map((v) => ({ value: v.id, label: v.nama }));
  const vaTerkunci = month.vas.find((v) => v.id === vaId)?.closingSelesai ?? false;

  const khususOptions = useMemo(
    () =>
      month.masuk
        .filter((r) => r.vaId === vaId && r.jenis === "khusus")
        .filter((r) => !month.lpj.some((x) => x.jenis === "khusus" && x.khususDariMasukId === r.id) || r.id === editing?.khususDariMasukId)
        .map((r) => ({ value: r.id, label: `${fmtTglPanjang(r.tanggal)} · ${fmtRp(r.nominal)}` })),
    [month, vaId, editing],
  );

  const valid =
    !!tanggal && nominal !== null && nominal > 0 && !vaTerkunci &&
    (jenis === "reguler" || khususDari !== "");
  const noBaru = editing ? editing.no : undefined;

  const simpan = () => {
    if (!valid || !tanggal || nominal === null) return;
    const data = {
      vaId,
      tanggal: toISO(tanggal),
      nominal,
      keterangan: keterangan.trim(),
      jenis,
      khususDariMasukId: jenis === "khusus" ? khususDari : undefined,
      lpjClosing: closing,
    };
    if (editing) updateLpj(editing.id, data);
    else addLpj(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? `Edit LPJ ${noBaru ?? ""}` : "Input LPJ"} description="LPJ yang dicatat di sini adalah LPJ yang sudah disetujui.">
        <div className="form-stack">
          {vaTerkunci && (
            <Alert tone="warning" title="VA ini sudah closing">
              Catatan untuk VA yang sudah closing di bulan ini tidak bisa diubah.
            </Alert>
          )}
          <Select label="Virtual account (VA)" value={vaId} onValueChange={setVaId} options={vaOptions} />
          <DatePicker label="Tanggal LPJ" value={tanggal} onChange={setTanggal} locale="id-ID" format={{ day: "2-digit", month: "short", year: "numeric" }} />
          <MoneyInput
            label="Nominal LPJ"
            currency="IDR"
            currencies={["IDR"]}
            locale="id-ID"
            value={nominal}
            onValueChange={setNominal}
            quickAdd={[]}
            description="Otomatis terformat dengan pemisah ribuan saat diketik."
          />
          <div>
            <div className="form-label">Jenis LPJ</div>
            <SegmentedControl
              label="Jenis LPJ"
              options={[
                { value: "reguler", label: "Reguler" },
                { value: "khusus", label: "Khusus" },
              ]}
              value={jenis}
              onValueChange={(v) => setJenis(v as "reguler" | "khusus")}
            />
          </div>
          {jenis === "khusus" && (
            <Select
              label="Pengisian khusus yang dipertanggungjawabkan"
              value={khususDari}
              onValueChange={setKhususDari}
              placeholder="Pilih pengisian khusus"
              options={khususOptions}
            />
          )}
          {jenis === "khusus" && khususOptions.length === 0 && (
            <p className="footnote">VA ini belum punya pengisian khusus yang bebas. Catat pengisian khususnya dulu di halaman Dana Masuk.</p>
          )}
          <label className="check-row">
            <input type="checkbox" checked={closing} onChange={(e) => setClosing(e.target.checked)} />
            <span>
              <span className="check-title">LPJ Closing</span>
              <span className="check-desc">Tandai sebagai LPJ terakhir bulan ini untuk VA ini. Maksimal satu per VA per bulan.</span>
            </span>
          </label>
          <Textarea label="Keterangan" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} rows={3} placeholder="Keterangan LPJ" />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <DialogClose asChild>
              <Button variant="secondary">Batal</Button>
            </DialogClose>
            <Button disabled={!valid} onClick={simpan}>
              {editing ? "Simpan perubahan" : "Simpan LPJ"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Row = {
  id: string; tanggal: string; no: string; va: string; vaId: string;
  jenis: string; nominal: number; status: string; keterangan: string; terkunci: boolean;
  tautanTipe: "link" | "unlink" | "none" | "closing"; tautanSingkat: string; tautanPenuh: string;
  /** Id DanaMasuk di ujung tautan (untuk dialog detail saat sel diklik). */
  tautanRecordId?: string;
};

export function LpjView({ onHelp }: { onHelp: () => void }) {
  const { month, deleteLpj } = useStore();
  const [filterVa, setFilterVa] = useState("semua");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LpjRecord | null>(null);
  const [hapus, setHapus] = useState<Row | null>(null);
  const [detail, setDetail] = useState<DetailTarget | null>(null);
  const [editMasuk, setEditMasuk] = useState<DanaMasukRecord | null>(null);
  const [masukFormOpen, setMasukFormOpen] = useState(false);

  const editDariDetail = (t: DetailTarget) => {
    setDetail(null);
    if (t.kind === "masuk") { setEditMasuk(t.record); setMasukFormOpen(true); }
    else { setEditing(t.record); setFormOpen(true); }
  };

  const rows: Row[] = useMemo(
    () =>
      month.lpj
        .filter((r) => filterVa === "semua" || r.vaId === filterVa)
        .map((r) => {
          const va = month.vas.find((v) => v.id === r.vaId);
          let status: string;
          let tautanTipe: Row["tautanTipe"] = "none";
          let tautanSingkat = "";
          let tautanPenuh = "";
          let tautanRecordId: string | undefined;
          if (r.jenis === "khusus") {
            const induk = month.masuk.find((x) => x.id === r.khususDariMasukId);
            status = induk ? `Pengisian khusus ${fmtTglPanjang(induk.tanggal)}` : "Pengisian khusus";
            tautanPenuh = status;
            if (induk) {
              tautanTipe = "link";
              tautanSingkat = fmtTglSingkat(induk.tanggal);
              tautanRecordId = induk.id;
            } else {
              tautanTipe = "unlink";
            }
          } else if (lpjSudahDiisi(month, r.id)) {
            const isi = month.masuk.find((x) => x.jenis === "kembali" && x.lpjId === r.id);
            status = "Sudah diisi kembali";
            tautanTipe = "link";
            tautanSingkat = "Terisi";
            tautanPenuh = isi ? `Sudah diisi kembali ${fmtTglPanjang(isi.tanggal)}` : status;
            tautanRecordId = isi?.id;
          } else if (r.lpjClosing) {
            // LPJ Closing tidak perlu diisi ulang — terisi otomatis dari isi awal bulan berikutnya.
            status = "LPJ closing — terisi otomatis dari isi awal bulan berikutnya";
            tautanTipe = "closing";
            tautanSingkat = "Closing";
            tautanPenuh = status;
          } else {
            status = "Belum diisi kembali";
            tautanTipe = "unlink";
            tautanSingkat = "Belum diisi";
            tautanPenuh = status;
          }
          return {
            id: r.id, tanggal: r.tanggal, no: r.no, va: va?.nama ?? r.vaId, vaId: r.vaId,
            jenis: r.jenis, nominal: r.nominal, status, keterangan: r.keterangan,
            terkunci: va?.closingSelesai ?? false,
            tautanTipe, tautanSingkat, tautanPenuh, tautanRecordId,
          };
        })
        .sort((a, b) => a.tanggal.localeCompare(b.tanggal)),
    [month, filterVa],
  );

  const recordById = (id: string) => month.lpj.find((r) => r.id === id) ?? null;

  return (
    <>
      <PageHead title="LPJ" sub="Catatan LPJ yang sudah disetujui untuk bulan aktif" onHelp={onHelp}>
        <div style={{ width: 240 }}>
          <Select
            label="Filter VA"
            value={filterVa}
            onValueChange={setFilterVa}
            options={[{ value: "semua", label: "Semua VA" }, ...month.vas.map((v) => ({ value: v.id, label: v.nama }))]}
          />
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus size={16} strokeWidth={1.75} /> Tambah LPJ
        </Button>
      </PageHead>

      <section className="card">
        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText size={24} strokeWidth={1.75} />}
            title="Belum ada LPJ"
            description="LPJ yang sudah disetujui untuk filter ini belum dicatat."
            action={<Button variant="secondary" onClick={() => { setEditing(null); setFormOpen(true); }}>Tambah LPJ</Button>}
          />
        ) : (
          <SortableDataTable
            caption="Daftar LPJ bulan aktif"
            rows={rows}
            rowKey="id"
            defaultSort={{ key: "tanggal", direction: "asc" }}
            columns={[
              { key: "tanggal", label: "Tanggal", render: (v) => <span title={fmtTglPanjang(v as string)}>{fmtTglSingkat(v as string)}</span> },
              { key: "no", label: "No. LPJ" },
              { key: "va", label: "VA" },
              {
                key: "jenis", label: "Jenis",
                render: (v, row) => {
                  const r = row as unknown as Row;
                  const rec = recordById(r.id);
                  return (
                    <span className="row-actions">
                      {v === "khusus" ? (
                        <Badge size="sm" color="violet" icon={<Sparkles size={12} strokeWidth={1.75} />}>Khusus</Badge>
                      ) : (
                        <Badge size="sm" tone="neutral">Reguler</Badge>
                      )}
                      {rec?.lpjClosing && (
                        <span title="LPJ Closing" style={{ color: "var(--warning)", display: "inline-flex" }}>
                          <Flag size={14} strokeWidth={1.75} fill="currentColor" aria-hidden="true" />
                          <span className="sr-only">LPJ Closing</span>
                        </span>
                      )}
                    </span>
                  );
                },
              },
              { key: "nominal", label: "Nominal", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
              {
                key: "status", label: "Isi kembali",
                render: (_v, row) => {
                  const r = row as unknown as Row;
                  if (r.tautanTipe === "link") {
                    const isiSel = (
                      <>
                        <Link2 size={14} strokeWidth={1.75} aria-hidden="true" />
                        {r.tautanSingkat}
                      </>
                    );
                    if (r.tautanRecordId) {
                      const rec = month.masuk.find((x) => x.id === r.tautanRecordId);
                      if (rec) {
                        return (
                          <button type="button" className="link-cell" title={`${r.tautanPenuh} — klik untuk detail`} onClick={() => setDetail({ kind: "masuk", record: rec })}>
                            {isiSel}
                          </button>
                        );
                      }
                    }
                    return <span className="link-cell" title={r.tautanPenuh}>{isiSel}</span>;
                  }
                  if (r.tautanTipe === "closing") {
                    return (
                      <span className="link-cell dim" title={r.tautanPenuh}>
                        <Flag size={14} strokeWidth={1.75} fill="currentColor" style={{ color: "var(--warning)" }} aria-hidden="true" />
                        {r.tautanSingkat}
                      </span>
                    );
                  }
                  if (r.tautanTipe === "unlink") {
                    return (
                      <span className="link-cell dim" title={r.tautanPenuh}>
                        <Unlink size={14} strokeWidth={1.75} aria-hidden="true" />
                        {r.tautanSingkat}
                      </span>
                    );
                  }
                  return <span style={{ color: "var(--text-muted)" }} title={r.tautanPenuh}>{r.tautanSingkat}</span>;
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
                key: "aksi", label: "", sortable: false,
                render: (_v, row) => {
                  const r = row as unknown as Row;
                  return (
                    <span className="row-actions">
                      <button type="button" className="row-icon-btn" disabled={r.terkunci} aria-label={`Edit ${r.no}`} title="Edit" onClick={() => { setEditing(recordById(r.id)); setFormOpen(true); }}>
                        <Pencil size={15} strokeWidth={1.75} />
                      </button>
                      <button type="button" className="row-icon-btn danger" disabled={r.terkunci} aria-label={`Hapus ${r.no}`} title="Hapus" onClick={() => setHapus(r)}>
                        <Trash2 size={15} strokeWidth={1.75} />
                      </button>
                    </span>
                  );
                },
              },
            ]}
          />
        )}
      </section>
      <p className="footnote">Menghapus LPJ melepaskan tautan pengisian kembali yang menunjuk ke LPJ ini. Catatan pada VA yang sudah closing terkunci.</p>

      <LpjFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />
      <MasukFormDialog open={masukFormOpen} onOpenChange={setMasukFormOpen} editing={editMasuk} />
      <RecordDetailDialog
        target={detail}
        onOpenChange={(o) => { if (!o) setDetail(null); }}
        onEdit={editDariDetail}
      />
      <ConfirmDelete
        open={hapus !== null}
        onOpenChange={(o) => { if (!o) setHapus(null); }}
        title={`Hapus LPJ ${hapus?.no ?? ""}?`}
        description={hapus ? `${hapus.va}, ${fmtRp(hapus.nominal)}, ${fmtTglPanjang(hapus.tanggal)}. Pengisian kembali yang tertaut ke LPJ ini akan dilepas tautannya.` : ""}
        onConfirm={() => { if (hapus) deleteLpj(hapus.id); setHapus(null); }}
      />
    </>
  );
}
