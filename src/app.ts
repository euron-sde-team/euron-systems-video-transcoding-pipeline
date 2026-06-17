import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { xss } from "express-xss-sanitizer";
import helmet from "helmet";
import { notFound } from "./controllers/health.controller";
import { globalHandler } from "./middlewares/error-handler.middleware";
import rootRouter from "./routes/index.route";
import { asyncHandler } from "./utils/asynchandler";

const app: Express = express();
app.set("trust proxy", true);

// Manual CORS, the key endpoint is fetched cross-origin by the browser player,
// and the management API by other Euron backends. `?token=` carries the playback
// token so no custom header is needed for the key fetch.
const corsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Tenant-Id, X-Service-Key"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
};
app.use(corsMiddleware);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use(
  helmet({
    contentSecurityPolicy: false, // JSON API; no HTML served from here
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(xss());

app.use("/api", rootRouter);

// 404 + global error handler (must be last; 4-arg signature)
app.use(asyncHandler(notFound));
app.use((data: unknown, req: Request, res: Response, next: NextFunction) => {
  globalHandler(data, req, res, next);
});

export default app;
