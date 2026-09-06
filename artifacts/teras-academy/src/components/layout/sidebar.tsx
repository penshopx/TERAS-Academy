import * as React from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { getGetCurrentSessionQueryKey, useGetCurrentSession } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { 
  Activity, BookOpen, CheckCircle, Target, ListTodo, Map, Award, UserSquare2, Layers, Briefcase, FileSignature, ShieldAlert, Settings
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: Activity },
  { href: "/journey", label: "Journey", icon: Map },
  { href: "/learning-plan", label: "Learning Plan", icon: ListTodo },
  { href: "/learning", label: "Learning", icon: BookOpen },
  { href: "/programs", label: "Programs", icon: Layers },
  { href: "/practice", label: "Practice", icon: Target },
  { href: "/evidence", label: "Evidence", icon: Briefcase },
  { href: "/assessments", label: "Assessments", icon: FileSignature },
  { href: "/gaps", label: "Gaps & Remediation", icon: ShieldAlert },
  { href: "/readiness", label: "Readiness", icon: CheckCircle },
  { href: "/passport", label: "Passport", icon: Award },
];

const STAFF_ITEMS = [
  { href: "/trainer", label: "Trainer Desk", icon: UserSquare2 },
  { href: "/assessor", label: "Assessor Desk", icon: BookOpen },
];

const ADMIN_VIEW_ITEMS = [
  { href: "/dashboard", label: "Learner View", icon: Activity },
  { href: "/trainer", label: "Trainer View", icon: UserSquare2 },
  { href: "/assessor", label: "Assessor View", icon: BookOpen },
  { href: "/admin", label: "Admin Control Room", icon: Settings },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [signOutError, setSignOutError] = React.useState<string | null>(null);
  const session = useGetCurrentSession({
    query: {
      enabled: Boolean(user),
      queryKey: getGetCurrentSessionQueryKey(),
      retry: false,
      staleTime: 60_000,
    },
  });
  const roles = new Set(session.data?.roles ?? []);
  const isSuperAdmin = roles.has("super_admin");
  const isAdmin = isSuperAdmin || roles.has("admin");
  const isLearner = roles.has("learner");
  const isTrainer = roles.has("trainer");
  const isAssessor = roles.has("assessor");
  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Learner";
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      await signOut();
      window.location.replace(`${window.location.origin}${import.meta.env.BASE_URL}`);
    } catch {
      setSignOutError("Logout gagal. Muat ulang halaman lalu coba lagi.");
      setIsSigningOut(false);
    }
  };

  return (
    <div className="w-full lg:w-64 border-r border-sidebar-border bg-sidebar h-full flex flex-col">
      <div className="p-6">
        <h1 className="text-xl font-bold tracking-tight text-primary flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary drop-shadow-[0_0_8px_rgba(0,195,255,0.8)]" />
          TERAS
        </h1>
        <p className="text-xs text-sidebar-foreground/60 font-mono mt-1">CAPABILITY COCKPIT</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-6">
        {session.isLoading && <p className="px-2 text-xs text-sidebar-foreground/60">Memeriksa akses…</p>}
        {session.error && <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-sidebar-foreground"><strong>Akses belum ditetapkan.</strong><p className="mt-1 text-sidebar-foreground/70">Hubungi administrator untuk pemberian role dan enrollment.</p></div>}
        {isLearner && <div>
          <h2 className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3 px-2">Learner</h2>
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(`${item.href}/`));
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary" 
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-sidebar-foreground/50")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>}

        {(isTrainer || isAssessor) && <div>
          <h2 className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3 px-2">Staff</h2>
          <nav className="space-y-1">
            {STAFF_ITEMS.filter(item => item.href === "/trainer" ? isTrainer : isAssessor).map((item) => {
              const Icon = item.icon;
              const isActive = location.startsWith(item.href);
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary" 
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-sidebar-foreground/50")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>}

        {isAdmin && <div>
            <h2 className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3 px-2">{isSuperAdmin ? "Super Administration" : "Administration"}</h2>
            <nav className="space-y-1">
              {ADMIN_VIEW_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === "/dashboard"
                  ? location === item.href
                  : location.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    data-testid={item.href === "/admin" ? "link-admin-control-room" : `link-admin-${item.href.slice(1)}`}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                    )}
                  >
                    <Icon className={cn("w-4 h-4", isActive ? "text-primary" : "text-sidebar-foreground/50")} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>}
      </div>

      <div className="p-4 border-t border-sidebar-border mt-auto shrink-0">
        <div className="mb-3">
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs border border-primary/30">
            {initials}
          </div>
          <div>
            <div className="text-sm font-medium text-sidebar-foreground truncate max-w-32">{displayName}</div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={isSigningOut}
              className="text-xs text-sidebar-foreground/50 hover:text-primary transition-colors disabled:cursor-wait disabled:opacity-60"
            >
              {isSigningOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
        {signOutError && <p className="mt-2 text-xs text-destructive" role="alert">{signOutError}</p>}
      </div>
    </div>
  );
}
