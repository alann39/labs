import type { ReactNode } from "react";
import { AnimatedCounter } from "@/components/arc/animated-counter/animated-counter";

/** Kartu KPI disusun dari AnimatedCounter Arc (format id-ID + awalan Rp).
    MetricCard bawaan Arc tidak mengekspos locale/prefix, jadi label, nilai,
    dan konteks disusun di sini dengan token foundation yang sama. */
export function StatCard({ label, value, context, action }: { label: string; value: number; context?: string; action?: ReactNode }) {
  return (
    <article className="card" style={{ padding: 24 }} aria-label={label}>
      <div className="stat-label">
        <span>{label}</span>
        {action}
      </div>
      <div className="stat-value">
        <AnimatedCounter value={value} prefix="Rp " locale="id-ID" animateOnView />
      </div>
      {context && <div className="stat-ctx">{context}</div>}
    </article>
  );
}

export function StatCell({ label, value, highlight = false, action }: { label: string; value: number; highlight?: boolean; action?: ReactNode }) {
  return (
    <div className={`stat-cell${highlight ? " hl" : ""}`}>
      <div className="stat-label">
        <span>{label}</span>
        {action}
      </div>
      <div className="stat-value" style={{ marginTop: 8 }}>
        <AnimatedCounter value={value} prefix="Rp " locale="id-ID" animateOnView />
      </div>
    </div>
  );
}
