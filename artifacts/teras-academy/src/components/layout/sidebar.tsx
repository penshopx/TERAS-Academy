import * as React from "react";
import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import { cn } from "@/lib/utils";
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

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const { user } = useUser();
  const displayName = user?.fullName || user?.primaryEmailAddress?.emailAddress || "Learner";
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

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
        <div>
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
        </div>

        <div>
          <h2 className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3 px-2">Staff</h2>
          <nav className="space-y-1">
            {STAFF_ITEMS.map((item) => {
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
        </div>

        <div>
            <h2 className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-3 px-2">Administration</h2>
            <nav className="space-y-1">
              <Link
                href="/admin"
                onClick={onNavigate}
                data-testid="link-admin-control-room"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  location.startsWith("/admin")
                    ? "bg-sidebar-accent text-sidebar-accent-foreground border-l-2 border-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <Settings className={cn("w-4 h-4", location.startsWith("/admin") ? "text-primary" : "text-sidebar-foreground/50")} />
                Admin Control Room (akses server)
              </Link>
            </nav>
          </div>
      </div>

      <div className="p-4 border-t border-sidebar-border mt-auto shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs border border-primary/30">
            {initials}
          </div>
          <div>
            <div className="text-sm font-medium text-sidebar-foreground truncate max-w-32">{displayName}</div>
            <button
              type="button"
              onClick={() => signOut({ redirectUrl: import.meta.env.BASE_URL.replace(/\/$/, '') || "/" })}
              className="text-xs text-sidebar-foreground/50 hover:text-primary transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
