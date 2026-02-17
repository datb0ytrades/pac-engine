// ============================================================================
// Autenticación JWT via Supabase
// ============================================================================

import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

/**
 * Extiende el Request de Express con la identidad autenticada.
 * El organizationId es el user.id de Supabase (cada usuario = organización).
 */
export interface AuthenticatedRequest extends Request {
  organizationId: string;
  userId: string;
}

// Cliente Supabase con anon key para verificación de JWT
// (el service key ya da acceso total, necesitamos verificar el token del usuario)
const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

/**
 * Middleware que verifica el JWT de Supabase.
 * Extrae el Bearer token del header Authorization,
 * lo verifica con supabase.auth.getUser(),
 * y adjunta organizationId/userId al request.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No autorizado', code: 'MISSING_TOKEN' });
      return;
    }

    const token = authHeader.substring(7); // "Bearer ".length

    const { data, error } = await supabaseAuth.auth.getUser(token);

    if (error || !data.user) {
      res.status(401).json({ error: 'Token inválido o expirado', code: 'INVALID_TOKEN' });
      return;
    }

    // Adjuntar identidad al request
    (req as AuthenticatedRequest).organizationId = data.user.id;
    (req as AuthenticatedRequest).userId = data.user.id;

    next();
  } catch {
    res.status(401).json({ error: 'Error de autenticación', code: 'AUTH_ERROR' });
  }
}
