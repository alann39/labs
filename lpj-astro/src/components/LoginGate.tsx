import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Input } from "@/components/arc/input/input";
import { PasswordField } from "@/components/arc/password-field/password-field";
import { Button } from "@/components/arc/button/button";

/** Kunci sesi login gate (UI saja — fase frontend-only, bukan autentikasi beneran). */
export const AUTH_KEY = "lpj-auth";
const USERNAME = "admin";

/**
 * Gerbang masuk single-user. Selama belum ada backend, ini placeholder UI:
 * kredensial dicek di browser dan statusnya disimpan di sessionStorage.
 */
export function LoginGate({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);

  // Dibaca setelah mount agar render pertama di client sama dengan HTML
  // statis (form login), tidak ada hydration mismatch.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(AUTH_KEY) === "1") setAuthed(true);
    } catch { /* abaikan */ }
  }, []);

  if (authed) return <>{children}</>;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const expected = import.meta.env.PUBLIC_LPJ_PASSWORD ?? "lpj2026";
    if (username === USERNAME && password === expected) {
      try { sessionStorage.setItem(AUTH_KEY, "1"); } catch { /* abaikan */ }
      setError(undefined);
      setAuthed(true);
    } else {
      setError("Pengguna atau kata sandi salah.");
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "var(--space-6)",
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 360,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-surface)",
          boxShadow: "var(--shadow-resting)",
          padding: "var(--space-8)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            marginBottom: "var(--space-6)",
          }}
        >
          <div className="brand-mark">Rp</div>
          <div>
            <div style={{ fontSize: "var(--text-lg)", fontWeight: 500, lineHeight: 1.2 }}>
              LPJ kas kecil
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: 2 }}>
              Masuk untuk melanjutkan
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <Input
            label="Pengguna"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <div>
            <PasswordField
              label="Kata sandi"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              messages={{ showPassword: "Tampilkan kata sandi", hidePassword: "Sembunyikan kata sandi" }}
            />
            {error && (
              <span className="login-error" role="alert">{error}</span>
            )}
          </div>
          <Button type="submit" style={{ width: "100%" }}>
            Masuk
          </Button>
        </div>
      </form>
    </div>
  );
}
