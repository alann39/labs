import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { CircleCheck, Download, Info, Plus } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Badge } from "@/components/arc/badge/badge";
import { SearchField } from "@/components/arc/search-field/search-field";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/arc/popover/popover";
import { Alert } from "@/components/arc/alert/alert";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { PageHead } from "../components/PageHead";
import { StatCard } from "../components/Stat";
import { GroupedChart, type ChartGroup } from "../components/GroupedChart";
import { bulanSingkat, fmtNum, fmtRp, fmtTglPanjang, namaBulan } from "../format";
import {
  monthDitutup, monthTotals, useStore, vaStats, vaStatus,
  khususSudahAdaLpj, lpjSudahDiisi, statusPengembalian,
  PENGEMBALIAN_LABEL, VA_STATUS_BADGE, type VA,
} from "../store";
import type { View } from "../App";

export function Dashboard({ go, openLedger, onHelp }: { go: (v: View) => void; openLedger: (vaId: string) => void; onHelp: () => void }) {
  const { state, month, setActiveMonth } = useStore();
  const [query, setQuery] = useState("");
  const totals = monthTotals(month);
  const ditutup = monthDitutup(month);

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
      return {
        id: va.id, nama: va.nama, normal: va.saldoNormal, lpj: s.lpj, masuk: s.masuk,
        sisa: va.sisaBank, selisih: s.dk, status: vaStatus(month, va),
      };
    })
    .filter((r) => r.nama.toLowerCase().includes(query.toLowerCase()));

  const progress = useMemo(() => {
    const c = { closing: 0, siap: 0, menunggu: 0, kurang: 0 };
    for (const va of month.vas) {
      const st = vaStatus(month, va);
      if (st === "closing") c.closing += 1;
      else if (st === "siap") c.siap += 1;
      else if (st === "kurang") c.kurang += 1;
      else c.menunggu += 1;
    }
    return c;
  }, [month]);

  const tindakLanjut = useMemo(() => {
    const items: Array<{ id: string; teks: string }> = [];
    const belumKembali = month.vas
      .map((va) => ({ va, s: vaStats(month, va) }))
      .filter(({ va, s }) => s.dk > 0 && statusPengembalian(month, va) !== "diterima")
      .sort((a, b) => b.s.dk - a.s.dk);
    for (const { va, s } of belumKembali) {
      const sebagian = statusPengembalian(month, va) === "sebagian"
        ? `, sudah diterima ${fmtRp(va.pengembalian.totalDiterima)}`
        : "";
      items.push({ id: `dk-${va.id}`, teks: `${va.nama}: selisih ${fmtRp(s.dk)} belum diterima${sebagian}.` });
    }
    const lpjBelum = month.lpj.filter((r) => r.jenis === "reguler" && !lpjSudahDiisi(month, r.id));
    if (lpjBelum.length > 0) {
      const tertua = lpjBelum.reduce((a, b) => (a.tanggal <= b.tanggal ? a : b));
      items.push({ id: "lpj-belum", teks: `${lpjBelum.length} LPJ reguler belum diisi kembali, tertua ${tertua.no} tanggal ${fmtTglPanjang(tertua.tanggal)}.` });
    }
    for (const r of month.masuk) {
      if (r.jenis === "khusus" && !khususSudahAdaLpj(month, r.id)) {
        const va = month.vas.find((v) => v.id === r.vaId);
        items.push({ id: `khusus-${r.id}`, teks: `${va?.nama ?? r.vaId}: pengisian khusus ${fmtRp(r.nominal)} tanggal ${fmtTglPanjang(r.tanggal)} belum ada LPJ khusus.` });
      }
    }
    return items;
  }, [month]);

  const ekspor = () => {
    const wb = XLSX.utils.book_new();
    const statusSheet = month.vas.map((va) => {
      const s = vaStats(month, va);
      return {
        "VA / departemen": va.nama, "Saldo normal": va.saldoNormal,
        "LPJ bulan ini": s.lpj, "Dana masuk": s.masuk, "Sisa di bank": va.sisaBank,
        "Selisih": s.dk, "Status pengembalian": PENGEMBALIAN_LABEL[statusPengembalian(month, va)],
        "Status": VA_STATUS_BADGE[vaStatus(month, va)].label,
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(statusSheet), "Status per VA");
    const rekapSheet = month.vas.map((va) => {
      const s = vaStats(month, va);
      return {
        "VA / departemen": va.nama, "Saldo normal": va.saldoNormal,
        "Total masuk": s.masuk, "Isi awal": s.masukAwal, "Pengisian kembali": s.masukKembali, "Pengisian khusus": s.masukKhusus,
        "Total LPJ": s.lpj, "LPJ reguler": s.lpjReguler, "LPJ khusus": s.lpjKhusus,
        "Sisa di bank": va.sisaBank, "Selisih (dana dikembalikan)": s.dk,
        "Pengembalian diterima": va.pengembalian.totalDiterima,
        "Status pengembalian": PENGEMBALIAN_LABEL[statusPengembalian(month, va)],
        "Closing selesai": va.closingSelesai ? "Ya" : "Belum",
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rekapSheet), "Rekap closing");
    XLSX.writeFile(wb, `rekap-lpj-${month.key}.xlsx`);
  };

  const sisaTerinput = month.vas.filter((v) => v.sisaDiinput).length;

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
        <Button variant="secondary" onClick={() => go("masuk")}>
          <Plus size={16} strokeWidth={1.75} /> Input dana masuk
        </Button>
        <Button onClick={() => go("lpj")}>
          <Plus size={16} strokeWidth={1.75} /> Input LPJ
        </Button>
      </PageHead>

      {ditutup && (
        <Alert tone="success" title={`Bulan ${namaBulan(month.key)} sudah ditutup`}>
          Semua VA sudah closing. Angka di halaman ini adalah hasil akhir closing bulan ini.
        </Alert>
      )}

      <div className="grid-metrics">
        <StatCard
          label="Wajib dikembalikan"
          value={totals.dkPositif}
          context={`Sudah diterima Rp ${fmtNum(totals.diterima)} · belum diterima Rp ${fmtNum(totals.belumDiterima)}`}
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
                    <span>Selisih per VA</span>
                    <span className="num">Total masuk − total LPJ − sisa di bank</span>
                  </div>
                  <p className="pop-note">Total wajib dikembalikan hanya menjumlahkan VA berselisih positif. VA minus menutup kekurangannya secara terpisah, tidak mengurangi total.</p>
                </div>
              </PopoverContent>
            </Popover>
          }
        />
        <StatCard label="Total LPJ disetujui" value={totals.lpj} context={`Reguler Rp ${fmtNum(totals.lpjReguler)} · khusus Rp ${fmtNum(totals.lpjKhusus)}`} />
        <StatCard label="Total dana masuk" value={totals.masuk} context={`Awal Rp ${fmtNum(totals.masukAwal)} · kembali Rp ${fmtNum(totals.masukKembali)} · khusus Rp ${fmtNum(totals.masukKhusus)}`} />
        <StatCard label="Sisa saldo di bank" value={totals.sisa} context={`Sisa sudah diinput untuk ${sisaTerinput} dari ${month.vas.length} VA`} />
      </div>

      <section className="card">
        <div className="card-title">Progress closing</div>
        <p className="card-sub">Status closing per VA untuk {namaBulan(month.key)}</p>
        <div className="progress-grid">
          {[
            ["Sudah closing", progress.closing],
            ["Siap closing", progress.siap],
            ["Menunggu pengembalian", progress.menunggu],
            ["Kelebihan LPJ", progress.kurang],
          ].map(([label, n]) => (
            <div key={label as string} className="progress-cell">
              <div className="num progress-value">{n as number}</div>
              <div className="progress-label">{label as string}</div>
            </div>
          ))}
        </div>
      </section>

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
            {
              key: "nama", label: "VA",
              render: (v, row) => (
                <span>
                  <span>{v as string}</span>
                  <span className="cell-sub">Saldo normal {fmtRp((row as { normal: number }).normal)}</span>
                </span>
              ),
            },
            { key: "lpj", label: "Total LPJ", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
            { key: "masuk", label: "Total dana masuk", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
            { key: "sisa", label: "Sisa di bank", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
            { key: "selisih", label: "Selisih", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
            { key: "status", label: "Status", render: (v) => { const b = VA_STATUS_BADGE[v as keyof typeof VA_STATUS_BADGE]; return <Badge tone={b.tone}>{b.label}</Badge>; } },
          ]}
        />
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Button variant="ghost" onClick={() => openLedger(month.vas[0].id)}>
            Lihat ledger VA
          </Button>
        </div>
        <p className="footnote" style={{ marginTop: 8 }}>{progress.closing} dari {month.vas.length} VA sudah closing bulan ini.</p>
      </section>

      <section className="card">
        <div className="card-title">Perlu tindak lanjut</div>
        <p className="card-sub">Selisih yang belum diterima dan catatan yang belum tertaut</p>
        {tindakLanjut.length === 0 ? (
          <div style={{ marginTop: 16 }}>
            <EmptyState
              icon={<CircleCheck size={24} strokeWidth={1.75} />}
              title="Tidak ada tindak lanjut"
              description="Semua selisih sudah diterima dan semua catatan bulan ini sudah tertaut."
            />
          </div>
        ) : (
          <ul className="follow-list">
            {tindakLanjut.map((item) => (
              <li key={item.id}>{item.teks}</li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
