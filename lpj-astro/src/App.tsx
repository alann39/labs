import "@/components/arc/foundation.css";
import "./index.css";
import { StrictMode, useEffect, useState } from "react";
import { CircleCheck, Database, LayoutGrid, List, LogOut, Moon, Sun } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent, DialogClose } from "@/components/arc/dialog/dialog";
import { StoreProvider, useStore, vaStatus } from "./store";
import { AUTH_KEY, LoginGate } from "./components/LoginGate";
import { namaBulan } from "./format";
import { Dashboard } from "./views/Dashboard";
import { Ledger } from "./views/Ledger";
import { Closing } from "./views/Closing";
import { ProsesForm } from "./views/ProsesForm";
import { MasterVA } from "./views/MasterVA";

export type View = "dashboard" | "ledger" | "closing" | "form" | "master";

const NAV: Array<{ key: View; label: string; icon: typeof LayoutGrid }> = [
  { key: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { key: "ledger", label: "Ledger VA", icon: List },
  { key: "closing", label: "Closing bulanan", icon: CircleCheck },
  { key: "master", label: "Master VA", icon: Database },
];

const HELP: Record<View, { title: string; steps?: Array<{ t: string; d: string }>; text?: string }> = {
  dashboard: {
    title: "Cara membaca dashboard",
    text: "Semua angka dihitung langsung dari proses LPJ bulan aktif. Dana masuk adalah isi ulang awal bulan (full saldo normal) ditambah pengisian kembali dari proses yang sudah masuk tahap pengisian. Ganti bulan lewat pemilih di kanan atas untuk melihat bulan yang sudah ditutup.",
  },
  ledger: {
    title: "Cara kerja ledger VA",
    text: "Setiap proses LPJ tampil sebagai satu baris. Dana masuknya tidak diinput terpisah: saat proses mencapai tahap pengisian kembali, baris pengisian muncul otomatis sebesar nominal LPJ yang disetujui. Gunakan tombol aksi di kolom status untuk memajukan tahap proses.",
  },
  closing: {
    title: "Cara kerja closing bulanan",
    steps: [
      { t: "Cek saldo bank", d: "Masukkan sisa saldo di bank tiap VA, hasil rekonsiliasi dengan mutasi bank." },
      { t: "Hitung dana dikembalikan", d: "Dikembalikan = total masuk − total LPJ − sisa di bank. Ini dana di tangan dept yang wajib dibalikin ke keuangan." },
      { t: "Tangani VA minus", d: "Dikembalikan minus berarti LPJ melebihi dana yang diterima. Minus tidak mengurangi total kewajiban; dept menutup kekurangannya secara terpisah." },
      { t: "Isi ulang bulan berikutnya", d: "Semua sisa dana kembali ke keuangan. Awal bulan, keuangan mengisi ulang tiap VA sebesar full saldo normalnya." },
    ],
  },
  form: {
    title: "Tentang proses LPJ",
    text: "Proses baru mulai di tahap pengajuan dan belum dihitung sebagai LPJ. Angka mulai masuk rekap setelah disetujui, dan dana masuk tercatat saat tahap pengisian kembali dilakukan dari Ledger VA.",
  },
  master: {
    title: "Tentang master VA",
    text: "Saldo normal adalah plafon imprest tiap VA. Setiap closing, keuangan mengisi ulang tiap VA sebesar full saldo normalnya, bukan top-up selisih.",
  },
};

function Shell() {
  const { month } = useStore();
  const [view, setView] = useState<View>("dashboard");
  const [vaId, setVaId] = useState("ga");
  const [helpOpen, setHelpOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const el = document.documentElement;
    if (dark) el.setAttribute("data-theme", "dark");
    else el.removeAttribute("data-theme");
  }, [dark]);

  const jumlahClosing = month.vas.filter((va) => vaStatus(month, va) === "closing").length;
  const help = HELP[view];
  const openHelp = () => setHelpOpen(true);
  const openLedger = (id: string) => { setVaId(id); setView("ledger"); };
  const logout = () => {
    try { sessionStorage.removeItem(AUTH_KEY); } catch { /* abaikan */ }
    window.location.reload();
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">Rp</div>
          <div>
            <div className="brand-name">LPJ kas kecil</div>
            <div className="brand-sub">Rekap per VA</div>
          </div>
        </div>
        <nav aria-label="Navigasi utama">
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`nav-item${view === item.key || (item.key === "ledger" && view === "form") ? " active" : ""}`}
              onClick={() => setView(item.key)}
              aria-current={view === item.key ? "page" : undefined}
            >
              <item.icon size={20} strokeWidth={1.75} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="period-card">
            <div className="k">Periode aktif</div>
            <div className="v">{namaBulan(month.key)}</div>
            <div className="s">{jumlahClosing} dari 10 VA sudah closing</div>
          </div>
          <button type="button" className="nav-item" onClick={() => setDark((d) => !d)} aria-label="Ganti mode terang gelap">
            {dark ? <Sun size={20} strokeWidth={1.75} /> : <Moon size={20} strokeWidth={1.75} />}
            {dark ? "Mode terang" : "Mode gelap"}
          </button>
          <button type="button" className="nav-item" onClick={logout} aria-label="Keluar dari aplikasi">
            <LogOut size={20} strokeWidth={1.75} />
            Keluar
          </button>
        </div>
      </aside>

      <main className="main">
        {view === "dashboard" && <Dashboard go={setView} openLedger={openLedger} onHelp={openHelp} />}
        {view === "ledger" && <Ledger vaId={vaId} setVaId={setVaId} go={setView} onHelp={openHelp} />}
        {view === "closing" && <Closing go={setView} onHelp={openHelp} />}
        {view === "form" && <ProsesForm go={setView} openLedger={openLedger} onHelp={openHelp} />}
        {view === "master" && <MasterVA onHelp={openHelp} />}
      </main>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent title={help.title}>
          {help.steps ? (
            <div className="help-steps">
              {help.steps.map((s, i) => (
                <div key={s.t} className="help-step">
                  <span className="n">{i + 1}</span>
                  <div>
                    <div className="t">{s.t}</div>
                    <div className="d">{s.d}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>{help.text}</p>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
            <DialogClose asChild>
              <Button>Mengerti</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Composition root (dulu di main.tsx versi Vite): StrictMode + StoreProvider
 * pindah ke sini agar index.astro bisa me-mount App sebagai satu island.
 * LoginGate membungkus shell; Shell sendiri yang memanggil useStore,
 * jadi urutannya Provider -> Gate -> Shell.
 */
export default function App() {
  return (
    <StrictMode>
      <StoreProvider>
        <LoginGate>
          <Shell />
        </LoginGate>
      </StoreProvider>
    </StrictMode>
  );
}
