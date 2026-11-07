import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, CheckCircle2, Clock, Download, Flag, Info, Plus } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { SplitButton } from "@/components/arc/split-button/split-button";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Badge } from "@/components/arc/badge/badge";
import { SearchField } from "@/components/arc/search-field/search-field";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/arc/popover/popover";
import { Alert } from "@/components/arc/alert/alert";
import { PageHead } from "../components/PageHead";
import { FollowUpBlock, type FollowUpItem } from "../components/FollowUpBlock";
import { StatCard } from "../components/Stat";
import { GroupedChart, type ChartGroup } from "../components/GroupedChart";
import { bulanSingkat, fmtNum, fmtRp, fmtTglPanjang, fmtTglSingkat, namaBulan } from "../format";
import {
  monthDitutup, monthTotals, useStore, vaStats, vaStatus,
  khususSudahAdaLpj, lpjSudahDiisi, statusPengembalian,
  PENGEMBALIAN_LABEL, VA_STATUS_BADGE, type VA,
} from "../store";
import type { View } from "../App";

/** Badge status per VA versi compact: maks 2 kata + ikon status. */
const STATUS_COMPACT: Record<string, { tone: "success" | "danger" | "warning" | "info" | "neutral"; label: string; Icon: typeof Clock }> = {
  closing: { tone: "success", label: "Sudah closing", Icon: CheckCircle2 },
  siap: { tone: "info", label: "Siap closing", Icon: Flag },
  menunggu: { tone: "warning", label: "Menunggu", Icon: Clock },
  sebagian: { tone: "warning", label: "Sebagian", Icon: Clock },
  kurang: { tone: "danger", label: "Kelebihan LPJ", Icon: AlertTriangle },
};

/** Tombol info (i) di kartu KPI: rincian kartu tampil sebagai popover
    berisi baris label + nilai, menggantikan teks keterangan di bawah angka. */
