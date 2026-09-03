import express, { type Express, type Request } from "express";
import router from "./routes";
import {
  testAuthorizationIdentity,
  type TestAuthorizationIdentity,
} from "./lib/authorization";
import { logger } from "./lib/logger";

/**
 * A test-only app composition root.  Test identities are injected by the
 * caller and stored under a module-private Symbol, never read from headers.
 */
export function createIntegrationTestApp(
  resolveIdentity: (request: Request) => TestAuthorizationIdentity,
): Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request & { [testAuthorizationIdentity]: TestAuthorizationIdentity })[
      testAuthorizationIdentity
    ] = resolveIdentity(req);
    Object.assign(req, { log: logger });
    next();
  });
  app.use("/api", router);
  return app;
}