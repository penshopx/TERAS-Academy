import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "dark" ? "terang" : "gelap";

  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? "icon" : "default"}
      onClick={toggleTheme}
      aria-label={`Aktifkan mode ${nextTheme}`}
      title={`Aktifkan mode ${nextTheme}`}
      className={cn(
        "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        !compact && "w-full justify-start gap-3",
      )}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {!compact && <span>{theme === "dark" ? "Mode terang" : "Mode gelap"}</span>}
    </Button>
  );
}