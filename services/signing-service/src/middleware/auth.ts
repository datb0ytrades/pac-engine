// ============================================================================
// Autenticación por secreto compartido (X-Signing-Secret header)
// ============================================================================

import { Request, Response, NextFunction } from 'express';

/**
 * Middleware que verifica el header X-Signing-Secret.
 * Solo las Edge Functions y servicios autorizados conocen este secreto.
 */
export function signingSecretAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const secret = process.env.SIGNING_SERVICE_SECRET;

  if (!secret) {
    console.error('[AUTH] SIGNING_SERVICE_SECRET no configurado');
    res.status(500).json({ error: 'Servicio mal configurado' });
    return;
  }

  const provided = req.headers['x-signing-secret'] as string | undefined;

  if (!provided || provided !== secret) {
    res.status(401).json({ error: 'No autorizado', code: 'INVALID_SECRET' });
    return;
  }

  next();
}