function InfoRincian({ ariaLabel, rows, note }: { ariaLabel: string; rows: [string, string][]; note?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={ariaLabel} style={{ border: 0, background: "none", cursor: "pointer", color: "var(--text-muted)", display: "grid", placeItems: "center" }}>
          <Info size={16} strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end">
        <div className="pop-rows">
          {rows.map(([k, v]) => (
            <div className="pop-row" key={k}>
              <span>{k}</span>
              <span className="num">{v}</span>
            </div>
          ))}
          {note && <p className="pop-note">{note}</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
    const items: FollowUpItem[] = [];
    const belumKembali = month.vas
      .map((va) => ({ va, s: vaStats(month, va) }))
      .filter(({ va, s }) => s.dk > 0 && statusPengembalian(month, va) !== "diterima")
      .sort((a, b) => b.s.dk - a.s.dk);
    for (const { va, s } of belumKembali) {
      const sebagian = statusPengembalian(month, va) === "sebagian";
      const teksSebagian = sebagian ? `, sudah diterima ${fmtRp(va.pengembalian.totalDiterima)}` : "";
      items.push({
        id: `dk-${va.id}`, jenis: "dk", view: "closing",
        nama: va.nama, nominal: s.dk,
        diterima: sebagian ? va.pengembalian.totalDiterima : undefined,
        teks: `${va.nama}: selisih ${fmtRp(s.dk)} belum diterima${teksSebagian}.`,
      });
    }
    // LPJ Closing TIDAK dihitung perlu diisi ulang — terisi otomatis dari isi awal
    // bulan berikutnya (saldo normal penuh), jadi dikecualikan dari agregat ini.
    const lpjBelum = month.lpj.filter((r) => r.jenis === "reguler" && !r.lpjClosing && !lpjSudahDiisi(month, r.id));
    if (lpjBelum.length > 0) {
      const tertua = lpjBelum.reduce((a, b) => (a.tanggal <= b.tanggal ? a : b));
      items.push({
        id: "lpj-belum", jenis: "lpj", view: "masuk",
        nama: "Pengisian kembali LPJ", jumlah: lpjBelum.length,
        kanan: `Tertua ${tertua.no} · ${fmtTglSingkat(tertua.tanggal)}`,
        teks: `${lpjBelum.length} LPJ reguler belum diisi kembali, tertua ${tertua.no} tanggal ${fmtTglPanjang(tertua.tanggal)}.`,
      });
    }
    for (const r of month.masuk) {
      if (r.jenis === "khusus" && !khususSudahAdaLpj(month, r.id)) {
        const va = month.vas.find((v) => v.id === r.vaId);
        items.push({
          id: `khusus-${r.id}`, jenis: "khusus", view: "masuk",
          nama: va?.nama ?? r.vaId, nominal: r.nominal, tanggal: r.tanggal,
          teks: `${va?.nama ?? r.vaId}: pengisian khusus ${fmtRp(r.nominal)} tanggal ${fmtTglPanjang(r.tanggal)} belum ada LPJ khusus.`,
        });
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
        <SplitButton
          label="+ Input"
          onClick={() => go("lpj")}
          actions={[
            { label: "Input LPJ", icon: <Plus size={16} strokeWidth={1.75} />, onSelect: () => go("lpj") },
            { label: "Input dana masuk", icon: <Plus size={16} strokeWidth={1.75} />, onSelect: () => go("masuk") },
          ]}
        />
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
          action={
            <InfoRincian
              ariaLabel="Rincian wajib dikembalikan"
              rows={[
                ["Sudah diterima", fmtRp(totals.diterima)],
                ["Belum diterima", fmtRp(totals.belumDiterima)],
              ]}
              note="Total wajib dikembalikan hanya menjumlahkan VA berselisih positif. VA minus menutup kekurangannya secara terpisah, tidak mengurangi total."
            />
          }
        />
        <StatCard
          label="Total LPJ disetujui"
          value={totals.lpj}
          action={
            <InfoRincian
              ariaLabel="Rincian total LPJ disetujui"
              rows={[
                ["Reguler", fmtRp(totals.lpjReguler)],
                ["Khusus", fmtRp(totals.lpjKhusus)],
              ]}
            />
          }
        />
        <StatCard
          label="Total dana masuk"
          value={totals.masuk}
          action={
            <InfoRincian
              ariaLabel="Rincian total dana masuk"
              rows={[
                ["Awal", fmtRp(totals.masukAwal)],
                ["Kembali", fmtRp(totals.masukKembali)],
                ["Khusus", fmtRp(totals.masukKhusus)],
              ]}
            />
          }
        />
        <StatCard
          label="Sisa saldo di bank"
          value={totals.sisa}
          action={
            <InfoRincian
              ariaLabel="Rincian sisa saldo di bank"
              rows={[["Sudah diinput", `${sisaTerinput} dari ${month.vas.length} VA`]]}
            />
          }
        />
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
              render: (v, row) => {
                const normal = (row as { normal: number }).normal;
                return (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span>{v as string}</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button type="button" aria-label={`Info saldo normal ${v as string}`} style={{ border: 0, background: "none", cursor: "pointer", color: "var(--text-muted)", display: "grid", placeItems: "center", padding: 2 }}>
                          <Info size={14} strokeWidth={1.75} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="bottom" align="start">
                        <div className="pop-rows">
                          <div className="pop-row">
                            <span>Saldo normal</span>
                            <span className="num">{fmtRp(normal)}</span>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </span>
                );
              },
            },
            { key: "lpj", label: "Total LPJ", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
            { key: "masuk", label: "Total dana masuk", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
            { key: "sisa", label: "Sisa di bank", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
            { key: "selisih", label: "Selisih", numeric: true, render: (v) => <span className="num">{fmtNum(v as number)}</span> },
            {
              key: "status", label: "Status",
              render: (v) => {
                const b = STATUS_COMPACT[v as string] ?? STATUS_COMPACT.menunggu;
                return <Badge size="sm" tone={b.tone} icon={<b.Icon size={12} strokeWidth={1.75} />}>{b.label}</Badge>;
              },
            },
          ]}
        />
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <Button variant="ghost" onClick={() => openLedger(month.vas[0].id)}>
            Lihat ledger VA
          </Button>
        </div>
        <p className="footnote" style={{ marginTop: 8 }}>{progress.closing} dari {month.vas.length} VA sudah closing bulan ini.</p>
      </section>

      <FollowUpBlock items={tindakLanjut} onNavigate={go} />
    </>
  );
}
