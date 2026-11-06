import { fmtJuta } from "../format";

export interface ChartGroup { label: string; masuk: number; lpj: number }

/** Grafik batang berkelompok (dana masuk vs LPJ per grup VA).
    BarChart Arc hanya melayani satu seri, jadi perbandingan dua seri ini
    digambar dengan token foundation yang sama: aksen untuk seri yang
    ditekankan, foreground netral untuk pembandingnya. */
export function GroupedChart({ groups }: { groups: ChartGroup[] }) {
  const max = Math.max(...groups.map((g) => Math.max(g.masuk, g.lpj)), 1);
  const stepJt = max / 1e6 > 400 ? 200 : 100;
  const topJt = Math.ceil(max / 1e6 / stepJt) * stepJt;
  const H = 120;
  const lines: number[] = [];
  for (let v = stepJt; v < topJt; v += stepJt) lines.push(v);

  const Bar = ({ value, color, dark }: { value: number; color: string; dark?: boolean }) => {
    const h = Math.max(3, (value / (topJt * 1e6)) * H);
    return (
      <div className="chart-bar" style={{ height: h, background: color }}>
        <span className="chart-bar-val num" style={{ color: dark ? "var(--foreground)" : "var(--accent)" }}>
          {fmtJuta(value)}
        </span>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div className="chart-legend">
          <span><span className="legend-dot" style={{ background: "var(--accent)" }} />Dana masuk</span>
          <span><span className="legend-dot" style={{ background: "var(--foreground)" }} />LPJ disetujui</span>
        </div>
      </div>
      <div className="chart-plot" role="img" aria-label="Grafik dana masuk versus LPJ per grup VA">
        {lines.map((v) => (
          <div key={v} className="chart-grid" style={{ bottom: (v / topJt) * H }}>
            <span className="num">{v}</span>
          </div>
        ))}
        <div className="chart-groups" style={{ height: H + 28 }}>
          {groups.map((g) => (
            <div key={g.label} className="chart-group">
              <div className="chart-bars">
                <Bar value={g.masuk} color="var(--accent)" />
                <Bar value={g.lpj} color="var(--foreground)" dark />
              </div>
            </div>
          ))}
        </div>
        <div className="chart-axis" />
        <div className="chart-groups">
          {groups.map((g) => (
            <div key={g.label} className="chart-group">
              <div className="chart-group-label">{g.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
