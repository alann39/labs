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

/** Satu baris grid detail: label tetap di kiri, nilai rata kiri. */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{children}</span>
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
 * (Ledger, view LPJ, view Dana Masuk). Layout khusus dialog (kelas
 * .detail-*): badge jenis di bawah judul, hero nominal, grid label dan
 * nilai rata kiri, footer ber-divider. Footer: Edit (membuka form edit
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
  let badges: ReactNode = null;
  let body: ReactNode = null;

  if (target?.kind === "lpj") {
    const r = target.record;
    title = r.no;
    description = "Detail catatan LPJ";
    badges = <JenisLpj record={r} />;
    let status: ReactNode;
    if (r.jenis === "khusus") {
      const induk = month.masuk.find((x) => x.id === r.khususDariMasukId);
      status = (
        <span className="detail-status">
          <Badge size="sm" color="violet">Dari pengisian khusus</Badge>
          {induk && induk.tanggal !== r.tanggal && <span className="detail-muted">{fmtTglPanjang(induk.tanggal)}</span>}
        </span>
      );
    } else if (lpjSudahDiisi(month, r.id)) {
      const isi = month.masuk.find((x) => x.jenis === "kembali" && x.lpjId === r.id);
      status = (
        <span className="detail-status">
          <Badge size="sm" tone="success">Sudah diisi kembali</Badge>
          {isi && isi.tanggal !== r.tanggal && <span className="detail-muted">{fmtTglPanjang(isi.tanggal)}</span>}
        </span>
      );
    } else if (r.lpjClosing) {
      status = (
        <span className="detail-status">
          <Badge size="sm" tone="neutral" icon={<Flag size={12} strokeWidth={1.75} fill="currentColor" aria-hidden="true" />}>LPJ Closing</Badge>
        </span>
      );
    } else {
      status = <Badge size="sm" tone="warning">Belum diisi kembali</Badge>;
    }
    body = (
      <>
        <DetailRow label="Tanggal">{fmtTglPanjang(r.tanggal)}</DetailRow>
        <DetailRow label="VA">{va?.nama ?? r.vaId}</DetailRow>
        <DetailRow label="Status">{status}</DetailRow>
        <DetailRow label="Keterangan">{r.keterangan || "–"}</DetailRow>
      </>
    );
  } else if (target?.kind === "masuk") {
    const r = target.record;
    title = MASUK_JENIS_LABEL[r.jenis];
    description = "Detail catatan dana masuk";
    badges = <JenisMasuk record={r} />;
    let tautan: string;
    if (r.jenis === "kembali") {
      const sasaran = r.lpjId ? month.lpj.find((x) => x.id === r.lpjId) : undefined;
      tautan = sasaran ? `Untuk ${sasaran.no}` : "Tanpa tautan LPJ";
    } else if (r.jenis === "khusus") {
      const anak = month.lpj.find((x) => x.jenis === "khusus" && x.khususDariMasukId === r.id);
      tautan = anak ? `LPJ khusus ${anak.no}` : "Belum ada LPJ khusus";
    } else {
      tautan = "Isi awal bulan, saldo normal penuh";
    }
    body = (
      <>
        <DetailRow label="Tanggal">{fmtTglPanjang(r.tanggal)}</DetailRow>
        <DetailRow label="VA">{va?.nama ?? r.vaId}</DetailRow>
        <DetailRow label="Tautan">{tautan}</DetailRow>
        {r.jenis === "khusus" && r.referensiNama && <DetailRow label="Referensi">{r.referensiNama}</DetailRow>}
        <DetailRow label="Keterangan">{r.keterangan || "–"}</DetailRow>
      </>
    );
  }

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      {target && (
        <DialogContent title={title} description={description} className="detail-dialog">
          <div className="detail-badges">{badges}</div>
          <div className="detail-hero">
            <div className="detail-hero-label">Nominal</div>
            <div className="detail-hero-value">{fmtRp(target.record.nominal)}</div>
          </div>
          <div className="detail-grid">{body}</div>
          <div className="detail-footer">
            {onEdit && (
              <Button
                variant="secondary"
                disabled={terkunci}
                title={terkunci ? "VA sudah closing, catatan terkunci" : undefined}
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
