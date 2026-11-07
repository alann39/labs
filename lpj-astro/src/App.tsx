import "@/components/arc/foundation.css";
import "./index.css";
import { StrictMode, useEffect, useRef, useState } from "react";
import { BookOpen, CircleDollarSign, CircleHelp, FileText, Flag, LayoutDashboard, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Settings2, Sun, X } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
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

const NAV: Array<{ key: View; label: string; icon: typeof LayoutDashboard }> = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "ledger", label: "Ledger VA", icon: BookOpen },
  { key: "lpj", label: "LPJ", icon: FileText },
  { key: "masuk", label: "Dana Masuk", icon: CircleDollarSign },
  { key: "closing", label: "Closing", icon: Flag },
  { key: "master", label: "Master VA", icon: Settings2 },
];

const SIDEBAR_KEY = "lpj-sidebar-collapsed";

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
  const [collapsed, setCollapsed] = useState(false);
  // Drawer navigasi mobile (≤900px): tertutup default, dibuka dari top
  // bar. State lokal murni tampilan — perilaku desktop tidak tersentuh.
  const [navOpen, setNavOpen] = useState(false);
  // Top bar mobile jadi solid setelah halaman di-scroll melewati 8px
  // (trait "turns solid on scroll" header Arc). Kelas .solid hanya
  // berpengaruh pada ≤900px; di desktop top bar tidak dirender.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // Pill penanda item aktif yang MELUNCUR di dalam sheet mobile:
  // posisinya diukur dari DOM item aktif (offsetTop/offsetHeight) dan
  // dipindah lewat transform. Hanya digambar pada ≤900px (CSS); di
  // desktop item aktif tetap memakai background-nya sendiri.
  const navRef = useRef<HTMLElement | null>(null);
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    const measure = () => {
      const nav = navRef.current;
      if (!nav) return;
      const active = nav.querySelector<HTMLElement>(".nav-item.active");
      if (!active) { setPill(null); return; }
      setPill({ top: active.offsetTop, height: active.offsetHeight });
    };
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", measure); };
  }, [view, navOpen, collapsed]);

  // Saat drawer terbuka: kunci scroll latar + Escape menutup.
  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNavOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [navOpen]);

  const navigate = (v: View) => { setView(v); setNavOpen(false); };

  useEffect(() => {
    const el = document.documentElement;
    if (dark) el.setAttribute("data-theme", "dark");
    else el.removeAttribute("data-theme");
  }, [dark]);

  // Preferensi collapse dibaca setelah mount (render pertama tetap
  // expanded, sama seperti HTML awal) lalu disimpan tiap kali berubah.
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1"); } catch { /* abaikan */ }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1"); } catch { /* abaikan */ }
      return !c;
    });
  };

  // Perpindahan tema terasa halus (efek yang dibawa ThemeSwitch Arc,
  // tanpa pill-nya): kelas sesaat `theme-fade` di <html> menghidupkan
  // transisi warna permukaan selama data-theme berganti; ikon
  // matahari/bulan ber-crossfade + rotasi lewat CSS .theme-icon.
  // Reduced motion: kelas tidak dipasang, pergantian tetap instan.
  const toggleDark = () => {
    const el = document.documentElement;
    let reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* abaikan */ }
    if (!reduce) {
      el.classList.add("theme-fade");
      window.setTimeout(() => el.classList.remove("theme-fade"), 320);
    }
    setDark((d) => !d);
  };

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
      {/* Top bar mobile (≤900px): brand + hamburger. Sidebar menjadi
          sheet melayang (pola sidebar-rail Arc); konten utama langsung
          tampil di viewport pertama tanpa panel navigasi statis. */}
      <div className={`mobile-topbar${scrolled ? " solid" : ""}`}>
        <div className="brand-mark" aria-hidden="true">Rp</div>
        <div className="brand-name">LPJ kas kecil</div>
        <div className="mobile-topbar-actions">
          {/* Bantuan halaman aktif: jalur yang sama persis dengan
              tombol Bantuan di PageHead (openHelp di Shell ini) —
              di PageHead tombolnya disembunyikan pada ≤900px agar
              tidak menggantung sendirian di konten. */}
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={openHelp}
            aria-label="Bantuan"
          >
            <CircleHelp size={22} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setNavOpen(true)}
            aria-label="Buka navigasi"
            aria-expanded={navOpen}
            aria-controls="sidebar-utama"
          >
            <Menu size={22} strokeWidth={1.75} />
          </button>
        </div>
      </div>
      <div
        className={`sidebar-backdrop${navOpen ? " show" : ""}`}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />
      <aside id="sidebar-utama" className={`sidebar${collapsed ? " collapsed" : ""}${navOpen ? " open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">Rp</div>
          <div className="brand-text">
            <div className="brand-name">LPJ kas kecil</div>
            <div className="brand-sub">Rekap per VA</div>
          </div>
          <Tooltip content={collapsed ? "Luaskan sidebar" : "Ciutkan sidebar"} side="bottom">
            <button
              type="button"
              className="icon-btn sidebar-toggle"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Luaskan sidebar" : "Ciutkan sidebar"}
              aria-expanded={!collapsed}
            >
              {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.75} /> : <PanelLeftClose size={18} strokeWidth={1.75} />}
            </button>
          </Tooltip>
          <button
            type="button"
            className="icon-btn sidebar-close"
            onClick={() => setNavOpen(false)}
            aria-label="Tutup navigasi"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <nav ref={navRef} aria-label="Navigasi utama">
          <span
            className="nav-pill"
            aria-hidden="true"
            style={pill ? { transform: `translateY(${pill.top}px)`, height: pill.height, opacity: 1 } : { opacity: 0 }}
          />
          {NAV.map((item) => {
            const button = (
              <button
                key={item.key}
                type="button"
                className={`nav-item${view === item.key ? " active" : ""}`}
                onClick={() => navigate(item.key)}
                aria-current={view === item.key ? "page" : undefined}
                aria-label={item.label}
              >
                <item.icon size={20} strokeWidth={1.75} />
                <span className="nav-label">{item.label}</span>
              </button>
            );
            // Saat collapsed label teks tersembunyi: penjelasan pindah ke
            // Tooltip Arc (dulu atribut title). Expanded: tanpa tooltip.
            return collapsed ? (
              <Tooltip key={item.key} content={item.label} side="right">
                {button}
              </Tooltip>
            ) : (
              button
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="period-card">
            <div className="k">Periode aktif</div>
            <div className="v">{namaBulan(month.key)}</div>
            <div className="s">{jumlahClosing} dari {month.vas.length} VA sudah closing</div>
          </div>
          {collapsed ? (
            <Tooltip content={dark ? "Mode terang" : "Mode gelap"} side="right">
              <button type="button" className="nav-item" onClick={toggleDark} aria-label="Ganti mode terang gelap">
                <span className="theme-icon" aria-hidden="true">
                  <Moon className="theme-icon-moon" size={20} strokeWidth={1.75} />
                  <Sun className="theme-icon-sun" size={20} strokeWidth={1.75} />
                </span>
                <span className="nav-label">{dark ? "Mode terang" : "Mode gelap"}</span>
              </button>
            </Tooltip>
          ) : (
            <button type="button" className="nav-item" onClick={toggleDark} aria-label="Ganti mode terang gelap">
              <span className="theme-icon" aria-hidden="true">
                <Moon className="theme-icon-moon" size={20} strokeWidth={1.75} />
                <Sun className="theme-icon-sun" size={20} strokeWidth={1.75} />
              </span>
              <span className="nav-label">{dark ? "Mode terang" : "Mode gelap"}</span>
            </button>
          )}
          {collapsed ? (
            <Tooltip content="Keluar" side="right">
              <button type="button" className="nav-item" onClick={logout} aria-label="Keluar dari aplikasi">
                <LogOut size={20} strokeWidth={1.75} />
                <span className="nav-label">Keluar</span>
              </button>
            </Tooltip>
          ) : (
            <button type="button" className="nav-item" onClick={logout} aria-label="Keluar dari aplikasi">
              <LogOut size={20} strokeWidth={1.75} />
              <span className="nav-label">Keluar</span>
            </button>
          )}
          {(syncState === "saving" || (syncState === "idle" && hasSaved)) && (
            <div className="sync-status" role="status">
              <span className="sync-dot" aria-hidden="true" />
              <span className="sync-text">{syncState === "saving" ? "Menyimpan…" : "Tersimpan di server"}</span>
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
