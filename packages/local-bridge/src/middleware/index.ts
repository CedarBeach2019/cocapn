/**
 * Middleware — composable request/response pipeline for the bridge.
 *
 * Usage:
 *   import { MiddlewarePipeline, cors, timing, logging, errorHandler } from "../middleware/index.js";
 *
 *   const pipeline = new MiddlewarePipeline();
 *   pipeline.use(errorHandler());
 *   pipeline.use(cors());
 *   pipeline.use(timing());
 *   pipeline.use(logging());
 *
 *   const response = await pipeline.execute(request, clientIp);
 */

// Core
export { MiddlewarePipeline } from "./pipeline.js";
export type { Middleware, MiddlewareContext } from "./types.js";

// Built-in middleware
export { auth, type AuthOptions } from "./auth.js";
export { rateLimit, type RateLimitMiddlewareOptions } from "./rate-limit.js";
export { logging, type LoggingOptions } from "./logging.js";
export { timing, type TimingOptions } from "./timing.js";
export { cors, type CorsOptions } from "./cors.js";
export { errorHandler } from "./error-handler.js";
export { modeSwitcher, type ModeSwitcherOptions, type AgentMode, type AccessScope } from "./mode-switcher.js";
export { piiFilter } from "./pii-filter.js";
