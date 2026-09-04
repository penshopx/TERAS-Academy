import { Router, type IRouter } from "express";
import healthRouter from "./health";
import programsRouter from "./programs";
import learnerRouter from "./learner";
import assessorRouter from "./assessor";
import trainerRouter from "./trainer";
import learningRouter from "./learning";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(programsRouter);
router.use(learnerRouter);
router.use(assessorRouter);
router.use(trainerRouter);
router.use(learningRouter);
router.use(adminRouter);

export default router;
