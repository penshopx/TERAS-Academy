/**
 * The only allow-list for demo data and unauthenticated demo access.
 *
 * Values deliberately use exact matches: an unset, misspelled, or otherwise
 * unknown environment is never eligible for demo behaviour.
 */
export type DemoAccessEnvironment = {
  NODE_ENV?: string;
  REPLIT_DEPLOYMENT?: string;
  TERAS_ENABLE_DEMO_ACCESS?: string;
  TERAS_ENABLE_DEMO_FIXTURES?: string;
};

export function isProductionLike(environment: DemoAccessEnvironment = process.env): boolean {
  return environment.NODE_ENV === "production" || environment.REPLIT_DEPLOYMENT === "1";
}

export function isSafeDemoMode(environment: DemoAccessEnvironment = process.env): boolean {
  return !isProductionLike(environment)
    && (environment.NODE_ENV === "development" || environment.NODE_ENV === "test");
}

/** Allows unauthenticated access to seeded demo identities. */
export function allowsDemoAccess(environment: DemoAccessEnvironment = process.env): boolean {
  return environment.TERAS_ENABLE_DEMO_ACCESS === "1" && isSafeDemoMode(environment);
}

/** Allows the seed command to create demo-only fixture records. */
export function allowsDemoFixtures(environment: DemoAccessEnvironment = process.env): boolean {
  return environment.TERAS_ENABLE_DEMO_FIXTURES === "1" && isSafeDemoMode(environment);
}