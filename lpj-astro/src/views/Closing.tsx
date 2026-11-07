import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Badge } from "@/components/arc/badge/badge";
import { Alert } from "@/components/arc/alert/alert";
import { Dialog, DialogContent, DialogClose } from "@/components/arc/dialog/dialog";
import { DatePicker } from "@/components/arc/date-picker/date-picker";
import { MoneyInput } from "@/components/arc/money-input/money-input";
import { Textarea } from "@/components/arc/textarea/textarea";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/arc/popover/popover";
import { PageHead } from "../components/PageHead";
import { fmtNum, fmtRp, namaBulan, toISO } from "../format";
import {
  monthDitutup, monthTotals, useStore, vaStats, vaStatus, statusPengembalian, lpjSudahDiisi,
  PENGEMBALIAN_LABEL, VA_STATUS_BADGE, type VA,
} from "../store";
import type { View } from "../App";

/** Popover info (i) per VA: rincian cek LPJ Closing, status isi-kembali
    LPJ lain, dan alasan gate — menggantikan paragraf panjang di blok lama.
    Pola sama dengan popover rincian di Dashboard (pop-rows/pop-row). */
function InfoCek({ va }: { va: VA }) {
  const { month } = useStore();
  const s = vaStats(month, va);
  const statusP = statusPengembalian(month, va);
  const lpjClosing = month.lpj.find((r) => r.vaId === va.id && r.lpjClosing);
  const lpjLainBelum = month.lpj.filter(
    (r) => r.vaId === va.id && r.jenis === "reguler" && !r.lpjClosing && !lpjSudahDiisi(month, r.id),
  ).length;

  const alasan: string[] = [];
  if (!va.closingSelesai) {
    if (!va.sisaDiinput) alasan.push("Sisa di bank belum diinput");
    if (s.dk > 0 && statusP !== "diterima") alasan.push("Pengembalian belum lunas");
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="info-btn" aria-label={`Cek closing ${va.nama}`}>
          <Info size={16} strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end">
        <div className="pop-rows">
          {lpjClosing ? (
            <>
              <div className="pop-row"><span>LPJ Closing {lpjClosing.no}</span><span className="num">{fmtRp(lpjClosing.nominal)}</span></div>
              <div className="pop-row"><span>Sisa di bank</span><span className="num">{fmtRp(va.sisaBank)}</span></div>
              <div className="pop-row"><span>Jumlah cek</span><span className="num">{fmtRp(lpjClosing.nominal + va.sisaBank)}</span></div>
              <div className="pop-row"><span>Saldo normal</span><span className="num">{fmtRp(va.saldoNormal)}</span></div>
              <p className="pop-note">Selisih cek ini sama dengan dana dikembalikan bila semua LPJ lain sudah diisi kembali.</p>
            </>
          ) : (
            <p className="pop-note" style={{ borderTop: 0, paddingTop: 0, marginTop: 0 }}>Belum ada LPJ yang ditandai LPJ Closing untuk VA ini.</p>
          )}
          <div className="pop-row">
            <span>LPJ lain belum diisi kembali</span>
            <span className="num">{lpjLainBelum > 0 ? `${lpjLainBelum} LPJ` : "Tidak ada"}</span>
          </div>
          {s.dk < 0 && <p className="pop-note">Kelebihan LPJ: kekurangan ditutup dept secara terpisah, di luar pengembalian.</p>}
          {alasan.length > 0 && <p className="pop-note">Closing belum bisa: {alasan.join("; ").toLowerCase()}.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function VaBlock({ va }: { va: VA }) {
  const { month, setSisaBank, confirmPengembalian, closingVa } = useStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [tanggal, setTanggal] = useState<Date | undefined>(undefined);
  const [nominal, setNominal] = useState<number | null>(null);
  const [catatan, setCatatan] = useState("");
  const s = vaStats(month, va);
  const statusP = statusPengembalian(month, va);
  const badge = VA_STATUS_BADGE[vaStatus(month, va)];
  const sisaPengembalian = s.dk > 0 ? s.dk - va.pengembalian.totalDiterima : 0;
  const bisaClosing = !va.closingSelesai && va.sisaDiinput && (s.dk <= 0 || statusP === "diterima");

  const bukaDialog = () => {
    setTanggal(new Date());
    setNominal(sisaPengembalian > 0 ? sisaPengembalian : null);
    setCatatan("");
    setDialogOpen(true);
  };

  return (
    <div className="closing-item">
      <div className="closing-main" data-closing-row>
        <button
          type="button"
          className="row-icon-btn"
          aria-label={`Detail ${va.nama}`}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown size={16} strokeWidth={1.75} /> : <ChevronRight size={16} strokeWidth={1.75} />}
        </button>
        <span className="closing-name">{va.nama}</span>
        <Badge size="sm" tone={badge.tone}>{badge.label}</Badge>
        <span className="closing-meta">
          {s.dk <= 0
            ? "Tidak perlu pengembalian"
            : statusP === "diterima"
              ? `Diterima ${fmtRp(va.pengembalian.totalDiterima)}`
              : statusP === "sebagian"
                ? `Sebagian ${fmtRp(va.pengembalian.totalDiterima)}`
                : "Belum diterima"}
        </span>
        <div className="spacer" />
        <div className="closing-selisih">
          <div className="k">Selisih</div>
          <div className="v num" style={{ color: s.dk < 0 ? "var(--danger)" : s.dk > 0 ? "var(--success)" : "var(--foreground)" }}>{fmtRp(s.dk)}</div>
        </div>
        <InfoCek va={va} />
        {!va.closingSelesai && s.dk > 0 && (
          <Button size="sm" variant="secondary" onClick={bukaDialog}>Konfirmasi pengembalian</Button>
        )}
        {!va.closingSelesai && (
          <Button size="sm" variant="secondary" disabled={!bisaClosing} onClick={() => closingVa(va.id)}>Closing VA</Button>
        )}
      </div>

      {expanded && (
        <div className="closing-detail">
          <div className="va-stats" style={{ marginTop: 0 }}>
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
              <div className="k">Pengembalian</div>
              <div className="v" style={{ fontSize: 14 }}>
                {PENGEMBALIAN_LABEL[statusP]}
                {s.dk > 0 && va.pengembalian.totalDiterima > 0 ? ` · ${fmtRp(va.pengembalian.totalDiterima)}` : ""}
              </div>
            </div>
            {s.dk > 0 && (
              <div className="va-stat"><div className="k">Sisa pengembalian</div><div className="v num">{fmtRp(sisaPengembalian)}</div></div>
            )}
          </div>
        </div>
      )}

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
        <div className="closing-banner" role="alert">
          <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" />
          <span style={{ fontWeight: 500 }}>{totals.vaKurang.length} VA kelebihan LPJ</span>
          {totals.vaKurang.map((v) => (
            <Badge key={v.id} size="sm" tone="danger">{v.nama.replace("Konstruksi ", "")}</Badge>
          ))}
          <div className="spacer" />
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="info-btn" aria-label="Penjelasan VA kelebihan LPJ">
                <Info size={16} strokeWidth={1.75} />
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="end">
              <p className="pop-note" style={{ borderTop: 0, paddingTop: 0, marginTop: 0, maxWidth: 280 }}>
                Kekurangannya ditutup dept secara terpisah sebelum pengisian ulang.
              </p>
            </PopoverContent>
          </Popover>
        </div>
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

      <section className="closing-panel" aria-label="Status closing per VA">
        {month.vas.map((va) => (
          <VaBlock key={`${month.key}-${va.id}`} va={va} />
        ))}
      </section>

      <p className="footnote">Closing VA mengunci catatan VA itu di bulan ini dan membuat isi awal bulan berikutnya sebesar full saldo normal untuk VA tersebut. Total wajib dikembalikan hanya menjumlahkan VA berselisih positif.</p>
    </>
  );
}
