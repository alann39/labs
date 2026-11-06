import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";

export function PageHead({ title, sub, onHelp, children }: { title: string; sub: string; onHelp?: () => void; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p className="sub">{sub}</p>
      </div>
      <div className="head-actions">
        {children}
        {onHelp && (
          <button type="button" className="icon-btn" aria-label="Bantuan halaman ini" onClick={onHelp}>
            <CircleHelp size={24} strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  );
}
