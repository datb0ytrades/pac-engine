// ============================================================================
// Manejo global de errores para la API REST del PAC
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

// --- Clases de error HTTP ---

export class ApiHttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

export class ValidationError extends ApiHttpError {
  constructor(message: string, details?: unknown) {
    super(400, message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApiHttpError {
  constructor(message = 'Recurso no encontrado') {
    super(404, message, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends ApiHttpError {
  constructor(message = 'No autorizado') {
    super(401, message, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ConflictError extends ApiHttpError {
  constructor(message: string) {
    super(409, message, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class TooManyRequestsError extends ApiHttpError {
  constructor(message = 'Demasiadas solicitudes') {
    super(429, message, 'RATE_LIMIT_EXCEEDED');
    this.name = 'TooManyRequestsError';
  }
}

// --- Middleware de manejo global de errores ---

export function errorHandlerMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ApiHttpError) {
    const body: Record<string, unknown> = {
      error: err.message,
      code: err.code,
    };
    if (err.details) body.details = err.details;
    res.status(err.statusCode).json(body);
    return;
  }

  // Error no esperado
  console.error('[ERROR]', err.message, err.stack);

  const body: Record<string, unknown> = {
    error: 'Error interno del servidor',
    code: 'INTERNAL_ERROR',
  };

  if (env.NODE_ENV === 'development') {
    body.message = err.message;
    body.stack = err.stack;
  }

  res.status(500).json(body);
}
