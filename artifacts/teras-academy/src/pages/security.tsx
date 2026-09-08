import { type FormEvent, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCurrentSessionQueryKey, useGetCurrentSession } from "@workspace/api-client-react";
import { supabase } from "@/lib/supabase-auth";
import { isValidTotpCode, normalizeTotpCode } from "@/lib/mfa";

type Factor = { id: string; friendly_name?: string; factor_type: string; status: string };

export default function Security() {
  const queryClient = useQueryClient();
  const currentSession = useGetCurrentSession({
    query: { queryKey: getGetCurrentSessionQueryKey(), retry: false },
  });
  const [factors, setFactors] = useState<Factor[]>([]);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentLevel, setCurrentLevel] = useState<string | null>(null);
  const roles = Array.isArray(currentSession.data?.roles) ? currentSession.data.roles : [];
  const isSuperAdmin = roles.includes("super_admin");

  const loadFactors = async () => {
    try {
      const [{ data, error: factorError }, assurance] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      if (factorError) setError(factorError.message);
      const allFactors = Array.isArray(data?.all) ? data.all : [];
      setFactors((allFactors as Factor[]).filter(
        factor => factor && factor.status === "verified" && typeof factor.id === "string",
      ));
      const level = typeof assurance.data?.currentLevel === "string"
        ? assurance.data.currentLevel
        : null;
      setCurrentLevel(level);
      if (level === "aal2") {
        await queryClient.invalidateQueries({ queryKey: getGetCurrentSessionQueryKey() });
      }
    } catch {
      setFactors([]);
      setCurrentLevel(null);
      setError("Status MFA belum dapat dimuat. Muat ulang halaman dan coba kembali.");
    }
  };
  useEffect(() => { void loadFactors(); }, []);
  useEffect(() => {
    if (isSuperAdmin) {
      setError(null);
    }
  }, [isSuperAdmin]);
  const challengeExisting = async (factorId: string, event: FormEvent) => {
    event.preventDefault();
    if (!isValidTotpCode(code)) { setError("Masukkan kode 6 digit dari aplikasi authenticator."); return; }
    setBusy(true); setError(null);
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    const result = challenge.error ? challenge : await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setCode(""); setStatus("Tantangan MFA berhasil. Sesi ditingkatkan.");
    void loadFactors();
  };
  const claimOwnerAccess = async (confirmRecoveryRebind = false) => {
    setBusy(true); setError(null); setStatus(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) { setBusy(false); setError("Sesi Supabase tidak tersedia."); return; }
    const response = await fetch(`${import.meta.env.BASE_URL}api/admin/claim-supabase-identity`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ confirmRecoveryRebind }),
    });
    const body = await response.json().catch(() => ({})) as { code?: string; error?: string };
    setBusy(false);
    if (!response.ok) {
      if (body.code === "SUPER_ADMIN_REBIND_CONFIRMATION_REQUIRED") {
        const confirmed = window.confirm(
          "Akun Super Admin masih terhubung ke ID Supabase lama. Ganti tautan ke akun AAL2 yang sedang login? ID lama akan kehilangan akses Admin dan perubahan akan dicatat.",
        );
        if (confirmed) await claimOwnerAccess(true);
        return;
      }
      setError(body.error ?? "Akun ini tidak dapat mengambil alih akses Super Admin.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: getGetCurrentSessionQueryKey() });
    setStatus("Identitas Super Admin berhasil dipindahkan ke Supabase.");
    window.location.assign(`${import.meta.env.BASE_URL}admin`);
  };
  return <main className="mx-auto w-full max-w-2xl p-6">
    <p className="font-mono text-xs font-bold tracking-[.2em] text-primary">ACCOUNT SECURITY</p>
    <h1 className="mt-3 text-3xl font-extrabold">Multi-factor authentication</h1>
    <p className="mt-3 text-muted-foreground">Gunakan aplikasi authenticator untuk melindungi akun. Super Admin memerlukan sesi MFA (AAL2) untuk tindakan yang dilindungi.</p>
    <p className="mt-3 text-sm font-semibold">Status sesi: <span className={currentLevel === "aal2" ? "text-primary" : "text-amber-500"}>{currentLevel?.toUpperCase() ?? "MEMERIKSA…"}</span></p>
    {error && <p role="alert" className="mt-5 rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
    {status && <p role="status" className="mt-5 rounded-md border border-primary/40 p-3 text-sm text-primary">{status}</p>}
    <section className="mt-7 rounded-xl border border-border bg-card p-5">
      <h2 className="font-bold">Authenticator terdaftar</h2>
      {factors.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Belum ada authenticator terverifikasi.</p> : <ul className="mt-3 space-y-3">{factors.map(factor => <li className="rounded-md border border-border p-3" key={factor.id}><strong>{factor.friendly_name || "Authenticator"}</strong><span className="ml-2 text-xs text-muted-foreground">{factor.status}</span></li>)}</ul>}
      <p className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">Pendaftaran, penggantian, dan penghapusan authenticator dikelola oleh operator melalui Supabase. Hubungi operator untuk perubahan lifecycle MFA; TERAS hanya dapat memverifikasi faktor yang sudah terdaftar dan terverifikasi.</p>
    </section>
    {factors.map(factor => <form className="mt-6 rounded-xl border border-border bg-card p-5" onSubmit={event => void challengeExisting(factor.id, event)} key={`challenge-${factor.id}`}><h2 className="font-bold">Tingkatkan sesi dengan MFA</h2><p className="mt-2 text-sm text-muted-foreground">{factor.friendly_name || "Authenticator terverifikasi"}</p><label className="mt-3 block text-sm font-medium" htmlFor={`challenge-${factor.id}`}>Kode 6 digit</label><input id={`challenge-${factor.id}`} className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={e => setCode(normalizeTotpCode(e.target.value))} required /><button className="mt-3 rounded-md bg-primary px-4 py-2 font-bold text-primary-foreground" disabled={busy}>Verifikasi sesi</button></form>)}
    {isSuperAdmin && <section className="mt-6 rounded-xl border border-primary/40 bg-card p-5">
      <h2 className="font-bold">Akses Super Admin terhubung</h2>
      <p className="mt-2 text-sm text-muted-foreground">Identitas Supabase, role TERAS, dan MFA akun ini sudah aktif.</p>
      <button type="button" className="mt-4 rounded-md bg-primary px-4 py-2 font-bold text-primary-foreground" onClick={() => window.location.assign(`${import.meta.env.BASE_URL}admin`)}>Buka Admin Control Room</button>
    </section>}
    {!isSuperAdmin && <section className="mt-6 rounded-xl border border-primary/40 bg-card p-5">
      <h2 className="font-bold">Hubungkan akses pemilik</h2>
      <p className="mt-2 text-sm text-muted-foreground">Gunakan ini satu kali hanya jika akun belum terhubung ke Super Admin lama.</p>
      {currentLevel !== "aal2" && <p className="mt-3 text-sm text-amber-500">Verifikasi kode authenticator pada bagian “Tingkatkan sesi dengan MFA” terlebih dahulu sampai status sesi menjadi AAL2.</p>}
      <button type="button" className="mt-4 rounded-md bg-primary px-4 py-2 font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void claimOwnerAccess()} disabled={busy || currentLevel !== "aal2"}>Hubungkan akses Super Admin</button>
    </section>}
    <p className="mt-6 text-sm text-muted-foreground">Jika Anda kehilangan perangkat, gunakan proses pemulihan akun yang dikonfigurasi di Supabase. TERAS tidak menyimpan atau menampilkan recovery secret maupun backup code.</p>
  </main>;
}