import express, { type Express, type Request } from "express";
import router from "./routes";
import {
  testAuthorizationIdentity,
  type TestAuthorizationIdentity,
} from "./lib/authorization";
import { logger } from "./lib/logger";

export type IntegrationResponseControl = {
  /** Observes a completed route response inside the test process only. */
  afterCommit?: (request: Request, body: unknown) => void;
  /**
   * Returning true leaves this response pending after the route has completed
   * its database work. The browser harness can then reload and cancel it.
   */
  holdResponseAfterCommit?: (request: Request, body: unknown) => boolean;
  /**
   * Returning true destroys this response after the route has completed its
   * database work, but before a response body is sent to the browser.
   */
  dropResponseAfterCommit?: (request: Request, body: unknown) => boolean;
};

/**
 * A test-only app composition root.  Test identities are injected by the
 * caller and stored under a module-private Symbol, never read from headers.
 */
export function createIntegrationTestApp(
  resolveIdentity: (request: Request) => TestAuthorizationIdentity,
  responseControl: IntegrationResponseControl = {},
): Express {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("createIntegrationTestApp is only available when NODE_ENV=test");
  }
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as Request & { [testAuthorizationIdentity]: TestAuthorizationIdentity })[
      testAuthorizationIdentity
    ] = resolveIdentity(req);
    Object.assign(req, { log: logger });
    next();
  });
  app.use((req, res, next) => {
    const json = res.json.bind(res);
    res.json = ((body: unknown) => {
      responseControl.afterCommit?.(req, body);
      if (responseControl.holdResponseAfterCommit?.(req, body)) {
        return res;
      }
      if (responseControl.dropResponseAfterCommit?.(req, body)) {
        // Route handlers call json only after their awaited transaction has
        // committed.  Destroying here simulates a post-commit network loss.
        res.destroy();
        return res;
      }
      return json(body);
    }) as typeof res.json;
    next();
  });
  app.use("/api", router);
  return app;
}