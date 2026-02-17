// ============================================================================
// Rate limiting en memoria por organización
// ============================================================================

import { Response, NextFunction } from 'express';
import { env } from '../config/env';
import type { AuthenticatedRequest } from './auth';

interface RateLimitEntry {
  count: number;
  resetAt: number; // epoch ms
}

const store = new Map<string, RateLimitEntry>();

// Limpieza periódica de entradas expiradas (cada 5 minutos)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000).unref(); // .unref() para no bloquear el proceso al cerrar

/**
 * Middleware de rate limiting por organización.
 * Debe ejecutarse DESPUÉS de authMiddleware (necesita organizationId).
 *
 * Headers de respuesta:
 *   X-RateLimit-Limit: máximo de requests por ventana
 *   X-RateLimit-Remaining: requests restantes
 *   X-RateLimit-Reset: timestamp de reset (epoch seconds)
 */
export function rateLimitMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const key = req.organizationId;
  if (!key) {
    // Si no hay organizationId (no debería pasar si auth middleware corrió), dejar pasar
    next();
    return;
  }

  const windowMs = env.RATE_LIMIT_WINDOW_MS;
  const maxRequests = env.RATE_LIMIT_MAX_REQUESTS;
  const now = Date.now();

  let entry = store.get(key);

  // Crear o resetear ventana si expiró
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;

  const remaining = Math.max(0, maxRequests - entry.count);
  const resetSeconds = Math.ceil(entry.resetAt / 1000);

  // Headers informativos
  res.setHeader('X-RateLimit-Limit', maxRequests);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', resetSeconds);

  if (entry.count > maxRequests) {
    res.status(429).json({
      error: 'Demasiadas solicitudes',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
    });
    return;
  }

  next();
}
