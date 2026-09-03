import { ReactNode, useEffect, useState } from "react";
import { Sidebar } from "./sidebar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu, Activity } from "lucide-react";

export function AppLayout({ children }: { children: ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <div className="flex h-[100dvh] w-full bg-background text-foreground overflow-hidden selection:bg-primary/30">
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <main className="flex-1 overflow-y-auto overflow-x-hidden relative flex flex-col">
        <div className="lg:hidden flex items-center p-4 border-b border-border bg-sidebar shrink-0 sticky top-0 z-40">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden text-primary">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72 border-r-border bg-sidebar">
              <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="ml-3 font-bold tracking-tight text-primary flex items-center gap-2">
            <Activity className="w-5 h-5 drop-shadow-[0_0_8px_rgba(0,195,255,0.8)]" />
            TERAS
          </div>
        </div>

        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />

        <div className="relative z-10 p-4 md:p-6 lg:p-8 w-full max-w-7xl mx-auto flex flex-col flex-1">
          {children}
        </div>
      </main>
    </div>
  );
}
