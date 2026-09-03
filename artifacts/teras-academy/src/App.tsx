import { type ReactNode, useEffect, useRef } from 'react';
import { ClerkProvider, Show, SignIn, SignUp, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
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
    <main className="min-h-[100dvh] bg-background text-foreground overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/15 via-background to-background" />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-6 py-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <img src={`${basePath}/logo.svg`} alt="TERAS Academy" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/sign-in" className="text-sm font-semibold text-foreground hover:text-primary">Sign in</Link>
            <Link href="/sign-up" className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90">Create account</Link>
          </div>
        </header>
        <section className="flex flex-1 flex-col justify-center py-20 max-w-3xl">
          <p className="font-mono text-sm font-bold tracking-[0.2em] text-primary">CAPABILITY COCKPIT</p>
          <h1 className="mt-6 text-5xl font-extrabold tracking-tight sm:text-7xl">Build proof. <span className="text-primary">Show readiness.</span></h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">TERAS Academy turns learning into visible capability—bringing your programs, practice, evidence, and assessments into one focused workspace.</p>
          <div className="mt-10 flex flex-wrap gap-4">
            <Link href="/sign-up" className="rounded-md bg-primary px-6 py-3 font-bold text-primary-foreground hover:bg-primary/90">Start your journey</Link>
            <Link href="/sign-in" className="rounded-md border border-border bg-card px-6 py-3 font-bold hover:border-primary hover:text-primary">Sign in to TERAS</Link>
          </div>
        </section>
        <footer className="font-mono text-xs text-muted-foreground">TERAS ACADEMY · LEARNING WITH EVIDENCE</footer>
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