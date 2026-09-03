import { type ReactNode, useEffect, useRef } from 'react';
import { ClerkProvider, Show, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BadgeCheck, Route as RouteIcon, ShieldCheck } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { AppLayout } from '@/components/layout/app-layout';

import Dashboard from '@/pages/dashboard';
import Journey from '@/pages/journey';
import LearningPlan from '@/pages/learning-plan';
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

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
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
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_22%,rgba(0,195,255,0.18),transparent_30%),linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:auto,64px_64px,64px_64px]" />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-7xl flex-col px-6 py-7 lg:px-10">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3" aria-label="TERAS Academy">
            <span className="text-2xl font-extrabold tracking-[0.18em] text-[#00c3ff]">TERAS</span>
            <span className="border-l border-white/20 pl-3 text-[10px] font-bold uppercase leading-tight tracking-[0.2em] text-white/60">Capability<br />Academy</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-sm font-semibold text-white/75 transition hover:text-white">Masuk</Link>
            <Link href="/sign-up" className="rounded-lg bg-[#00c3ff] px-4 py-2.5 text-sm font-bold text-black transition hover:bg-[#70dcff]">Mulai TERAS</Link>
          </div>
        </header>
        <section className="grid flex-1 items-center gap-14 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <div className="max-w-3xl">
            <p className="font-mono text-xs font-bold tracking-[0.24em] text-[#00c3ff]">EVIDENCE-BASED CAPABILITY DEVELOPMENT</p>
            <h1 className="mt-6 text-5xl font-extrabold leading-[0.98] tracking-[-0.045em] sm:text-7xl">
              Belajar hingga
              <span className="mt-2 block text-[#00c3ff]">siap dibuktikan.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-white/65">
              TERAS menghubungkan pembelajaran, praktik, evidence, assessment, dan remediation menjadi readiness yang dapat dipercaya.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/sign-up" className="inline-flex items-center gap-2 rounded-lg bg-[#00c3ff] px-6 py-3.5 font-bold text-black transition hover:bg-[#70dcff]">
                Mulai perjalanan <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/sign-in" className="rounded-lg border border-white/20 bg-white/5 px-6 py-3.5 font-bold text-white transition hover:border-[#00c3ff]/70 hover:bg-white/10">Masuk ke workspace</Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-white/55">
              <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#00c3ff]" /> Safety gate tidak dapat dilewati</span>
              <span className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-[#00c3ff]" /> Histori evidence terjaga</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-8 rounded-full bg-[#00c3ff]/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-[#0b0d0e]/95 p-5 shadow-2xl shadow-black">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <p className="font-mono text-[10px] tracking-[0.2em] text-[#00c3ff]">READINESS COCKPIT</p>
                  <p className="mt-1 font-bold">Solar PV Technician</p>
                </div>
                <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-300">Needs reassessment</span>
              </div>
              <div className="grid gap-3 py-5 sm:grid-cols-3">
                {[['82%', 'Learning'], ['7', 'Evidence'], ['1', 'Critical gap']].map(([value, label]) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                    <p className="text-2xl font-extrabold text-white">{value}</p>
                    <p className="mt-1 text-xs text-white/45">{label}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-red-400/20 bg-red-400/[0.06] p-4">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-red-300" />
                  <div className="flex-1">
                    <p className="text-sm font-bold">Critical safety gate</p>
                    <p className="mt-1 text-xs text-white/45">M03 · Electrical isolation</p>
                  </div>
                  <span className="font-mono text-xs font-bold text-red-300">BLOCKED</span>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl border border-[#00c3ff]/20 bg-[#00c3ff]/[0.06] p-4">
                <div className="flex items-center gap-3">
                  <RouteIcon className="h-5 w-5 text-[#00c3ff]" />
                  <div>
                    <p className="text-sm font-bold">Capability Passport</p>
                    <p className="text-xs text-white/45">Riwayat kemampuan longitudinal</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-[#00c3ff]" />
              </div>
            </div>
          </div>
        </section>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 font-mono text-[10px] tracking-[0.15em] text-white/35">
          <span>TERAS ACADEMY · CAPABILITY WITH EVIDENCE</span>
          <span>DIAGNOSTIC → LEARNING → PRACTICE → ASSESSMENT → READINESS</span>
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

function HomeRedirect() {
  return <><Show when="signed-in"><Redirect to="/dashboard" /></Show><Show when="signed-out"><PublicHome /></Show></>;
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
            <Route component={NotFound} />
          </Switch>
        </RoutedErrorBoundary>
      </AppLayout>
    </Show>
  );
}

function ProtectedWorkspace() {
  return <><Show when="signed-in"><WorkspaceRoutes /></Show><Show when="signed-out"><Redirect to="/" /></Show></>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const cache = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => addListener(({ user }) => {
    const userId = user?.id ?? null;
    if (previousUserId.current !== undefined && previousUserId.current !== userId) cache.clear();
    previousUserId.current = userId;
  }), [addListener, cache]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to your TERAS capability cockpit' } }, signUp: { start: { title: 'Begin your TERAS journey', subtitle: 'Create your capability workspace' } } }} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}>
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <Switch>
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/" component={HomeRedirect} />
            <Route component={ProtectedWorkspace} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return <WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter>;
}

export default App;