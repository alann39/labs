import "@/components/arc/foundation.css";
import "./index.css";
import { StrictMode, useEffect, useState } from "react";
import { CircleCheck, Database, FileText, LayoutGrid, List, LogOut, Moon, Sun, Wallet } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent, DialogClose } from "@/components/arc/dialog/dialog";
import { StoreProvider, useStore } from "./store";
import { AUTH_KEY, LoginGate } from "./components/LoginGate";
import { namaBulan } from "./format";
import { Dashboard } from "./views/Dashboard";
import { Ledger } from "./views/Ledger";
import { Closing } from "./views/Closing";
import { LpjView } from "./views/LpjView";
import { DanaMasukView } from "./views/DanaMasukView";
import { MasterVA } from "./views/MasterVA";

export type View = "dashboard" | "ledger" | "lpj" | "masuk" | "closing" | "master";

const NAV: Array<{ key: View; label: string; icon: typeof LayoutGrid }> = [
  { key: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { key: "ledger", label: "Ledger VA", icon: List },
  { key: "lpj", label: "LPJ", icon: FileText },
  { key: "masuk", label: "Dana Masuk", icon: Wallet },
  { key: "closing", label: "Closing", icon: CircleCheck },
  { key: "master", label: "Master VA", icon: Database },
];

const HELP: Record<View, { title: string; steps?: Array<{ t: string; d: string }>; text?: string }> = {
  dashboard: {
    title: "Cara membaca dashboard",
    text: "Semua angka dihitung langsung dari catatan LPJ dan dana masuk bulan aktif. Angka utamanya adalah wajib dikembalikan: selisih tiap VA yang harus dikembalikan ke keuangan setelah dikurangi sisa saldo di banknya, agar bulan berikutnya bisa diisi full saldo normal lagi. Ganti bulan lewat pemilih di kanan atas.",
  },
  ledger: {
    title: "Cara kerja ledger VA",
    text: "Ledger menampilkan timeline gabungan LPJ dan dana masuk satu VA dalam satu bulan. Pengisian kembali tertaut ke LPJ yang diisi, LPJ khusus tertaut ke pengisian khususnya, dan LPJ terakhir bulan itu ditandai LPJ Closing. Catatan bisa diedit atau dihapus dari sini selama VA belum closing.",
  },
  lpj: {
    title: "Tentang catatan LPJ",
    text: "Yang dicatat di sini hanya LPJ yang sudah disetujui, bukan pengajuan. LPJ reguler menunggu pengisian kembali dari keuangan; LPJ khusus adalah pertanggungjawaban atas pengisian khusus yang sudah diterima VA lebih dulu. Tandai LPJ terakhir bulan itu dengan LPJ Closing.",
  },
  masuk: {
    title: "Tentang catatan dana masuk",
    text: "Yang dicatat di sini hanya dana yang sudah ditransfer ke VA. Pengisian kembali adalah tindak lanjut dari satu LPJ reguler yang sudah disetujui, tanggalnya adalah tanggal transfer sebenarnya. Pengisian khusus adalah pengisian atas permintaan khusus yang disetujui manajemen dan nanti dipertanggungjawabkan lewat LPJ khusus. Isi awal bulan dibuat otomatis dari closing.",
  },
  closing: {
    title: "Cara kerja closing per VA",
    steps: [
      { t: "Cek saldo bank", d: "Masukkan sisa saldo di bank tiap VA, hasil rekonsiliasi dengan mutasi bank." },
      { t: "Hitung selisih", d: "Selisih = total masuk dikurangi total LPJ dikurangi sisa di bank. Cek cepatnya: LPJ Closing ditambah sisa di bank harus sama dengan saldo normal." },
      { t: "Konfirmasi pengembalian", d: "Selisih positif harus dikembalikan dept ke keuangan. Catat penerimaannya di sini, boleh sebagian, sampai lunas." },
      { t: "Closing VA", d: "VA yang selisihnya lunas (atau tidak berselisih) bisa di-closing. Closing mengunci VA itu dan membuat isi awal bulan berikutnya sebesar full saldo normal untuk VA tersebut." },
    ],
  },
  master: {
    title: "Tentang master VA",
    text: "Master VA adalah daftar virtual account kas kecil beserta saldo normalnya. Tambah, edit, nonaktifkan, atau hapus VA dari sini. VA yang sudah punya catatan tidak bisa dihapus permanen, hanya dinonaktifkan. Perubahan berlaku ke bulan-bulan di mana VA terkait belum closing.",
  },
};

function Shell() {
  const { month, offline, syncState, hasSaved } = useStore();
  const [view, setView] = useState<View>("dashboard");
  const [vaId, setVaId] = useState("ga");
  const [helpOpen, setHelpOpen] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const el = document.documentElement;
    if (dark) el.setAttribute("data-theme", "dark");
    else el.removeAttribute("data-theme");
  }, [dark]);

  const jumlahClosing = month.vas.filter((va) => va.closingSelesai).length;
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
              className={`nav-item${view === item.key ? " active" : ""}`}
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
            <div className="s">{jumlahClosing} dari {month.vas.length} VA sudah closing</div>
          </div>
          <button type="button" className="nav-item" onClick={() => setDark((d) => !d)} aria-label="Ganti mode terang gelap">
            {dark ? <Sun size={20} strokeWidth={1.75} /> : <Moon size={20} strokeWidth={1.75} />}
            {dark ? "Mode terang" : "Mode gelap"}
          </button>
          <button type="button" className="nav-item" onClick={logout} aria-label="Keluar dari aplikasi">
            <LogOut size={20} strokeWidth={1.75} />
            Keluar
          </button>
          {(syncState === "saving" || (syncState === "idle" && hasSaved)) && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "2px 12px" }} role="status">
              {syncState === "saving" ? "Menyimpan…" : "Tersimpan di server"}
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        {offline && (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid var(--warning)",
              color: "var(--text-secondary)",
              fontSize: 13,
            }}
          >
            Mode offline. Perubahan tidak tersimpan ke server.
          </div>
        )}
        {view === "dashboard" && <Dashboard go={setView} openLedger={openLedger} onHelp={openHelp} />}
        {view === "ledger" && <Ledger vaId={vaId} setVaId={setVaId} go={setView} onHelp={openHelp} />}
        {view === "lpj" && <LpjView onHelp={openHelp} />}
        {view === "masuk" && <DanaMasukView onHelp={openHelp} />}
        {view === "closing" && <Closing go={setView} onHelp={openHelp} />}
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
