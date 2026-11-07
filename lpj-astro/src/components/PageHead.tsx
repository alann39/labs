import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/arc/button/button";

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
          <Button type="button" variant="secondary" size="md" className="btn-icon-lg" aria-label="Bantuan halaman ini" onClick={onHelp}>
            <CircleHelp size={24} strokeWidth={1.75} />
          </Button>
        )}
      </div>
    </div>
  );
}
