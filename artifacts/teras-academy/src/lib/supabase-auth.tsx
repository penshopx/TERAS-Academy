import { createClient, type Session, type User } from "@supabase/supabase-js";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

const integrationTestMode = import.meta.env.MODE === "test" && import.meta.env.VITE_INTEGRATION_TEST_MODE === "true";
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if ((!url || !anonKey) && !integrationTestMode) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env file");
}

// The test harness never mounts this provider; inert values only keep its
// isolated identity-routing tests free of external configuration.
export const supabase = createClient(url ?? "https://test.invalid", anonKey ?? "test-anon-key", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: "pkce",
  },
});

let initialSessionPromise: Promise<Session | null> | null = null;
async function freshAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;
  const expiresAtMs = (session.expires_at ?? 0) * 1000;
  if (expiresAtMs > Date.now() + 30_000) return session.access_token;
  const refreshed = await supabase.auth.refreshSession();
  return refreshed.data.session?.access_token ?? null;
}

function initialSession() {
  if (initialSessionPromise) return initialSessionPromise;
  initialSessionPromise = (async () => {
    const currentUrl = new URL(window.location.href);
    const code = currentUrl.searchParams.get("code");
    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        currentUrl.searchParams.delete("code");
        window.history.replaceState({}, "", `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`);
        return data.session;
      }
    }
    const { data } = await supabase.auth.getSession();
    return data.session;
  })();
  return initialSessionPromise;
}

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isLoaded: boolean;
  signOut: () => Promise<{ error: Error | null }>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setAuthTokenGetter(freshAccessToken);
    void initialSession().then(nextSession => {
      setSession(nextSession);
      setIsLoaded(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoaded(true);
    });
    return () => {
      subscription.subscription.unsubscribe();
      setAuthTokenGetter(null);
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    isLoaded,
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      return { error: error ?? null };
    },
  }), [session, isLoaded]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSupabaseAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useSupabaseAuth must be used inside SupabaseAuthProvider");
  return value;
}