import { useState } from "react";
import { Button } from "@/components/arc/button/button";
import { Badge } from "@/components/arc/badge/badge";
import { Alert } from "@/components/arc/alert/alert";
import { Dialog, DialogContent, DialogClose } from "@/components/arc/dialog/dialog";
import { DatePicker } from "@/components/arc/date-picker/date-picker";
import { MoneyInput } from "@/components/arc/money-input/money-input";
import { Textarea } from "@/components/arc/textarea/textarea";
import { PageHead } from "../components/PageHead";
import { fmtNum, fmtRp, fmtTglPanjang, namaBulan, toISO } from "../format";
import {
  monthDitutup, monthTotals, useStore, vaStats, vaStatus, statusPengembalian,
  PENGEMBALIAN_LABEL, VA_STATUS_BADGE, type VA,
} from "../store";
import type { View } from "../App";

function VaBlock({ va }: { va: VA }) {
  const { month, setSisaBank, confirmPengembalian, closingVa } = useStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tanggal, setTanggal] = useState<Date | undefined>(undefined);
  const [nominal, setNominal] = useState<number | null>(null);
  const [catatan, setCatatan] = useState("");
  const s = vaStats(month, va);
  const statusP = statusPengembalian(month, va);
  const badge = VA_STATUS_BADGE[vaStatus(month, va)];
  const lpjClosing = month.lpj.find((r) => r.vaId === va.id && r.lpjClosing);
  const sisaPengembalian = s.dk > 0 ? s.dk - va.pengembalian.totalDiterima : 0;
  const bisaClosing = !va.closingSelesai && va.sisaDiinput && (s.dk <= 0 || statusP === "diterima");

  const alasan: string[] = [];
  if (!va.closingSelesai) {
    if (!va.sisaDiinput) alasan.push("Sisa di bank belum diinput");
    if (s.dk > 0 && statusP !== "diterima") alasan.push("Pengembalian belum lunas");
  }

  const bukaDialog = () => {
    setTanggal(new Date());
    setNominal(sisaPengembalian > 0 ? sisaPengembalian : null);
    setCatatan("");
    setDialogOpen(true);
  };

  return (
    <div className="va-block">
      <div className="va-block-head">
        <span style={{ fontSize: 16, fontWeight: 500 }}>{va.nama}</span>
        <Badge tone={badge.tone}>{badge.label}</Badge>
        <div className="spacer" />
        {!va.closingSelesai && s.dk > 0 && (
          <Button size="sm" variant="secondary" onClick={bukaDialog}>Konfirmasi pengembalian</Button>
        )}
        {!va.closingSelesai && (
          <Button size="sm" variant="secondary" disabled={!bisaClosing} onClick={() => closingVa(va.id)}>Closing VA</Button>
        )}
      </div>

      <div className="va-stats">
        <div className="va-stat"><div className="k">Saldo normal</div><div className="v num">{fmtRp(va.saldoNormal)}</div></div>
        <div className="va-stat"><div className="k">Total masuk</div><div className="v num">{fmtRp(s.masuk)}</div></div>
        <div className="va-stat"><div className="k">Total LPJ</div><div className="v num">{fmtRp(s.lpj)}</div></div>
        <div className="va-stat">
          <div className="k">Sisa di bank</div>
          <input
            key={`${month.key}-${va.id}-${va.sisaBank}`}
            className="cell-input small"
            defaultValue={fmtNum(va.sisaBank)}
            inputMode="numeric"
            aria-label={`Sisa saldo di bank ${va.nama}`}
            disabled={va.closingSelesai}
            onBlur={(e) => {
              const nilai = parseInt(e.target.value.replace(/\D/g, ""), 10);
              if (!Number.isNaN(nilai) && nilai !== va.sisaBank) setSisaBank(va.id, nilai);
              e.target.value = fmtNum(Number.isNaN(nilai) ? va.sisaBank : nilai);
            }}
          />
        </div>
        <div className="va-stat">
          <div className="k">Selisih (dana dikembalikan)</div>
          <div className="v num" style={{ color: s.dk < 0 ? "var(--danger)" : s.dk > 0 ? "var(--success)" : "var(--foreground)" }}>{fmtRp(s.dk)}</div>
        </div>
        <div className="va-stat">
          <div className="k">Pengembalian</div>
          <div className="v" style={{ fontSize: 14 }}>
            {PENGEMBALIAN_LABEL[statusP]}
            {s.dk > 0 && va.pengembalian.totalDiterima > 0 ? ` · ${fmtRp(va.pengembalian.totalDiterima)}` : ""}
          </div>
        </div>
      </div>

      <p className="footnote" style={{ marginTop: 12 }}>
        {lpjClosing
          ? `Cek LPJ Closing: ${lpjClosing.no} ${fmtRp(lpjClosing.nominal)} + sisa bank ${fmtRp(va.sisaBank)} = ${fmtRp(lpjClosing.nominal + va.sisaBank)}, saldo normal ${fmtRp(va.saldoNormal)}. Selisih cek ini sama dengan dana dikembalikan bila semua LPJ lain sudah diisi kembali.`
          : "Belum ada LPJ yang ditandai LPJ Closing untuk VA ini."}
        {s.dk < 0 ? " Kelebihan LPJ: kekurangan ditutup dept secara terpisah, di luar pengembalian." : ""}
        {alasan.length > 0 ? ` Closing belum bisa: ${alasan.join("; ").toLowerCase()}.` : ""}
      </p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          title={`Konfirmasi pengembalian ${va.nama}`}
          description={`Selisih yang harus dikembalikan ${fmtRp(s.dk)}. Sudah diterima ${fmtRp(va.pengembalian.totalDiterima)}, sisa ${fmtRp(sisaPengembalian)}.`}
        >
          <div className="form-stack">
            <DatePicker label="Tanggal diterima" value={tanggal} onChange={setTanggal} locale="id-ID" format={{ day: "2-digit", month: "short", year: "numeric" }} />
            <MoneyInput
              label="Nominal diterima"
              currency="IDR"
              currencies={["IDR"]}
              locale="id-ID"
              value={nominal}
              onValueChange={setNominal}
              quickAdd={[]}
              description="Boleh sebagian. Nominal terakumulasi ke total diterima."
            />
            <Textarea label="Catatan (opsional)" value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={2} placeholder="Catatan penerimaan pengembalian" />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <DialogClose asChild>
                <Button variant="secondary">Batal</Button>
              </DialogClose>
              <Button
                disabled={!tanggal || nominal === null || nominal <= 0}
                onClick={() => {
                  if (!tanggal || nominal === null) return;
                  confirmPengembalian(va.id, { tanggal: toISO(tanggal), nominal, catatan: catatan.trim() || undefined });
                  setDialogOpen(false);
                }}
              >
                Simpan konfirmasi
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function Closing({ go, onHelp }: { go: (v: View) => void; onHelp: () => void }) {
  const { month } = useStore();
  const totals = monthTotals(month);
  const ditutup = monthDitutup(month);
  const jumlahClosing = month.vas.filter((v) => v.closingSelesai).length;

  return (
    <>
      <PageHead
        title="Closing per VA"
        sub={`${namaBulan(month.key)} · Closing berlaku per VA setelah selisihnya dikembalikan dan diterima keuangan`}
        onHelp={onHelp}
      >
        <Button variant="secondary" onClick={() => go("dashboard")}>Ke dashboard</Button>
      </PageHead>

      {totals.vaKurang.length > 0 && (
        <Alert tone="warning" title={`${totals.vaKurang.length} VA kelebihan LPJ bulan ini`}>
          {totals.vaKurang.map((v) => v.nama.replace("Konstruksi ", "")).join(", ")}. Kekurangannya ditutup dept secara terpisah sebelum pengisian ulang.
        </Alert>
      )}
      {ditutup && (
        <Alert tone="success" title={`Bulan ${namaBulan(month.key)} sudah ditutup`}>
          Semua VA sudah closing. Isi awal bulan berikutnya sudah dibuat sebesar full saldo normal tiap VA.
        </Alert>
      )}

      <section className="card">
        <div className="action-bar">
          <div>
            <div className="k">Total wajib dikembalikan</div>
            <div className="v num">{fmtRp(totals.dkPositif)}</div>
          </div>
          <div className="sep" />
          <div>
            <div className="k">Sudah diterima</div>
            <div className="v num">{fmtRp(totals.diterima)}</div>
          </div>
          <div className="sep" />
          <div>
            <div className="k">Belum diterima</div>
            <div className="v num">{fmtRp(totals.belumDiterima)}</div>
          </div>
          <div style={{ flex: 1 }} />
          <div>
            <div className="k">VA sudah closing</div>
            <div className="v num">{jumlahClosing} dari {month.vas.length}</div>
          </div>
        </div>
      </section>

      <section className="card">
        {month.vas.map((va) => (
          <VaBlock key={`${month.key}-${va.id}`} va={va} />
        ))}
      </section>

      <p className="footnote">Closing VA mengunci catatan VA itu di bulan ini dan membuat isi awal bulan berikutnya sebesar full saldo normal untuk VA tersebut. Total wajib dikembalikan hanya menjumlahkan VA berselisih positif.</p>
    </>
  );
}
