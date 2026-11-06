import { useMemo, useState } from "react";
import { Info, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Select } from "@/components/arc/select/select";
import SegmentedControl from "@/components/arc/segmented-control/segmented-control";
import { SortableDataTable } from "@/components/arc/sortable-data-table/sortable-data-table";
import { Badge } from "@/components/arc/badge/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/arc/popover/popover";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { PageHead } from "../components/PageHead";
import { StatCell } from "../components/Stat";
import { fmtNum, fmtRp, fmtTgl, namaBulan } from "../format";
import { STAGE_ACTION, useStore, vaStats, type Stage } from "../store";
import type { View } from "../App";

type Entry = {
  id: string;
  tanggal: string;
  jenis: "Pengisian" | "Proses LPJ";
  keterangan: string;
  masuk: number | null;
  lpj: number | null;
  status: string;
  statusTone: "success" | "warning" | "neutral";
  prosesId?: string;
  stage?: Stage;
};

export function Ledger({ vaId, setVaId, go, onHelp }: { vaId: string; setVaId: (id: string) => void; go: (v: View) => void; onHelp: () => void }) {
  const { month, advanceProses } = useStore();
  const [filter, setFilter] = useState("semua");
  const va = month.vas.find((v) => v.id === vaId) ?? month.vas[0];
  const s = vaStats(month, va);

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [{
      id: `open-${va.id}`, tanggal: `${month.key}-01`, jenis: "Pengisian",
      keterangan: `Isi ulang saldo normal ${namaBulan(month.key)}`, masuk: va.saldoNormal, lpj: null,
      status: "Selesai", statusTone: "success",
    }];
    const prosesVa = month.proses.filter((p) => p.vaId === va.id).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
    for (const p of prosesVa) {
      const statusMap: Record<Stage, { t: string; tone: Entry["statusTone"] }> = {
        pengajuan: { t: "Menunggu pemeriksaan", tone: "warning" },
        pemeriksaan: { t: "Dalam pemeriksaan", tone: "warning" },
        disetujui: { t: "Menunggu pengisian", tone: "warning" },
        pengisian: { t: `Diisi kembali ${p.tanggalIsi ? fmtTgl(p.tanggalIsi) : ""}`, tone: "success" },
        selesai: { t: "Selesai", tone: "success" },
      };
      list.push({
        id: p.id, tanggal: p.tanggal, jenis: "Proses LPJ",
        keterangan: `${p.no} · ${p.keterangan}`, masuk: null, lpj: p.nominal,
        status: statusMap[p.stage].t, statusTone: statusMap[p.stage].tone, prosesId: p.id, stage: p.stage,
      });
      if ((p.stage === "pengisian" || p.stage === "selesai") && p.tanggalIsi) {
        list.push({
          id: `${p.id}-isi`, tanggal: p.tanggalIsi, jenis: "Pengisian",
          keterangan: `Pengisian kembali ${p.no}`, masuk: p.nominal, lpj: null,
          status: "Selesai", statusTone: "success",
        });
      }
    }
    return list.sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  }, [month, va]);

  const filtered = entries.filter((e) =>
    filter === "semua" ? true : filter === "proses" ? e.jenis === "Proses LPJ" : e.jenis === "Pengisian",
  );

  return (
    <>
      <PageHead title={va.nama} sub={`Ledger VA · Saldo normal ${fmtRp(va.saldoNormal)}`} onHelp={onHelp}>
        <div style={{ width: 264 }}>
          <Select
            label="Virtual account"
            value={va.id}
            onValueChange={setVaId}
            options={month.vas.map((v) => ({ value: v.id, label: `${v.nama} · ${v.nomor}` }))}
          />
        </div>
        <Button onClick={() => go("form")}>
          <Plus size={16} strokeWidth={1.75} /> Buat proses LPJ
        </Button>
      </PageHead>

      <section className="card">
        <div className="stat-strip">
          <StatCell label="Total dana masuk" value={s.masuk} />
          <StatCell label="Jumlah LPJ disetujui" value={s.lpj} />
          <StatCell label="Sisa saldo di bank" value={va.sisaBank} />
          <StatCell
            label="Dana dikembalikan"
            value={s.dk}
            highlight
            action={
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" aria-label="Rumus dana dikembalikan" style={{ border: 0, background: "none", cursor: "pointer", color: "var(--text-muted)", display: "grid", placeItems: "center" }}>
                    <Info size={16} strokeWidth={1.75} />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="end">
                  <div className="pop-rows">
                    <div className="pop-row"><span className="k">Total dana masuk</span><span className="num">{fmtRp(s.masuk)}</span></div>
                    <div className="pop-row"><span className="k">Jumlah LPJ disetujui</span><span className="num">− {fmtRp(s.lpj)}</span></div>
                    <div className="pop-row"><span className="k">Sisa saldo di bank</span><span className="num">− {fmtRp(va.sisaBank)}</span></div>
                    <div className="pop-row total"><span>Dana dikembalikan</span><span className="num" style={{ color: "var(--accent)" }}>{fmtRp(s.dk)}</span></div>
                    <p className="pop-note">Hasil minus tidak mengurangi total. VA minus menutup kekurangannya secara terpisah.</p>
                  </div>
                </PopoverContent>
              </Popover>
            }
          />
        </div>
      </section>

      <div className="toolbar">
        <h2 style={{ fontSize: 16 }}>Transaksi</h2>
        <div className="spacer" />
        <SegmentedControl
          label="Filter jenis transaksi"
          options={[
            { value: "semua", label: "Semua" },
            { value: "proses", label: "Proses LPJ" },
            { value: "pengisian", label: "Pengisian" },
          ]}
          value={filter}
          onValueChange={setFilter}
        />
      </div>

      <section className="card">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Wallet size={24} strokeWidth={1.75} />}
            title="Belum ada transaksi"
            description="Transaksi VA ini muncul setelah proses LPJ pertama dibuat."
            action={<Button variant="secondary" onClick={() => go("form")}>Buat proses LPJ</Button>}
          />
        ) : (
          <SortableDataTable
            caption={`Transaksi ${va.nama}`}
            rows={filtered}
            rowKey="id"
            defaultSort={{ key: "tanggal", direction: "asc" }}
            columns={[
              { key: "tanggal", label: "Tanggal", render: (v) => fmtTgl(v as string) },
              { key: "jenis", label: "Jenis", render: (v) => <Badge tone={v === "Proses LPJ" ? "warning" : "info"}>{v as string}</Badge> },
              { key: "keterangan", label: "Keterangan" },
              { key: "masuk", label: "Masuk (Rp)", numeric: true, render: (v) => (v == null ? "–" : <span className="num">{fmtNum(v as number)}</span>) },
              { key: "lpj", label: "LPJ (Rp)", numeric: true, render: (v) => (v == null ? "–" : <span className="num">{fmtNum(v as number)}</span>) },
              {
                key: "status", label: "Status proses",
                render: (_v, row) => {
                  const e = row as unknown as Entry;
                  const action = e.stage ? STAGE_ACTION[e.stage] : undefined;
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <span style={{ color: e.statusTone === "success" ? "var(--success)" : e.statusTone === "warning" ? "var(--warning)" : "var(--text-secondary)", fontSize: 12, fontWeight: 500 }}>
                        {e.status}
                      </span>
                      {action && e.prosesId && !month.ditutup && (
                        <Button size="sm" variant="secondary" onClick={() => advanceProses(e.prosesId!)}>
                          {action}
                        </Button>
                      )}
                    </span>
                  );
                },
              },
            ]}
          />
        )}
      </section>
      <p className="footnote">Setiap proses LPJ memuat tahap pengisian kembalinya sendiri, jadi dana masuk selalu tertaut ke LPJ yang dimaksud.</p>
    </>
  );
}
