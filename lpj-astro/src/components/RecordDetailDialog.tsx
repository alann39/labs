import type { ReactNode } from "react";
import { Flag, Sparkles } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Badge } from "@/components/arc/badge/badge";
import { Dialog, DialogContent, DialogClose } from "@/components/arc/dialog/dialog";
import { fmtRp, fmtTglPanjang } from "../format";
import {
  useStore, lpjSudahDiisi, MASUK_JENIS_LABEL,
  type LpjRecord, type DanaMasukRecord,
} from "../store";

/** Target dialog detail read-only: satu catatan LPJ atau DanaMasuk. */
export type DetailTarget =
  | { kind: "lpj"; record: LpjRecord }
  | { kind: "masuk"; record: DanaMasukRecord };

function Baris({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="pop-row">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ textAlign: "right" }}>{children}</span>
    </div>
  );
}

function JenisLpj({ record }: { record: LpjRecord }) {
  return (
    <span className="row-actions">
      {record.jenis === "khusus" ? (
        <Badge size="sm" color="violet" icon={<Sparkles size={12} strokeWidth={1.75} />}>Khusus</Badge>
      ) : (
        <Badge size="sm" tone="neutral">Reguler</Badge>
      )}
      {record.lpjClosing && (
        <span style={{ color: "var(--warning)", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}>
          <Flag size={13} strokeWidth={1.75} fill="currentColor" aria-hidden="true" /> LPJ Closing
        </span>
      )}
    </span>
  );
}

function JenisMasuk({ record }: { record: DanaMasukRecord }) {
  if (record.jenis === "khusus") {
    return <Badge size="sm" color="violet" icon={<Sparkles size={12} strokeWidth={1.75} />}>Pengisian Khusus</Badge>;
  }
  if (record.jenis === "kembali") return <Badge size="sm" tone="success">Pengisian Kembali</Badge>;
  return <Badge size="sm" tone="neutral">Isi Awal</Badge>;
}

/**
 * Dialog detail read-only untuk catatan yang tertaut dari sel tautan
 * (Ledger, view LPJ, view Dana Masuk). Footer: Edit (membuka form edit
 * catatan ini di view asal, lewat callback host) + Tutup.
 */
export function RecordDetailDialog({
  target, onOpenChange, onEdit,
}: {
  target: DetailTarget | null;
  onOpenChange: (open: boolean) => void;
  onEdit?: (t: DetailTarget) => void;
}) {
  const { month } = useStore();
  const va = target ? month.vas.find((v) => v.id === target.record.vaId) : undefined;
  const terkunci = va?.closingSelesai ?? false;

  let title = "";
  let description = "";
  let body: ReactNode = null;

  if (target?.kind === "lpj") {
    const r = target.record;
    title = r.no;
    description = "Detail catatan LPJ";
    let status: string;
    if (r.jenis === "khusus") {
      const induk = month.masuk.find((x) => x.id === r.khususDariMasukId);
      status = induk ? `Dari pengisian khusus · ${fmtTglPanjang(induk.tanggal)}` : "Pengisian khusus";
    } else if (lpjSudahDiisi(month, r.id)) {
      const isi = month.masuk.find((x) => x.jenis === "kembali" && x.lpjId === r.id);
      status = isi ? `Sudah diisi kembali · ${fmtTglPanjang(isi.tanggal)}` : "Sudah diisi kembali";
    } else if (r.lpjClosing) {
      status = "LPJ closing — terisi otomatis dari isi awal bulan berikutnya";
    } else {
      status = "Belum diisi kembali";
    }
    body = (
      <>
        <Baris label="Tanggal">{fmtTglPanjang(r.tanggal)}</Baris>
        <Baris label="VA">{va?.nama ?? r.vaId}</Baris>
        <Baris label="Jenis"><JenisLpj record={r} /></Baris>
        <Baris label="Nominal">{fmtRp(r.nominal)}</Baris>
        <Baris label="Status">{status}</Baris>
        <Baris label="Keterangan">{r.keterangan || "–"}</Baris>
      </>
    );
  } else if (target?.kind === "masuk") {
    const r = target.record;
    title = `${MASUK_JENIS_LABEL[r.jenis]} · ${fmtTglPanjang(r.tanggal)}`;
    description = "Detail catatan dana masuk";
    let tautan: string;
    if (r.jenis === "kembali") {
      const sasaran = r.lpjId ? month.lpj.find((x) => x.id === r.lpjId) : undefined;
      tautan = sasaran ? `Untuk ${sasaran.no}` : "Tanpa tautan LPJ";
    } else if (r.jenis === "khusus") {
      const anak = month.lpj.find((x) => x.jenis === "khusus" && x.khususDariMasukId === r.id);
      tautan = anak ? `LPJ khusus ${anak.no}` : "Belum ada LPJ khusus";
    } else {
      tautan = "Isi awal bulan — saldo normal penuh";
    }
    body = (
      <>
        <Baris label="Tanggal">{fmtTglPanjang(r.tanggal)}</Baris>
        <Baris label="VA">{va?.nama ?? r.vaId}</Baris>
        <Baris label="Jenis"><JenisMasuk record={r} /></Baris>
        <Baris label="Nominal">{fmtRp(r.nominal)}</Baris>
        <Baris label="Tautan">{tautan}</Baris>
        {r.jenis === "khusus" && r.referensiNama && <Baris label="Referensi">{r.referensiNama}</Baris>}
        <Baris label="Keterangan">{r.keterangan || "–"}</Baris>
      </>
    );
  }

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      {target && (
        <DialogContent title={title} description={description}>
          <div className="pop-rows">{body}</div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            {onEdit && (
              <Button
                variant="secondary"
                disabled={terkunci}
                title={terkunci ? "VA sudah closing — catatan terkunci" : undefined}
                onClick={() => onEdit(target)}
              >
                Edit
              </Button>
            )}
            <DialogClose asChild>
              <Button>Tutup</Button>
            </DialogClose>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
