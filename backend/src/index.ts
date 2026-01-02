import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "fastify-type-provider-zod";
import { ulid } from "ulid";
import { loadEnv } from "./config/loadEnv.js";
import { getEnv } from "./config/env.js";
import { healthRoutes } from "./routes/health.routes.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { riderRoutes } from "./modules/rider/rider.routes.js";
import { onboardingRoutes } from "./modules/onboarding/onboarding.routes.js";
import { storageRoutes } from "./modules/storage/storage.routes.js";
import { paymentRoutes } from "./modules/payment/payment.routes.js";
import { errorHandler } from "./plugins/errorHandler.js";
import { requestLogger } from "./plugins/requestLogger.js";

loadEnv();
const env = getEnv();

// Configure logger - use pino-pretty only in development if available
let loggerConfig: any = {
  level: env.NODE_ENV === "production" ? "info" : "debug",
  requestIdLogLabel: "requestId",
};

// Only use pino-pretty in development if available
if (env.NODE_ENV !== "production") {
  try {
    // Try to import pino-pretty - if it fails, use default logger
    await import("pino-pretty");
    loggerConfig.transport = {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    };
  } catch {
    // pino-pretty not available, use default logger
    loggerConfig.prettyPrint = false;
  }
}

const app = Fastify({
  logger: loggerConfig,
  requestIdLogLabel: "requestId",
  genReqId: () => ulid(),
}).withTypeProvider<ZodTypeProvider>();

// Tell Fastify how to compile Zod schemas for validation + serialization.
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// Register plugins
await app.register(errorHandler);
await app.register(requestLogger);
await app.register(helmet, { global: true });
await app.register(cors, {
  origin: true,
  credentials: true,
  maxAge: 86400,
});

await app.register(rateLimit, {
  max: env.NODE_ENV === "production" ? 600 : 2000,
  timeWindow: "1 minute",
  errorResponseBuilder: (request, context) => {
    return {
      error: "rate_limit_exceeded",
      message: `Rate limit exceeded. Max ${context.max} requests per ${context.timeWindow}.`,
      requestId: request.id,
      retryAfter: Math.ceil(context.ttl / 1000),
    };
  },
});

await app.register(swagger, {
  openapi: {
    info: {
      title: "GatiMitra API",
      version: "v1",
    },
    servers: [{ url: env.API_BASE_URL ?? "http://localhost:3000" }],
  },
});

await app.register(swaggerUi, {
  routePrefix: "/docs",
});

await app.register(healthRoutes, { prefix: "/v1" });
await app.register(authRoutes, { prefix: "/v1/auth" });
await app.register(riderRoutes, { prefix: "/v1/rider" });
await app.register(onboardingRoutes, { prefix: "/v1/onboarding" });
await app.register(storageRoutes, { prefix: "/v1/storage" });
await app.register(paymentRoutes, { prefix: "/v1/payment" });

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  app.log.info({ signal }, "Received shutdown signal, closing server");
  
  try {
    await app.close();
    app.log.info("Server closed successfully");
    process.exit(0);
  } catch (error) {
    app.log.error({ error }, "Error during shutdown");
    process.exit(1);
  }
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  // Use `err` key so pino prints stack/message reliably.
  app.log.error({ err: error as any }, "Uncaught exception");
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason, promise) => {
  app.log.error({ reason, promise }, "Unhandled rejection");
  gracefulShutdown("unhandledRejection");
});

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info({ port: env.PORT, env: env.NODE_ENV }, "Server started successfully");
} catch (error) {
  app.log.error({ error }, "Failed to start server");
  process.exit(1);
}


