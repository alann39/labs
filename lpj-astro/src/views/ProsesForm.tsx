import { useState } from "react";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import { Input } from "@/components/arc/input/input";
import { Textarea } from "@/components/arc/textarea/textarea";
import { MoneyInput } from "@/components/arc/money-input/money-input";
import { DatePicker } from "@/components/arc/date-picker/date-picker";
import { FileDropzone } from "@/components/arc/file-dropzone/file-dropzone";
import { Stepper } from "@/components/arc/stepper/stepper";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { PageHead } from "../components/PageHead";
import { fmtRp, toISO } from "../format";
import { useStore, vaStats, vaStatus } from "../store";
import type { View } from "../App";

const ALUR = [
  { id: "pengajuan", label: "Pengajuan dibuat", description: "Dept mengajukan LPJ dan keuangan menerima berkas." },
  { id: "pemeriksaan", label: "Pemeriksaan dan persetujuan", description: "Keuangan memeriksa, lalu menyetujui nominal LPJ." },
  { id: "pengisian", label: "Pengisian kembali", description: "Dana masuk ke VA sebesar nominal LPJ yang disetujui. Tahap inilah yang tercatat sebagai dana masuk, tertaut ke proses ini." },
  { id: "selesai", label: "Selesai", description: "Proses tercatat lengkap di ledger VA." },
];

export function ProsesForm({ go, openLedger, onHelp }: { go: (v: View) => void; openLedger: (vaId: string) => void; onHelp: () => void }) {
  const { month, addProses, nextNo } = useStore();
  const [vaId, setVaId] = useState(month.vas[0].id);
  const [tanggal, setTanggal] = useState<Date | undefined>(() => {
    const [y, m] = month.key.split("-").map(Number);
    return new Date(y, m - 1, 6);
  });
  const [noPengajuan] = useState(() => nextNo());
  const [nominal, setNominal] = useState<number | null>(null);
  const [keterangan, setKeterangan] = useState("");
  const [lampiran, setLampiran] = useState<string[]>([]);

  const va = month.vas.find((v) => v.id === vaId) ?? month.vas[0];
  const s = vaStats(month, va);
  const status = vaStatus(month, va);
  const valid = !!tanggal && nominal !== null && nominal > 0 && !month.ditutup;

  const submit = () => {
    if (!valid || !tanggal || nominal === null) return;
    addProses({ vaId, tanggal: toISO(tanggal), nominal, keterangan: keterangan.trim() || "Pengajuan LPJ", lampiran });
    openLedger(vaId);
  };

  return (
    <>
      <PageHead title="Proses LPJ baru" sub="Satu pengajuan LPJ dengan alur sampai pengisian kembali" onHelp={onHelp} />
      {month.ditutup && (
        <Alert tone="warning" title="Bulan ini sudah ditutup">
          Proses baru tidak bisa dibuat di bulan yang sudah ditutup. Buka bulan berikutnya dari Dashboard.
        </Alert>
      )}
      <div className="grid-2col">
        <section className="card">
          <div className="card-title">Form pengajuan LPJ</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 24 }}>
            <Select
              label="Virtual account (VA)"
              value={vaId}
              onValueChange={setVaId}
              options={month.vas.map((v) => ({ value: v.id, label: `${v.nama} · ${v.nomor}` }))}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <DatePicker label="Tanggal pengajuan" value={tanggal} onChange={setTanggal} locale="id-ID" format={{ day: "2-digit", month: "short", year: "numeric" }} />
              <Input label="No. pengajuan (otomatis)" value={noPengajuan} disabled readOnly />
            </div>
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
            <Textarea label="Keterangan" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} rows={3} placeholder="Pengajuan LPJ, konsumsi rapat dan transport operasional" />
            <FileDropzone
              label="Lampiran bukti LPJ"
              description="Seret file bukti LPJ (PDF atau JPG) ke sini, atau klik untuk memilih"
              accept=".pdf,.jpg,.jpeg,.png"
              multiple
              onFilesChange={(files) => setLampiran(files.map((f) => f.name))}
            />
            <div style={{ display: "flex", gap: 12 }}>
              <Button disabled={!valid} onClick={submit}>Buat proses LPJ</Button>
              <Button variant="secondary" onClick={() => go("dashboard")}>Batal</Button>
            </div>
          </div>
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <section className="card">
            <div className="card-title">Alur proses LPJ</div>
            <div style={{ marginTop: 20 }}>
              <Stepper steps={ALUR} current={0} orientation="vertical" label="Alur proses LPJ" />
            </div>
          </section>
          <Alert tone="info" title="Kenapa digabung jadi proses?">
            Dana masuk tidak lagi diinput terpisah, jadi selalu jelas pengisian ini untuk LPJ yang mana. Isi ulang awal bulan dibuat otomatis dari closing.
          </Alert>
          <section className="card">
            <div className="card-title" style={{ fontSize: 14 }}>Ringkasan VA terpilih</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
              {[
                ["Saldo normal", fmtRp(va.saldoNormal)],
                ["LPJ bulan ini", fmtRp(s.lpj)],
                ["Sisa di bank", fmtRp(va.sisaBank)],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>{k}</span>
                  <span className="num" style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Status closing</span>
                <Badge tone={status === "closing" ? "success" : status === "kurang" ? "danger" : "warning"}>
                  {status === "closing" ? "Sudah closing" : status === "kurang" ? "Kelebihan LPJ" : "Dalam proses"}
                </Badge>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
