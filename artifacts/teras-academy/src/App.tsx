import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, Route as RouteIcon, ShieldCheck, ExternalLink, Globe, Target, Activity, Zap, ChevronRight } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';
import { FloatingAssistants } from '@/components/floating-assistants';
import { ThemeToggle } from '@/components/theme-toggle';
import { getGetCurrentSessionQueryKey, useGetCurrentSession } from '@workspace/api-client-react';
import { homeForRoles } from '@/lib/role-navigation';
import { hasIdentityChanged, type PreviousUserId, type UserId } from '@/lib/identity-lifecycle';

import Dashboard from '@/pages/dashboard';
import Journey from '@/pages/journey';
import LearningPlan from '@/pages/learning-plan';
import LearningList from '@/pages/learning-list';
import LearningCourse from '@/pages/learning-course';
import LearningLesson from '@/pages/learning-lesson';
import Programs from '@/pages/programs';
import ProgramDetail from '@/pages/program-detail';
import ModuleDetail from '@/pages/module-detail';
import Practice from '@/pages/practice';
import Evidence from '@/pages/evidence';
import Assessments from '@/pages/assessments';
import AssessmentDetail from '@/pages/assessment-detail';
import GapsAndRemediation from '@/pages/gaps';
import Readiness from '@/pages/readiness';
import Passport from '@/pages/passport';
import TrainerDesk from '@/pages/trainer';
import AssessorDesk from '@/pages/assessor';
import Admin from '@/pages/admin';

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
// This value is compiled only by the NODE_ENV=test harness.  It never grants
// API access: that harness injects its identity privately in its own server.
const integrationTestMode = import.meta.env.MODE === 'test' && import.meta.env.VITE_INTEGRATION_TEST_MODE === 'true';

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey && !integrationTestMode) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: 'bottom' as const,
    socialButtonsVariant: 'blockButton' as const,
  },
  variables: {
    colorPrimary: '#00c3ff',
    colorForeground: '#f5f5f5',
    colorMutedForeground: '#a3a3a3',
    colorDanger: '#ef4444',
    colorBackground: '#0d0d0d',
    colorInput: '#171717',
    colorInputForeground: '#f5f5f5',
    colorNeutral: '#333333',
    fontFamily: 'Plus Jakarta Sans, sans-serif',
    borderRadius: '0.5rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#0d0d0d] border border-[#262626] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-2xl shadow-black/50',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-white font-bold',
    headerSubtitle: 'text-neutral-300',
    socialButtonsBlockButtonText: 'text-white font-medium',
    formFieldLabel: 'text-neutral-100 font-medium',
    footerActionLink: 'text-[#00c3ff] hover:text-[#70dcff]',
    footerActionText: 'text-neutral-300',
    dividerText: 'text-neutral-400',
    identityPreviewEditButton: 'text-[#00c3ff]',
    formFieldSuccessText: 'text-[#86efac]',
    alertText: 'text-white',
    logoBox: 'mb-5',
    logoImage: 'h-14 w-auto',
    socialButtonsBlockButton: 'bg-[#171717] border-[#404040] hover:bg-[#262626]',
    formButtonPrimary: 'bg-[#00c3ff] text-black hover:bg-[#70dcff] font-bold',
    formFieldInput: 'bg-[#171717] border-[#404040] text-white',
    footerAction: 'border-t border-[#262626]',
    dividerLine: 'bg-[#404040]',
    alert: 'bg-[#2a1515] border border-red-500/40',
    otpCodeFieldInput: 'bg-[#171717] border-[#404040] text-white',
    formFieldRow: 'gap-2',
    main: 'gap-5',
  },
};

