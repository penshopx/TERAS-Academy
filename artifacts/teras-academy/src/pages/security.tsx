import { type FormEvent, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCurrentSessionQueryKey,
  getListAdminAccessRequestsQueryKey,
  useCreateAdminAccessRequest,
  useGetCurrentSession,
  useListAdminAccessRequests,
} from "@workspace/api-client-react";
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
  const isAdmin = roles.includes("admin");
  const isAdministrative = isAdmin || isSuperAdmin;
  const accessRequests = useListAdminAccessRequests({
    query: {
      enabled: currentSession.isSuccess,
      queryKey: getListAdminAccessRequestsQueryKey(),
      retry: false,
      refetchInterval: isAdministrative ? false : 5_000,
    },
  });
  const promotionRequest = useCreateAdminAccessRequest();
  const ownPromotion = accessRequests.data?.find(
    request => request.targetPersonId === currentSession.data?.personId && request.requestedRole === "admin",
  );

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
  useEffect(() => {
    if (ownPromotion?.status === "approved" && !isAdministrative) {
      void queryClient.invalidateQueries({ queryKey: getGetCurrentSessionQueryKey() });
    }
  }, [isAdministrative, ownPromotion?.status, queryClient]);
  const requestAdminPromotion = () => {
    const personId = currentSession.data?.personId;
    if (!personId) {
      setError("Identitas TERAS belum siap. Muat ulang halaman lalu coba lagi.");
      return;
    }
    setError(null);
    setStatus(null);
    promotionRequest.mutate({
      data: {
        targetPersonId: personId,
        requestedRole: "admin",
        reason: "Saya ingin membantu mengelola TERAS Academy.",
      },
    }, {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListAdminAccessRequestsQueryKey() });
        setStatus("Permohonan Admin berhasil diajukan dan menunggu persetujuan.");
      },
      onError: errorValue => {
        const candidate = errorValue as { data?: { error?: string }; message?: string };
        setError(candidate.data?.error ?? candidate.message ?? "Permohonan belum dapat diajukan.");
      },
    });
  };
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
    {isAdministrative && <section className="mt-6 rounded-xl border border-primary/40 bg-card p-5">
      <h2 className="font-bold">Akses {isSuperAdmin ? "Super Admin" : "Admin"} aktif</h2>
      <p className="mt-2 text-sm text-muted-foreground">Identitas Supabase dan role TERAS akun ini sudah aktif.</p>
      <button type="button" className="mt-4 rounded-md bg-primary px-4 py-2 font-bold text-primary-foreground" onClick={() => window.location.assign(`${import.meta.env.BASE_URL}admin`)}>Buka Admin Control Room</button>
    </section>}
    {!isAdministrative && <section className="mt-6 rounded-xl border border-primary/40 bg-card p-5">
      <h2 className="font-bold">Ajukan menjadi Admin</h2>
      <p className="mt-2 text-sm text-muted-foreground">Kirim permohonan satu kali. Admin atau Super Admin akan menyetujui atau menolaknya.</p>
      {ownPromotion && <p className="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm" role="status">Status permohonan: <strong>{ownPromotion.status === "pending" ? "Menunggu persetujuan" : ownPromotion.status === "approved" ? "Disetujui" : "Ditolak"}</strong></p>}
      <button type="button" className="mt-4 rounded-md bg-primary px-4 py-2 font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" onClick={requestAdminPromotion} disabled={promotionRequest.isPending || ownPromotion?.status === "pending"}>{promotionRequest.isPending ? "Mengirim…" : ownPromotion?.status === "pending" ? "Permohonan sedang diproses" : "Ajukan menjadi Admin"}</button>
    </section>}
    <p className="mt-6 text-sm text-muted-foreground">Jika Anda kehilangan perangkat, gunakan proses pemulihan akun yang dikonfigurasi di Supabase. TERAS tidak menyimpan atau menampilkan recovery secret maupun backup code.</p>
  </main>;
}