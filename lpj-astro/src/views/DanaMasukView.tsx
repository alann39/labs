import { useEffect, useMemo, useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import { Textarea } from "@/components/arc/textarea/textarea";
import { MoneyInput } from "@/components/arc/money-input/money-input";
import { DatePicker } from "@/components/arc/date-picker/date-picker";
import { FileDropzone } from "@/components/arc/file-dropzone/file-dropzone";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Badge } from "@/components/arc/badge/badge";
import { Dialog, DialogContent, DialogClose } from "@/components/arc/dialog/dialog";
import { Alert } from "@/components/arc/alert/alert";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { PageHead } from "../components/PageHead";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { fmtNum, fmtRp, fmtTglPanjang, toISO } from "../format";
import { useStore, MASUK_JENIS_LABEL, type DanaMasukRecord } from "../store";

const parseISO = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

type JenisForm = "kembali" | "khusus";

export function MasukFormDialog({
  open, onOpenChange, editing, presetVaId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: DanaMasukRecord | null;
  presetVaId?: string;
}) {
  const { state, month, addMasuk, updateMasuk } = useStore();
  const [vaId, setVaId] = useState("");
  const [tanggal, setTanggal] = useState<Date | undefined>(undefined);
  const [nominal, setNominal] = useState<number | null>(null);
  const [jenis, setJenis] = useState<JenisForm>("kembali");
  const [lpjId, setLpjId] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [referensiNama, setReferensiNama] = useState<string | undefined>(undefined);
  const editAwal = editing?.jenis === "awal";

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setVaId(editing.vaId);
      setTanggal(parseISO(editing.tanggal));
      setNominal(editing.nominal);
      setJenis(editing.jenis === "khusus" ? "khusus" : "kembali");
      setLpjId(editing.lpjId ?? "");
      setKeterangan(editing.keterangan ?? "");
      setReferensiNama(editing.referensiNama);
    } else {
      setVaId(presetVaId ?? month.vas[0]?.id ?? "");
      setTanggal(parseISO(`${month.key}-01`));
      setNominal(null);
      setJenis("kembali");
      setLpjId("");
      setKeterangan("");
      setReferensiNama(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const vaOptions = month.vas
    .filter((v) => state.masterVa.find((mv) => mv.id === v.id)?.aktif !== false || v.id === editing?.vaId)
    .map((v) => ({ value: v.id, label: v.nama }));
  const vaTerkunci = month.vas.find((v) => v.id === vaId)?.closingSelesai ?? false;

  const lpjOptions = useMemo(
    () =>
      month.lpj
        .filter((r) => r.vaId === vaId && r.jenis === "reguler")
        .filter((r) => !month.masuk.some((x) => x.jenis === "kembali" && x.lpjId === r.id) || r.id === editing?.lpjId)
        .map((r) => ({ value: r.id, label: `${r.no} · ${fmtTglPanjang(r.tanggal)} · ${fmtRp(r.nominal)}` })),
    [month, vaId, editing],
  );

  const jenisEfektif: DanaMasukRecord["jenis"] = editAwal ? "awal" : jenis;
  const valid =
    !!tanggal && nominal !== null && nominal > 0 && !vaTerkunci &&
    (jenisEfektif !== "kembali" || lpjId !== "" || editAwal);

  const simpan = () => {
    if (!valid || !tanggal || nominal === null) return;
    const data = {
      vaId,
      tanggal: toISO(tanggal),
      nominal,
      jenis: jenisEfektif,
      lpjId: jenisEfektif === "kembali" ? (lpjId || undefined) : undefined,
      keterangan: keterangan.trim() || undefined,
      referensiNama: jenisEfektif === "khusus" ? referensiNama : undefined,
    };
    if (editing) updateMasuk(editing.id, data);
    else addMasuk(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={editing ? "Edit dana masuk" : "Input dana masuk"} description="Dana masuk yang dicatat di sini adalah dana yang sudah ditransfer ke VA.">
        <div className="form-stack">
          {vaTerkunci && (
            <Alert tone="warning" title="VA ini sudah closing">
              Catatan untuk VA yang sudah closing di bulan ini tidak bisa diubah.
            </Alert>
          )}
          <Select label="Virtual account (VA)" value={vaId} onValueChange={setVaId} options={vaOptions} />
          <DatePicker label="Tanggal transfer" value={tanggal} onChange={setTanggal} locale="id-ID" format={{ day: "2-digit", month: "short", year: "numeric" }} />
          <MoneyInput
            label="Nominal dana masuk"
            currency="IDR"
            currencies={["IDR"]}
            locale="id-ID"
            value={nominal}
            onValueChange={setNominal}
            quickAdd={[]}
            description="Otomatis terformat dengan pemisah ribuan saat diketik."
          />
          {editAwal ? (
            <div>
              <div className="form-label">Jenis dana masuk</div>
              <Badge tone="neutral">Isi Awal</Badge>
              <p className="footnote" style={{ marginTop: 8 }}>Isi awal dibuat otomatis dari closing sebesar saldo normal penuh dan jenisnya tidak bisa diubah.</p>
            </div>
          ) : (
            <div>
              <div className="form-label">Jenis dana masuk</div>
              <SegmentedControl
                label="Jenis dana masuk"
                options={[
                  { value: "kembali", label: "Pengisian Kembali" },
                  { value: "khusus", label: "Pengisian Khusus" },
                ]}
                value={jenis}
                onValueChange={(v) => setJenis(v as JenisForm)}
              />
            </div>
          )}
          {jenisEfektif === "kembali" && !editAwal && (
            <Select
              label="LPJ reguler yang diisi kembali"
              value={lpjId}
              onValueChange={setLpjId}
              placeholder="Pilih LPJ"
              options={lpjOptions}
            />
          )}
          {jenisEfektif === "kembali" && !editAwal && lpjOptions.length === 0 && (
            <p className="footnote">VA ini belum punya LPJ reguler yang bebas. Catat LPJ-nya dulu di halaman LPJ.</p>
          )}
          {jenisEfektif === "khusus" && (
            <>
              <FileDropzone
                label="Referensi persetujuan (opsional)"
                description="Seret file referensi persetujuan manajemen ke sini, atau klik untuk memilih. Baru nama file yang disimpan."
                accept=".pdf,.jpg,.jpeg,.png"
                multiple={false}
                maxFiles={1}
                onFilesChange={(files) => setReferensiNama(files[0]?.name)}
              />
              {referensiNama && <p className="footnote">Referensi saat ini: {referensiNama}</p>}
            </>
          )}
          <Textarea label="Keterangan (opsional)" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} rows={3} placeholder="Keterangan dana masuk" />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <DialogClose asChild>
              <Button variant="secondary">Batal</Button>
            </DialogClose>
            <Button disabled={!valid} onClick={simpan}>
              {editing ? "Simpan perubahan" : "Simpan dana masuk"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type Row = {
  id: string; tanggal: string; va: string; jenis: string; nominal: number;
  tautan: string; keterangan: string; terkunci: boolean;
};

export function DanaMasukView({ onHelp }: { onHelp: () => void }) {
  const { month, deleteMasuk } = useStore();
  const [filterVa, setFilterVa] = useState("semua");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DanaMasukRecord | null>(null);
  const [hapus, setHapus] = useState<Row | null>(null);
  const [gagal, setGagal] = useState<string | null>(null);

  const rows: Row[] = useMemo(
    () =>
      month.masuk
        .filter((r) => filterVa === "semua" || r.vaId === filterVa)
        .map((r) => {
          const va = month.vas.find((v) => v.id === r.vaId);
          let tautan: string;
          if (r.jenis === "kembali") {
            const target = r.lpjId ? month.lpj.find((x) => x.id === r.lpjId) : undefined;
            tautan = target ? `Untuk ${target.no}` : "Tanpa tautan LPJ";
          } else if (r.jenis === "khusus") {
            const anak = month.lpj.find((x) => x.jenis === "khusus" && x.khususDariMasukId === r.id);
            tautan = anak ? `Sudah ada ${anak.no}` : "Belum ada LPJ khusus";
          } else {
            tautan = "Saldo normal penuh";
          }
          const ket = [r.keterangan, r.referensiNama ? `Ref: ${r.referensiNama}` : ""].filter(Boolean).join(" · ");
          return {
            id: r.id, tanggal: r.tanggal, va: va?.nama ?? r.vaId, jenis: r.jenis,
            nominal: r.nominal, tautan, keterangan: ket, terkunci: va?.closingSelesai ?? false,
          };
        })
        .sort((a, b) => a.tanggal.localeCompare(b.tanggal)),
    [month, filterVa],
  );

  const recordById = (id: string) => month.masuk.find((r) => r.id === id) ?? null;

  return (
    <>
      <PageHead title="Dana masuk" sub="Catatan dana yang sudah ditransfer ke VA untuk bulan aktif" onHelp={onHelp}>
        <div style={{ width: 240 }}>
          <Select
            label="Filter VA"
            value={filterVa}
            onValueChange={setFilterVa}
            options={[{ value: "semua", label: "Semua VA" }, ...month.vas.map((v) => ({ value: v.id, label: v.nama }))]}
          />
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus size={16} strokeWidth={1.75} /> Tambah dana masuk
        </Button>
      </PageHead>

      {gagal && (
        <Alert tone="danger" title="Dana masuk tidak bisa dihapus">
          {gagal}
        </Alert>
      )}

      <section className="card">
        {rows.length === 0 ? (
          <EmptyState
            icon={<Wallet size={24} strokeWidth={1.75} />}
            title="Belum ada dana masuk"
            description="Dana masuk untuk filter ini belum dicatat."
            action={<Button variant="secondary" onClick={() => { setEditing(null); setFormOpen(true); }}>Tambah dana masuk</Button>}
          />
        ) : (
          <SortableDataTable
            caption="Daftar dana masuk bulan aktif"
            rows={rows}
            rowKey="id"
            defaultSort={{ key: "tanggal", direction: "asc" }}
            columns={[
              { key: "tanggal", label: "Tanggal", render: (v) => fmtTglPanjang(v as string) },
              { key: "va", label: "VA" },
              { key: "jenis", label: "Jenis", render: (v) => <Badge tone={v === "khusus" ? "info" : v === "kembali" ? "success" : "neutral"}>{MASUK_JENIS_LABEL[v as DanaMasukRecord["jenis"]]}</Badge> },
              { key: "nominal", label: "Nominal", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
              { key: "tautan", label: "Tautan" },
              { key: "keterangan", label: "Keterangan" },
              {
                key: "aksi", label: "Aksi", sortable: false,
                render: (_v, row) => {
                  const r = row as unknown as Row;
                  return (
                    <span className="row-actions">
                      <Button size="sm" variant="secondary" disabled={r.terkunci} onClick={() => { setEditing(recordById(r.id)); setFormOpen(true); }}>Edit</Button>
                      <Button size="sm" variant="ghost" disabled={r.terkunci} onClick={() => { setGagal(null); setHapus(r); }}>Hapus</Button>
                    </span>
                  );
                },
              },
            ]}
          />
        )}
      </section>
      <p className="footnote">Isi awal tidak bisa dibuat manual, dibuat otomatis dari closing. Menghapus pengisian kembali melepaskan tautan LPJ-nya. Dana masuk khusus yang sudah punya LPJ khusus tidak bisa dihapus.</p>

      <MasukFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />
      <ConfirmDelete
        open={hapus !== null}
        onOpenChange={(o) => { if (!o) setHapus(null); }}
        title={`Hapus dana masuk ${hapus ? MASUK_JENIS_LABEL[hapus.jenis as DanaMasukRecord["jenis"]] : ""}?`}
        description={hapus ? `${hapus.va}, ${fmtRp(hapus.nominal)}, ${fmtTglPanjang(hapus.tanggal)}.` : ""}
        onConfirm={() => {
          if (hapus && !deleteMasuk(hapus.id)) {
            setGagal("Dana masuk khusus ini sudah punya LPJ khusus. Hapus LPJ khususnya dulu sebelum menghapus dana masuknya.");
          }
          setHapus(null);
        }}
      />
    </>
  );
}
