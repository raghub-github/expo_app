import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import fp from "fastify-plugin";

/**
 * Global Error Handler
 * Provides consistent error responses and logging
 */
async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.id;
    const { method, url } = request;

    // Log error
    app.log.error({
      requestId,
      method,
      url,
      error: {
        message: error.message,
        stack: error.stack,
        code: error.code,
        statusCode: error.statusCode,
      },
    }, "Request error");

    // Handle Zod validation errors
    if (error.validation || error instanceof ZodError) {
      const zodError = error instanceof ZodError ? error : null;
      const validationErrors = zodError?.errors || error.validation || [];

      return reply.status(400).send({
        error: "validation_error",
        message: "Invalid request data",
        requestId,
        details: validationErrors.map((err: any) => ({
          path: err.path || err.params?.missingProperty || "unknown",
          message: err.message || "Invalid value",
        })),
      });
    }

    // Handle authentication errors
    if (error.statusCode === 401) {
      return reply.status(401).send({
        error: "unauthorized",
        message: error.message || "Authentication required",
        requestId,
      });
    }

    // Handle authorization errors
    if (error.statusCode === 403) {
      return reply.status(403).send({
        error: "forbidden",
        message: error.message || "Access denied",
        requestId,
      });
    }

    // Handle not found errors
    if (error.statusCode === 404) {
      return reply.status(404).send({
        error: "not_found",
        message: error.message || "Resource not found",
        requestId,
      });
    }

    // Handle rate limit errors
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: "rate_limit_exceeded",
        message: "Too many requests. Please try again later.",
        requestId,
      });
    }

    // Handle database errors (don't expose internal details)
    if (error.message?.includes("database") || error.message?.includes("connection")) {
      app.log.error({ error: error.message, stack: error.stack }, "Database error");
      return reply.status(500).send({
        error: "database_error",
        message: "A database error occurred. Please try again later.",
        requestId,
      });
    }

    // Default error response
    const statusCode = error.statusCode || 500;
    const isDevelopment = process.env.NODE_ENV === "development";

    return reply.status(statusCode).send({
      error: error.name || "internal_error",
      message: isDevelopment ? error.message : "An internal error occurred",
      requestId,
      ...(isDevelopment && { stack: error.stack }),
    });
  });

  // Handle 404 for undefined routes
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send({
      error: "not_found",
      message: `Route ${request.method} ${request.url} not found`,
      requestId: request.id,
    });
  });
}

export const errorHandler = fp(errorHandlerPlugin, { name: "errorHandler" });

