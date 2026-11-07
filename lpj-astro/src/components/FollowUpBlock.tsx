import { ChevronRight, CircleCheck, FileClock, HandCoins, Unlink } from "lucide-react";
import { Badge } from "@/components/arc/badge/badge";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { fmtNum, fmtRp, fmtTglSingkat } from "../format";
import type { View } from "../App";
import styles from "./FollowUpBlock.module.css";

/** Block "Perlu tindak lanjut": recreate lokal pola block Arc
    `notification-center` (components.md, App blocks) mengikuti skill Arc:
    panel mandiri dengan header ber-divider dan badge jumlah item, daftar
    baris full-bleed ber-divider hairline, tiap baris berisi tile ikon
    bertone, teks utama + badge status, nilai/meta di kanan, dan chevron.
    Ditulis ulang dengan token foundation proyek; bukan salinan aset Arc.
    `teks` mempertahankan kalimat lengkap untuk title/aria tiap baris. */
export type FollowUpItem = {
  id: string;
  jenis: "dk" | "lpj" | "khusus";
  view: View;
  nama: string;
  nominal?: number;
  diterima?: number;
  jumlah?: number;
  kanan?: string;
  tanggal?: string;
  teks: string;
};

const ITEM_ICON = {
  dk: { Icon: HandCoins, tile: "amber" },
  lpj: { Icon: FileClock, tile: "neutral" },
  khusus: { Icon: Unlink, tile: "violet" },
} as const;

export function FollowUpBlock({ items, onNavigate }: { items: FollowUpItem[]; onNavigate: (v: View) => void }) {
  return (
    <section className={styles.block} aria-labelledby="followup-title" data-block="follow-up">
      <header className={styles.head}>
        <div className={styles.headText}>
          <h2 id="followup-title" className={styles.title}>Perlu tindak lanjut</h2>
          <p className={styles.sub}>Selisih belum diterima dan catatan belum tertaut</p>
        </div>
        {items.length > 0 && (
          <Badge tone="warning" pill aria-label={`${items.length} item perlu tindak lanjut`}>
            {items.length}
          </Badge>
        )}
      </header>
      {items.length === 0 ? (
        <div className={styles.body}>
          <EmptyState
            icon={<CircleCheck size={24} strokeWidth={1.75} />}
            title="Tidak ada tindak lanjut"
            description="Semua selisih sudah diterima dan semua catatan bulan ini sudah tertaut."
          />
        </div>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => {
            const { Icon, tile } = ITEM_ICON[item.jenis];
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.row}
                  onClick={() => onNavigate(item.view)}
                  title={item.teks}
                  aria-label={item.teks}
                >
                  <span className={`${styles.tile} ${styles[tile]}`} aria-hidden="true">
                    <Icon size={15} strokeWidth={1.75} />
                  </span>
                  <span className={styles.main}>
                    <span className={styles.name}>{item.nama}</span>
                    {item.tanggal && <span className={styles.meta}>{fmtTglSingkat(item.tanggal)}</span>}
                    {item.jenis === "dk" && (
                      <>
                        <Badge size="sm" tone="warning">Selisih belum diterima</Badge>
                        {item.diterima !== undefined && (
                          <Badge size="sm" tone="success">Diterima {fmtRp(item.diterima)}</Badge>
                        )}
                      </>
                    )}
                    {item.jenis === "lpj" && (
                      <Badge size="sm" tone="neutral">{item.jumlah} LPJ belum diisi</Badge>
                    )}
                    {item.jenis === "khusus" && (
                      <>
                        <Badge size="sm" color="violet">Pengisian khusus</Badge>
                        <Badge size="sm" tone="neutral">Belum ada LPJ</Badge>
                      </>
                    )}
                  </span>
                  {item.nominal !== undefined && <span className={`num ${styles.amount}`}>{fmtNum(item.nominal)}</span>}
                  {item.kanan && <span className={styles.meta}>{item.kanan}</span>}
                  <ChevronRight size={16} strokeWidth={1.75} className={styles.chev} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
