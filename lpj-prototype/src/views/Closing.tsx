import { useState } from "react";
import { Button } from "@/components/arc/button/button";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Alert } from "@/components/arc/alert/alert";
import { Dialog, DialogContent, DialogClose } from "@/components/arc/dialog/dialog";
import { PageHead } from "../components/PageHead";
import { fmtNum, fmtRp, namaBulan, nextMonthKey } from "../format";
import { monthTotals, useStore, vaStats } from "../store";
import type { View } from "../App";

export function Closing({ go, onHelp }: { go: (v: View) => void; onHelp: () => void }) {
  const { month, setSisaBank, tutupBulan } = useStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const totals = monthTotals(month);
  const bulanDepan = namaBulan(nextMonthKey(month.key));

  const rows = month.vas.map((va) => {
    const s = vaStats(month, va);
    return { id: va.id, nama: va.nama, normal: va.saldoNormal, masuk: s.masuk, lpj: s.lpj, sisa: va.sisaBank, dk: s.dk, isiUlang: va.saldoNormal };
  });

  return (
    <>
      <PageHead
        title="Closing bulanan"
        sub={`${namaBulan(month.key)} · Hasil closing menentukan dana yang wajib dikembalikan dan pengisian ulang ${bulanDepan}`}
        onHelp={onHelp}
      />

      {totals.vaKurang.length > 0 && !month.ditutup && (
        <Alert tone="warning" title={`${totals.vaKurang.length} VA kelebihan LPJ bulan ini`}>
          {totals.vaKurang.map((v) => v.nama.replace("Konstruksi ", "")).join(", ")}. Kekurangannya wajib ditutup dept saat closing sebelum pengisian ulang.
        </Alert>
      )}
      {month.ditutup && (
        <Alert tone="success" title={`Bulan ${namaBulan(month.key)} sudah ditutup`}>
          Pengisian ulang {bulanDepan} sudah dibuat otomatis sebesar full saldo normal tiap VA.
        </Alert>
      )}

      <section className="card">
        <SortableDataTable
          caption={`Closing ${namaBulan(month.key)}`}
          rows={rows}
          rowKey="id"
          defaultSort={{ key: "nama", direction: "asc" }}
          columns={[
            {
              key: "nama", label: "VA / departemen",
              render: (v, row) => (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {(row as { dk: number }).dk < 0 && <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--danger)", flex: "none" }} />}
                  {v as string}
                </span>
              ),
            },
            { key: "normal", label: "Saldo normal", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
            { key: "masuk", label: "Total masuk", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
            { key: "lpj", label: "Total LPJ", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
            {
              key: "sisa", label: "Sisa di bank", numeric: true, sortable: false,
              render: (_v, row) => {
                const r = row as { id: string; sisa: number };
                return (
                  <input
                    key={`${month.key}-${r.id}-${r.sisa}`}
                    className="cell-input"
                    defaultValue={fmtNum(r.sisa)}
                    inputMode="numeric"
                    aria-label={`Sisa saldo di bank ${(row as { nama: string }).nama}`}
                    disabled={month.ditutup}
                    onBlur={(e) => {
                      const nilai = parseInt(e.target.value.replace(/\D/g, ""), 10);
                      if (!Number.isNaN(nilai) && nilai !== r.sisa) setSisaBank(r.id, nilai);
                      e.target.value = fmtNum(Number.isNaN(nilai) ? r.sisa : nilai);
                    }}
                  />
                );
              },
            },
            {
              key: "dk", label: "Dikembalikan", numeric: true,
              render: (v) => <span className="num" style={{ color: (v as number) < 0 ? "var(--danger)" : "var(--success)", fontWeight: 500 }}>{fmtNum(v as number)}</span>,
            },
            { key: "isiUlang", label: `Isi ulang ${bulanDepan.split(" ")[0]}`, numeric: true, render: (v) => <span className="num" style={{ fontWeight: 500 }}>{fmtNum(v as number)}</span> },
          ]}
        />
        <div style={{ background: "var(--surface-muted)", borderRadius: 18, padding: "14px 20px", marginTop: 16, display: "flex", flexWrap: "wrap", gap: "8px 32px", alignItems: "baseline" }}>
          <strong style={{ fontWeight: 500 }}>Total (10 VA)</strong>
          <span className="num">Masuk {fmtNum(totals.masuk)}</span>
          <span className="num">LPJ {fmtNum(totals.lpj)}</span>
          <span className="num">Sisa {fmtNum(totals.sisa)}</span>
          <span className="num">Dikembalikan {fmtNum(totals.dkPositif)}</span>
          <span className="num">Isi ulang {fmtNum(totals.normal)}</span>
        </div>
      </section>

      <p className="footnote">Total dikembalikan hanya menjumlahkan VA bersaldo positif. VA minus (titik merah) tidak mengurangi total. Kolom sisa di bank bisa diklik untuk mengisi hasil rekonsiliasi mutasi bank.</p>

      <section className="card">
        <div className="action-bar">
          <div>
            <div className="k">Total wajib dikembalikan</div>
            <div className="v num">{fmtRp(totals.dkPositif)}</div>
          </div>
          <div className="sep" />
          <div>
            <div className="k">Total isi ulang {bulanDepan} (full saldo normal)</div>
            <div className="v num">{fmtRp(totals.normal)}</div>
          </div>
          <div style={{ flex: 1 }} />
          <Button disabled={month.ditutup} onClick={() => setConfirmOpen(true)}>
            Tutup bulan dan buat pengisian
          </Button>
        </div>
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          title={`Tutup bulan ${namaBulan(month.key)}?`}
          description="Setelah ditutup, angka bulan ini terkunci dan pengisian ulang bulan berikutnya dibuat otomatis."
        >
          <div className="pop-rows" style={{ margin: "8px 0 20px" }}>
            <div className="pop-row"><span className="k">Total wajib dikembalikan</span><span className="num">{fmtRp(totals.dkPositif)}</span></div>
            <div className="pop-row"><span className="k">Total isi ulang {bulanDepan}</span><span className="num">{fmtRp(totals.normal)}</span></div>
            {totals.vaKurang.length > 0 && (
              <div className="pop-row"><span className="k">VA minus (ditutup terpisah)</span><span>{totals.vaKurang.map((v) => v.nama.replace("Konstruksi ", "")).join(", ")}</span></div>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <DialogClose asChild>
              <Button variant="secondary">Batal</Button>
            </DialogClose>
            <Button
              onClick={() => {
                tutupBulan();
                setConfirmOpen(false);
                go("dashboard");
              }}
            >
              Tutup bulan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
