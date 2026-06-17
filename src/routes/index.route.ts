import { Router } from "express";
import { health } from "../controllers/health.controller";
import { asyncHandler } from "../utils/asynchandler";
import videosRouter from "./videos.route";

const router = Router();

router.get("/v1/health", asyncHandler(health));
router.use("/v1/videos", videosRouter);

export default router;
