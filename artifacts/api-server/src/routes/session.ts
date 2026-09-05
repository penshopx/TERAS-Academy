import { Router, type IRouter } from "express";
import { GetCurrentSessionResponse } from "@workspace/api-zod";
import { authorizeCurrentSession } from "../lib/authorization";

const router: IRouter = Router();

router.get("/session", async (req, res): Promise<void> => {
  const session = await authorizeCurrentSession(req, res);
  if (!session) return;
  res.json(GetCurrentSessionResponse.parse(session));
});

export default router;