// ============================================================================
// Logging de requests HTTP
// ============================================================================

import { Request, Response, NextFunction } from 'express';

/**
 * Middleware que registra cada request con método, URL, status, duración
 * y organizationId si el request está autenticado.
 */
export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const orgId = (req as unknown as Record<string, unknown>).organizationId ?? '-';
    const line = [
      `[${new Date().toISOString()}]`,
      req.method,
      req.originalUrl,
      res.statusCode,
      `${duration}ms`,
      `org:${orgId}`,
    ].join(' ');

    // Usar warn para errores del servidor, info para el resto
    if (res.statusCode >= 500) {
      console.error(line);
    } else {
      console.log(line);
    }
  });

  next();
}
