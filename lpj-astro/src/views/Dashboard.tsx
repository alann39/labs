import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Info, Plus } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Badge } from "@/components/arc/badge/badge";
import { SearchField } from "@/components/arc/search-field/search-field";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/arc/popover/popover";
import { Alert } from "@/components/arc/alert/alert";
import { PageHead } from "../components/PageHead";
import { StatCard } from "../components/Stat";
import { GroupedChart, type ChartGroup } from "../components/GroupedChart";
import { bulanSingkat, fmtNum, namaBulan } from "../format";
import { monthTotals, useStore, vaStats, vaStatus, type VA } from "../store";
import type { View } from "../App";

const STATUS_BADGE = {
  closing: { tone: "success" as const, label: "Sudah closing" },
  proses: { tone: "warning" as const, label: "Dalam proses" },
  kurang: { tone: "danger" as const, label: "Kelebihan LPJ" },
};

export function Dashboard({ go, openLedger, onHelp }: { go: (v: View) => void; openLedger: (vaId: string) => void; onHelp: () => void }) {
  const { state, month, setActiveMonth } = useStore();
  const [query, setQuery] = useState("");
  const totals = monthTotals(month);

  const groups: ChartGroup[] = useMemo(() => {
    const g = (pred: (v: VA) => boolean, label: string) => {
      let masuk = 0, lpj = 0;
      for (const va of month.vas) if (pred(va)) { const s = vaStats(month, va); masuk += s.masuk; lpj += s.lpj; }
      return { label, masuk, lpj };
    };
    return [
      g((v) => v.id === "ga", "General Affair"),
      g((v) => v.id === "p1", "Procurement 001"),
      g((v) => v.id === "p2", "Procurement 002"),
      g((v) => v.id === "fms", "FMS"),
      g((v) => v.grup === "Konstruksi", "Konstruksi (6 proyek)"),
    ];
  }, [month]);

  const rows = month.vas
    .map((va) => {
      const s = vaStats(month, va);
      return { id: va.id, nama: va.nama, nomor: va.nomor, normal: va.saldoNormal, lpj: s.lpj, sisa: va.sisaBank, status: vaStatus(month, va) };
    })
    .filter((r) => r.nama.toLowerCase().includes(query.toLowerCase()) || r.nomor.includes(query));

  const terbesar = month.vas.reduce((a, b) => (b.sisaBank > a.sisaBank ? b : a), month.vas[0]);
  const jumlahPositif = month.vas.filter((va) => vaStats(month, va).dk > 0).length;
  const jumlahClosing = month.vas.filter((va) => vaStatus(month, va) === "closing").length;

  const ekspor = () => {
    const wb = XLSX.utils.book_new();
    const statusSheet = month.vas.map((va) => {
      const s = vaStats(month, va);
      return { "VA / departemen": va.nama, "No. VA": va.nomor, "Saldo normal": va.saldoNormal, "LPJ bulan ini": s.lpj, "Sisa di bank": va.sisaBank, "Status closing": STATUS_BADGE[vaStatus(month, va)].label };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(statusSheet), "Status per VA");
    const rekapSheet = month.vas.map((va) => {
      const s = vaStats(month, va);
      return { "VA / departemen": va.nama, "Saldo normal": va.saldoNormal, "Total masuk": s.masuk, "Total LPJ": s.lpj, "Sisa di bank": va.sisaBank, "Dana dikembalikan": s.dk, "Isi ulang bulan depan": va.saldoNormal };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rekapSheet), "Rekap closing");
    XLSX.writeFile(wb, `rekap-lpj-${month.key}.xlsx`);
  };

  return (
    <>
      <PageHead
        title="Dashboard rekap LPJ"
        sub={`Ringkasan kas kecil semua VA · ${namaBulan(month.key)}`}
        onHelp={onHelp}
      >
        <SegmentedControl
          label="Pilih bulan"
          options={state.months.map((m) => ({ value: m.key, label: bulanSingkat(m.key) }))}
          value={month.key}
          onValueChange={setActiveMonth}
        />
        <Button onClick={() => go("form")}>
          <Plus size={16} strokeWidth={1.75} /> Buat proses LPJ
        </Button>
      </PageHead>

      {month.ditutup && (
        <Alert tone="success" title={`Bulan ${namaBulan(month.key)} sudah ditutup`}>
          Angka di halaman ini adalah hasil akhir closing. Isi ulang bulan berikutnya sudah dibuat otomatis sebesar full saldo normal tiap VA.
        </Alert>
      )}

      <div className="grid-metrics">
        <StatCard label="Total LPJ disetujui" value={totals.lpj} context={`10 VA · ${namaBulan(month.key)}`} />
        <StatCard label="Total dana masuk" value={totals.masuk} context="termasuk isi ulang awal bulan" />
        <StatCard label="Sisa saldo di bank" value={totals.sisa} context={`terbesar ${terbesar.nama.replace("Konstruksi ", "")} · ${fmtNum(terbesar.sisaBank)}`} />
        <StatCard
          label="Wajib dikembalikan"
          value={totals.dkPositif}
          context={`dari ${jumlahPositif} VA bersaldo positif`}
          action={
            <Popover>
              <PopoverTrigger asChild>
                <button type="button" aria-label="Penjelasan dana dikembalikan" style={{ border: 0, background: "none", cursor: "pointer", color: "var(--text-muted)", display: "grid", placeItems: "center" }}>
                  <Info size={16} strokeWidth={1.75} />
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="end">
                <div className="pop-rows">
                  <div className="pop-row total" style={{ borderTop: 0, paddingTop: 0 }}>
                    <span>Dana dikembalikan</span>
                    <span className="num">Total masuk − total LPJ − sisa di bank</span>
                  </div>
                  <p className="pop-note">Total wajib dikembalikan hanya menjumlahkan VA bersaldo positif. VA minus menutup kekurangannya secara terpisah, tidak mengurangi total.</p>
                </div>
              </PopoverContent>
            </Popover>
          }
        />
      </div>

      <section className="card">
        <div className="card-title">Realisasi dana masuk vs LPJ</div>
        <p className="card-sub">Per grup VA · nilai dalam Rp juta, skala linear</p>
        <GroupedChart groups={groups} />
      </section>

      <section className="card">
        <div className="toolbar" style={{ alignItems: "flex-end", marginBottom: 16 }}>
          <div className="card-title">Status per VA</div>
          <div className="spacer" />
          <div style={{ width: 272 }}>
            <SearchField label="Cari VA" placeholder="Cari VA..." value={query} onValueChange={setQuery} />
          </div>
          <Button variant="secondary" onClick={ekspor}>
            <Download size={16} strokeWidth={1.75} /> Ekspor Excel
          </Button>
        </div>
        <SortableDataTable
          caption="Status per VA"
          rows={rows}
          rowKey="id"
          defaultSort={{ key: "nama", direction: "asc" }}
          emptyMessage="Tidak ada VA yang cocok dengan pencarian."
          columns={[
            { key: "nama", label: "VA / departemen" },
            { key: "nomor", label: "No. VA" },
            { key: "normal", label: "Saldo normal", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
            { key: "lpj", label: "LPJ bulan ini", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
            { key: "sisa", label: "Sisa di bank", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
            { key: "status", label: "Status closing", render: (v) => <Badge tone={STATUS_BADGE[v as keyof typeof STATUS_BADGE].tone}>{STATUS_BADGE[v as keyof typeof STATUS_BADGE].label}</Badge> },
          ]}
        />
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Button variant="ghost" onClick={() => openLedger(month.vas[0].id)}>
            Lihat semua 10 VA di Ledger VA
          </Button>
        </div>
        <p className="footnote" style={{ marginTop: 8 }}>{jumlahClosing} dari 10 VA sudah closing bulan ini.</p>
      </section>
    </>
  );
}