function PublicHome() {
  return (
    <main className="public-theme-surface relative min-h-[100dvh] overflow-hidden bg-background text-foreground selection:bg-[#00c3ff]/30">
      {/* Background elements */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_78%_22%,rgba(0,195,255,0.12),transparent_40%),linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:auto,64px_64px,64px_64px]" />
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-transparent via-[#050505]/50 to-[#050505]" />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-7xl flex-col px-6 py-7 lg:px-10">

        {/* Navigation */}
        <header className="flex items-center justify-between z-10 animate-in fade-in slide-in-from-top-4 duration-700">
          <Link href="/" className="flex items-center gap-3 group" aria-label="TERAS Academy">
            <span className="text-2xl font-extrabold tracking-[0.18em] text-[#00c3ff] group-hover:text-white transition-colors duration-500">TERAS</span>
            <span className="hidden border-l border-white/20 pl-3 text-[10px] font-bold uppercase leading-tight tracking-[0.2em] text-white/60 sm:inline">Capability<br />Academy</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/sign-in" className="text-sm font-semibold text-white/70 transition hover:text-white">Masuk</Link>
            <Link href="/sign-up" className="rounded-md bg-[#00c3ff] px-5 py-2 text-sm font-bold text-black transition-all hover:bg-[#70dcff] hover:shadow-[0_0_20px_rgba(0,195,255,0.4)]">
              Mulai TERAS
            </Link>
          </div>
        </header>

        {/* Hero Section */}
        <section className="grid min-h-[760px] items-center gap-16 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:py-0">
          <div className="max-w-3xl z-10 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-150 fill-mode-both">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#00c3ff]/30 bg-[#00c3ff]/10 px-3 py-1 mb-8">
              <span className="flex h-2 w-2 rounded-full bg-[#00c3ff] animate-pulse"></span>
              <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-[#00c3ff]">EVIDENCE-BASED PLATFORM</span>
            </div>

            <h1 className="text-6xl font-extrabold leading-[0.95] tracking-[-0.04em] sm:text-7xl lg:text-[5.5rem]">
              Build Proof.<br />
              <span className="mt-2 block text-transparent bg-clip-text bg-gradient-to-r from-[#00c3ff] to-[#0077ff]">
                Show Readiness.
              </span>
            </h1>

            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-white/60 font-medium">
              Platform kapabilitas teknis terpadu untuk tenaga kerja transisi energi. Mengukur kemampuan, merekam bukti praktik, dan memastikan <strong className="text-white font-semibold">safety readiness</strong> sebelum turun ke lapangan.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="/sign-up" className="group relative inline-flex items-center gap-3 overflow-hidden rounded-lg bg-[#00c3ff] px-8 py-4 font-bold text-black transition-all hover:scale-[1.02] hover:bg-[#70dcff] hover:shadow-[0_0_30px_rgba(0,195,255,0.3)]">
                Mulai TERAS
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/sign-in" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-8 py-4 font-bold text-white transition-all hover:border-white/30 hover:bg-white/10">
                Masuk
              </Link>
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-4 text-sm font-medium text-white/40">
              <span className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-[#00c3ff]/80" />
                Safety gate tak bisa dilewati
              </span>
              <span className="flex items-center gap-2.5">
                <RouteIcon className="h-4 w-4 text-[#00c3ff]/80" />
                Histori kemampuan terpusat
              </span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[520px] lg:ml-auto animate-in fade-in zoom-in-95 duration-1000 delay-300 fill-mode-both">
            <div className="absolute -inset-10 rounded-full bg-[#00c3ff]/10 blur-[80px]" />
            <div className="relative rounded-2xl border border-white/10 bg-[#0a0a0a]/80 p-1 shadow-2xl backdrop-blur-xl group overflow-hidden">
              <div className="absolute inset-0 z-0 opacity-40 mix-blend-luminosity transition-opacity duration-700 group-hover:opacity-60">
                <img src={`${basePath}/images/teras-energy-control-room.jpg`} alt="TERAS Academy Readiness Control Center" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-[#0a0a0a]/20" />
              </div>
              <div className="relative z-10 rounded-xl border border-white/5 bg-black/40 p-6 backdrop-blur-md">
                <div className="flex items-start justify-between border-b border-white/10 pb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-[#00c3ff]" />
                      <p className="font-mono text-[10px] tracking-[0.2em] text-[#00c3ff]">READINESS COCKPIT</p>
                    </div>
                    <p className="mt-2 font-bold text-lg">Solar PV Technician</p>
                    <p className="text-sm text-white/40">ID: T-8829-PV</p>
                  </div>
                  <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                    Needs reassessment
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3 py-6">
                  <div className="rounded-lg border border-white/5 bg-white/5 p-4 transition-colors hover:bg-white/10">
                    <p className="font-mono text-2xl font-bold text-white">82<span className="text-sm text-white/50">%</span></p>
                    <p className="mt-1 text-[11px] uppercase tracking-wider text-white/40">Learning</p>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-white/5 p-4 transition-colors hover:bg-white/10">
                    <p className="font-mono text-2xl font-bold text-white">7</p>
                    <p className="mt-1 text-[11px] uppercase tracking-wider text-white/40">Evidence</p>
                  </div>
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
                    <p className="font-mono text-2xl font-bold text-red-400">1</p>
                    <p className="mt-1 text-[11px] uppercase tracking-wider text-red-400/70">Critical Gap</p>
                  </div>
                </div>

                <div className="rounded-lg border border-red-500/20 bg-gradient-to-r from-red-500/10 to-transparent p-4 relative overflow-hidden group cursor-default">
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-red-500/20 p-2">
                      <ShieldCheck className="h-4 w-4 text-red-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">Critical safety gate</p>
                      <p className="text-xs text-white/50 mt-0.5">M03 · Electrical isolation</p>
                    </div>
                    <span className="font-mono text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-1 rounded">BLOCKED</span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-lg border border-[#00c3ff]/20 bg-gradient-to-r from-[#00c3ff]/10 to-transparent p-4 transition-colors hover:border-[#00c3ff]/40 cursor-pointer">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-[#00c3ff]/20 p-2">
                      <RouteIcon className="h-4 w-4 text-[#00c3ff]" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-white">Capability Passport</p>
                      <p className="text-[11px] text-white/50 mt-0.5">Riwayat kemampuan longitudinal</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[#00c3ff]" />
                </div>
              </div>
            </div>
            <p className="mt-5 text-center font-mono text-[10px] tracking-[0.2em] text-white/30 uppercase">
              TERAS Academy Readiness Control Center
            </p>
          </div>
        </section>

        {/* TERAS Academy Story Video Section */}
        <section className="py-20 lg:py-24 relative border-t border-white/5">
          <div className="max-w-5xl mx-auto px-6 lg:px-10">
            <div className="mb-12 text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 mb-6">
                <span className="flex h-2 w-2 rounded-full bg-[#00c3ff] animate-pulse"></span>
                <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-white uppercase">In Action</span>
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-white">
                Menyiapkan Tenaga Transisi Energi Indonesia
              </h2>
              <p className="mt-5 text-lg text-white/60 max-w-2xl mx-auto leading-relaxed">
                Lihat bagaimana TERAS Academy mentransformasi pelatihan teknis menjadi kesiapan lapangan yang nyata dan terukur.
              </p>
            </div>

            <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#050505] shadow-[0_0_40px_rgba(0,195,255,0.05)] group">
              <div className="aspect-video w-full relative">
                <iframe
                  src="/teras-academy-story/"
                  title="Video dokumenter TERAS Academy untuk kesiapan transisi energi"
                  className="absolute inset-0 w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
              <div className="bg-[#0a0a0a] border-t border-white/5 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00c3ff]/10">
                    <BadgeCheck className="h-4 w-4 text-[#00c3ff]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">TERAS Academy 60-Second Overview</p>
                    <p className="text-xs text-white/50">Capability to Readiness Story</p>
                  </div>
                </div>
                <a
                  href="/teras-academy-story/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-bold text-[#00c3ff] hover:text-[#70dcff] transition-colors flex items-center gap-2"
                >
                  Buka di tab baru <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Narrative Section: The Why */}
        <section className="py-24 lg:py-32 relative border-t border-white/5">
          <div className="grid gap-16 lg:grid-cols-2 items-start">
            <div className="max-w-xl">
              <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-white">
                The Scale of the Transition
              </h2>
              <div className="mt-6 space-y-6 text-lg text-white/60 leading-relaxed">
                <p>
                  Transisi energi global bukan sekadar tantangan alokasi modal—ia adalah hambatan kapabilitas manusia. Menurut temuan otoritatif <strong className="text-white font-medium">IEA World Energy Employment 2025</strong>, skenario yang selaras dengan net-zero membutuhkan penambahan hampir <strong className="text-white font-medium">15 juta pekerja energi secara global pada tahun 2035</strong>.
                </p>
                <p>
                  Lebih dari separuh perusahaan yang disurvei melaporkan hambatan rekrutmen yang kritis, terutama pada peran teknis terapan. Di saat yang sama, Indonesia sedang bergerak menuju target emisi net-zero pada <strong className="text-white font-medium">2060 atau lebih cepat</strong>.
                </p>
              </div>
              <div className="mt-8">
                <a href="https://www.iea.org/reports/world-energy-employment-2025" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-[#00c3ff] hover:text-[#70dcff] transition-colors group">
                  <ExternalLink className="h-4 w-4" />
                  Sumber: IEA WEE 2025
                  <span className="block h-px w-full bg-[#00c3ff]/30 absolute bottom-0 left-0 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></span>
                </a>
              </div>

              <div className="theme-image-card mt-14 relative rounded-xl overflow-hidden border border-white/10 group">
                <div className="aspect-[16/9] w-full relative">
                  <img
                    src={`${basePath}/images/teras-transition-2046.jpg`}
                    alt="Lanskap industri transisi energi dan energi terbarukan di Indonesia horizon 2046"
                    className="object-cover w-full h-full transition-transform duration-1000 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="theme-image-overlay absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/20 to-transparent" />
                  <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between">
                    <div>
                      <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-[#00c3ff] mb-1">TERAS ACADEMY</p>
                      <p className="text-sm font-bold text-white tracking-wide">HORIZON 2046</p>
                    </div>
                    <span className="flex h-2 w-2 rounded-full bg-[#00c3ff] shadow-[0_0_8px_rgba(0,195,255,0.8)]"></span>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute left-[27px] top-4 bottom-4 w-px bg-gradient-to-b from-[#00c3ff]/50 via-white/10 to-transparent"></div>
              <div className="space-y-12">

                <div className="relative pl-16">
                  <div className="absolute left-4 top-1.5 h-3 w-3 rounded-full border-2 border-[#00c3ff] bg-black shadow-[0_0_10px_rgba(0,195,255,0.5)]"></div>
                  <h3 className="font-mono text-2xl font-bold text-white">2031 <span className="text-sm font-sans font-medium text-white/40 ml-2 tracking-wide">5-YEAR HORIZON</span></h3>
                  <p className="mt-3 text-white/60 leading-relaxed">
                    Fase akselerasi. Hambatan kapabilitas mulai menahan eksekusi modal secara sistemik. Kesiapan operasional (operational readiness) menjadi konstrain utama industri.
                  </p>
                </div>

                <div className="relative pl-16">
                  <div className="absolute left-4 top-1.5 h-3 w-3 rounded-full border-2 border-white/30 bg-black"></div>
                  <h3 className="font-mono text-2xl font-bold text-white">2036 <span className="text-sm font-sans font-medium text-white/40 ml-2 tracking-wide">10-YEAR HORIZON</span></h3>
                  <p className="mt-3 text-white/60 leading-relaxed">
                    Kebutuhan struktural mencapai puncak. Integrasi sistem dan kelangkaan peran teknis terapan mendikte laju nyata transisi energi di lapangan.
                  </p>
                </div>

                <div className="relative pl-16">
                  <div className="absolute left-4 top-1.5 h-3 w-3 rounded-full border-2 border-white/30 bg-black"></div>
                  <h3 className="font-mono text-2xl font-bold text-white">2046 <span className="text-sm font-sans font-medium text-white/40 ml-2 tracking-wide">20-YEAR HORIZON</span></h3>
                  <p className="mt-3 text-white/60 leading-relaxed">
                    Mendekati target net-zero 2060. Kematangan struktural terbentuk. Kemampuan adaptasi dan pemeliharaan oleh tenaga kerja menentukan ketahanan energi berdaulat.
                  </p>
                </div>

              </div>
            </div>
          </div>
        </section>

        {/* Process Section */}
        <section className="py-24 border-y border-white/5 relative overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl h-[300px] bg-[#00c3ff]/5 blur-[120px] rounded-full pointer-events-none"></div>

          <div className="max-w-4xl mx-auto text-center relative z-10">
            <p className="font-mono text-xs font-bold tracking-[0.22em] text-[#00c3ff] mb-6">WHY TERAS</p>
            <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl text-white">
              Kemampuan tidak cukup hanya dinilai. <br className="hidden sm:block" />
              <span className="text-[#00c3ff]">Kemampuan harus dibuktikan.</span>
            </h2>
          </div>

          <div className="mt-20 relative max-w-5xl mx-auto">
            <div className="hidden md:block absolute top-[45%] left-0 w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 md:gap-6 relative z-10">
              {[
                { step: 'Diagnostic', desc: 'Pemetaan awal' },
                { step: 'Learning', desc: 'Pengetahuan inti' },
                { step: 'Practice', desc: 'Simulasi aman' },
                { step: 'Evidence', desc: 'Bukti terapan' },
                { step: 'Assessment', desc: 'Validasi objektif' },
                { step: 'Readiness', desc: 'Kesiapan tahap berikutnya' }
              ].map((item, index) => (
                <div key={item.step} className="group relative">
                  <div className="rounded-xl border border-white/10 bg-[#0a0a0a] p-5 text-center transition-all duration-300 hover:-translate-y-1 hover:border-[#00c3ff]/30 hover:shadow-[0_10px_20px_-10px_rgba(0,195,255,0.15)] h-full flex flex-col items-center justify-center">
                    <p className="font-mono text-xs font-bold text-[#00c3ff]/50 mb-3 group-hover:text-[#00c3ff] transition-colors">0{index + 1}</p>
                    <p className="font-bold text-white">{item.step}</p>
                    <p className="text-[10px] text-white/40 mt-2 uppercase tracking-wide">{item.desc}</p>
                  </div>
                  {index < 5 && (
                    <ArrowRight className="absolute -right-5 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-white/20 md:block group-hover:text-[#00c3ff]/50 transition-colors" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Philosophy & Features */}
        <section className="py-24 grid lg:grid-cols-[1fr_1.1fr] gap-12 lg:gap-20 items-center">
          <div className="space-y-6">
            <div className="theme-image-card relative rounded-3xl overflow-hidden border border-white/10 group h-[260px] md:h-[300px]">
              <img
                src={`${basePath}/images/teras-solar-technician.jpg`}
                alt="Teknisi TERAS Academy melakukan inspeksi panel surya lapangan dengan standar keselamatan ketat"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                loading="lazy"
              />
              <div className="theme-image-overlay absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/50 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="h-4 w-4 text-[#00c3ff]" />
                  <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-[#00c3ff] uppercase">Field Verification</span>
                </div>
                <p className="text-sm text-white/80 font-medium leading-relaxed max-w-sm">Program Pengembangan TERAS Academy membangun bukti kesiapan untuk tahap berikutnya, bukan sekadar kelulusan teori di atas kertas.</p>
              </div>
            </div>

            <div className="rounded-3xl border border-red-500/20 bg-gradient-to-br from-red-500/10 to-[#0a0a0a] p-8 md:p-10 relative overflow-hidden">
              <div className="absolute -right-10 -top-10 w-40 h-40 bg-red-500/20 blur-3xl rounded-full"></div>

              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 mb-8">
                <ShieldCheck className="h-7 w-7 text-red-400" />
              </div>
              <p className="font-mono text-xs font-bold tracking-[0.2em] text-red-400 mb-3">SAFETY PHILOSOPHY</p>
              <h3 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white mb-6">Score is not enough.</h3>

              <div className="space-y-4 text-white/70">
                <p className="text-xl font-bold leading-snug text-white">
                  Safety failure cannot be hidden by an average score.
                </p>
                <p className="leading-relaxed">
                  Saat kriteria keselamatan kritis gagal, nilai tinggi pada area lain tidak dapat menghasilkan rekomendasi siap. Readiness tetap diblokir sampai reassessment membuktikan kemampuan yang aman.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6">
            {[
              {
                title: 'Evidence-Based',
                desc: 'Setiap capaian terhubung dengan bukti praktik yang valid, relevan, cukup, dan dapat ditelusuri ke sumber aslinya.',
                icon: Target
              },
              {
                title: 'Assessment & Remediation',
                desc: 'Gap menghasilkan rencana perbaikan (remediation) dan reassessment—bukan sekadar skor akhir.',
                icon: Activity
              },
              {
                title: 'Capability Passport',
                desc: 'Learning, practice, evidence, assessment, dan readiness bertemu dalam satu rekam jejak longitudinal.',
                icon: Globe
              }
            ].map((feature, i) => (
              <div key={feature.title} className="group flex gap-5 rounded-2xl border border-white/5 bg-white/[0.01] p-6 transition-all hover:bg-white/[0.03] hover:border-white/10">
                <div className="shrink-0 mt-1">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#00c3ff]/10 text-[#00c3ff]">
                    <feature.icon className="h-5 w-5" />
                  </div>
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white mb-2 group-hover:text-[#00c3ff] transition-colors">{feature.title}</h4>
                  <p className="text-sm leading-relaxed text-white/50">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-32 relative text-center border-t border-white/5">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1px] h-20 bg-gradient-to-b from-[#00c3ff]/50 to-transparent"></div>

          <div className="max-w-4xl mx-auto px-4">
            <p className="font-mono text-sm font-bold tracking-[0.25em] text-[#00c3ff] mb-6">CAPABILITY PASSPORT</p>
            <h2 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl text-white leading-[1.1] mb-8">
              Ketahui posisi Anda. <br className="hidden sm:block" />
              Ketahui yang perlu diperbaiki. <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00c3ff] to-white">Ketahui kapan Anda siap.</span>
            </h2>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-white/50 mb-12">
              Capability Passport menjadi output terpadu dari seluruh perjalanan capability—tanpa menghapus percobaan, gap, atau perkembangan sebelumnya.
            </p>

            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link href="/sign-up" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#00c3ff] px-8 py-4 font-bold text-black transition-all hover:scale-105 hover:bg-[#70dcff] hover:shadow-[0_0_30px_rgba(0,195,255,0.3)]">
                Mulai TERAS <ArrowRight className="h-5 w-5" />
              </Link>
              <Link href="/sign-in" className="inline-flex items-center justify-center rounded-lg border border-white/20 bg-transparent px-8 py-4 font-bold text-white transition-all hover:bg-white/10">
                Masuk
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-auto border-t border-white/10 pt-8 pb-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-sm bg-[#00c3ff]/20 border border-[#00c3ff]/50 flex items-center justify-center">
              <div className="h-1.5 w-1.5 bg-[#00c3ff] rounded-full"></div>
            </div>
            <span className="font-mono text-[10px] tracking-[0.2em] text-white/40">TERAS ACADEMY · CAPABILITY WITH EVIDENCE</span>
          </div>

          <div className="font-mono text-[10px] tracking-[0.15em] text-white/30 flex gap-2 flex-wrap justify-center">
            <span>DIAGNOSTIC</span>
            <span className="text-[#00c3ff]/30">→</span>
            <span>LEARNING</span>
            <span className="text-[#00c3ff]/30">→</span>
            <span>PRACTICE</span>
            <span className="text-[#00c3ff]/30">→</span>
            <span>ASSESSMENT</span>
            <span className="text-[#00c3ff]/30">→</span>
            <span className="text-white/60">READINESS</span>
          </div>
        </footer>
      </div>
    </main>
  );
}

function SignInPage() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div>;
}

function SignUpPage() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div>;
}

function ProtectedPageMessage() {
  return (
    <main className="public-theme-surface relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-background px-6 text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(0,195,255,0.15),transparent_35%)]" />
      <div className="relative w-full max-w-xl rounded-2xl border border-border bg-card p-8 text-center shadow-2xl sm:p-12">
        <p className="font-mono text-xs font-bold tracking-[0.22em] text-[#00c3ff]">TERAS ACADEMY</p>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">Masuk untuk melanjutkan ke TERAS</h1>
        <p className="mt-5 leading-7 text-muted-foreground">Journey, Readiness, dan Capability Passport tersedia setelah Anda masuk ke workspace.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/sign-in" className="rounded-lg bg-[#00c3ff] px-6 py-3 font-bold text-black transition hover:bg-[#70dcff]">Masuk</Link>
          <Link href="/" className="rounded-lg border border-border px-6 py-3 font-bold transition hover:border-[#00c3ff]/70">Kembali ke Beranda</Link>
        </div>
      </div>
    </main>
  );
}

function HomeRedirect() {
  const { isLoaded, isSignedIn, user } = useUser();
  const session = useGetCurrentSession({
    query: {
      enabled: Boolean(isSignedIn && user),
      queryKey: getGetCurrentSessionQueryKey(),
      retry: false,
      staleTime: 60_000,
    },
  });

  if (!isLoaded || (isSignedIn && session.isLoading)) {
    return <main className="flex min-h-[100dvh] items-center justify-center bg-background text-foreground"><Activity className="h-8 w-8 animate-pulse text-primary" aria-label="Memeriksa akses" /></main>;
  }
  if (!isSignedIn) return <PublicHome />;
  const destination = homeForRoles(session.data?.roles ?? []);
  if (destination) return <Redirect to={destination} />;
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-6 text-foreground">
      <div className="max-w-lg rounded-2xl border border-amber-500/40 bg-card p-8 text-center shadow-xl">
        <h1 className="text-2xl font-bold">Akses TERAS belum ditetapkan</h1>
        <p className="mt-3 text-muted-foreground">Akun Anda sudah berhasil masuk, tetapi belum memiliki role aktif. Administrator perlu menetapkan role dan enrollment sebelum workspace dapat digunakan.</p>
      </div>
    </main>
  );
}

function WorkspaceRoutes() {
  return (
    <Show when="signed-in">
      <AppLayout>
        <RoutedErrorBoundary>
          <Switch>
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/journey" component={Journey} />
            <Route path="/learning-plan" component={LearningPlan} />
            <Route path="/learning" component={LearningList} />
            <Route path="/learning/courses/:courseId" component={LearningCourse} />
            <Route path="/learning/lessons/:lessonId" component={LearningLesson} />
            <Route path="/programs" component={Programs} />
            <Route path="/programs/:programId" component={ProgramDetail} />
            <Route path="/modules/:moduleId" component={ModuleDetail} />
            <Route path="/practice" component={Practice} />
            <Route path="/evidence" component={Evidence} />
            <Route path="/assessments" component={Assessments} />
            <Route path="/assessments/:assessmentId" component={AssessmentDetail} />
            <Route path="/gaps" component={GapsAndRemediation} />
            <Route path="/remediation" component={GapsAndRemediation} />
            <Route path="/readiness" component={Readiness} />
            <Route path="/passport" component={Passport} />
            <Route path="/trainer" component={TrainerDesk} />
            <Route path="/assessor" component={AssessorDesk} />
            <Route path="/admin" component={Admin} />
            <Route component={NotFound} />
          </Switch>
        </RoutedErrorBoundary>
      </AppLayout>
    </Show>
  );
}

function ProtectedWorkspace() {
  return <><Show when="signed-in"><WorkspaceRoutes /></Show><Show when="signed-out"><ProtectedPageMessage /></Show></>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

type IdentityListener = (userId: UserId) => void;
type RegisterIdentityListener = (listener: IdentityListener) => () => void;

function IdentityScopedQueryClientProvider({ children, register }: { children: ReactNode; register: RegisterIdentityListener }) {
  const [identityRevision, setIdentityRevision] = useState(0);
  const previousUserId = useRef<PreviousUserId>(undefined);

  useEffect(() => register((userId) => {
    if (!hasIdentityChanged(previousUserId.current, userId)) {
      previousUserId.current = userId;
      return;
    }

    queryClient.clear();
    setIdentityRevision(revision => revision + 1);
    previousUserId.current = userId;
  }), [register]);

  return <QueryClientProvider key={identityRevision} client={queryClient}>{children}</QueryClientProvider>;
}

function ClerkIdentityScopedQueryClientProvider({ children }: { children: ReactNode }) {
  const { addListener } = useClerk();
  const register = useCallback(
    (listener: IdentityListener) => addListener(({ user }) => listener(user?.id ?? null)),
    [addListener],
  );
  return <IdentityScopedQueryClientProvider register={register}>{children}</IdentityScopedQueryClientProvider>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to your TERAS capability cockpit' } }, signUp: { start: { title: 'Begin your TERAS journey', subtitle: 'Create your capability workspace' } } }} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
      <ClerkIdentityScopedQueryClientProvider>
        <TooltipProvider>
          <Switch>
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/" component={HomeRedirect} />
            <Route component={ProtectedWorkspace} />
          </Switch>
          <Show when="signed-out">
            <div className="fixed right-4 top-4 z-50 rounded-full border border-border bg-card shadow-lg">
              <ThemeToggle compact />
            </div>
          </Show>
          {/* Assistant knowledge is internal, authenticated workspace content.
              Do not mount this component until Clerk has resolved a signed-in
              session: its chat panel owns the knowledge-query mutation. */}
          <Show when="signed-in">
            <FloatingAssistants />
          </Show>
          <Toaster />
        </TooltipProvider>
      </ClerkIdentityScopedQueryClientProvider>
    </ClerkProvider>
  );
}

function IntegrationTestApp() {
  type TestIdentityState =
    | { status: 'signed-out' }
    | { status: 'signed-in'; userId: string };
  const initialIdentity = (globalThis as typeof globalThis & {
    __TERAS_TEST_IDENTITY__?: TestIdentityState;
  }).__TERAS_TEST_IDENTITY__ ?? { status: 'signed-in', userId: 'integration-admin' };
  const [identity, setIdentity] = useState<TestIdentityState>(initialIdentity);
  const register = useCallback((listener: IdentityListener) => {
    listener(initialIdentity.status === 'signed-in' ? initialIdentity.userId : null);
    const onIdentityChange = (event: Event) => {
      const nextIdentity = (event as CustomEvent<TestIdentityState>).detail;
      listener(nextIdentity.status === 'signed-in' ? nextIdentity.userId : null);
      setIdentity(nextIdentity);
    };
    window.addEventListener('teras:test-identity-change', onIdentityChange);
    return () => window.removeEventListener('teras:test-identity-change', onIdentityChange);
  }, [initialIdentity]);

  return (
    <IdentityScopedQueryClientProvider register={register}>
      <TooltipProvider>
        {identity.status === 'signed-out' ? (
          <PublicHome />
        ) : (
          <main className="min-h-screen bg-background p-6 text-foreground">
            <RoutedErrorBoundary>
              <Switch>
                <Route path="/practice" component={Practice} />
                <Route path="/evidence" component={Evidence} />
                <Route path="/dashboard" component={Dashboard} />
                <Route path="/trainer" component={TrainerDesk} />
                <Route path="/assessor" component={AssessorDesk} />
                <Route path="/admin" component={Admin} />
                <Route component={NotFound} />
              </Switch>
            </RoutedErrorBoundary>
          </main>
        )}
        <Toaster />
      </TooltipProvider>
    </IdentityScopedQueryClientProvider>
  );
}

function App() {
  return <WouterRouter base={basePath}>{integrationTestMode ? <IntegrationTestApp /> : <ClerkProviderWithRoutes />}</WouterRouter>;
}

export default App;