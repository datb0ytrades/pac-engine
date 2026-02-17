// ============================================================================
// Autenticación JWT para Edge Functions
// Verifica el Bearer token con supabase.auth.getUser()
// ============================================================================

import { createAnonClient } from './supabase.ts';
import { UnauthorizedError } from './errors.ts';

export interface AuthResult {
  organizationId: string;
  userId: string;
}

/**
 * Verifica el JWT del header Authorization y retorna la identidad.
 * El organizationId es el user.id de Supabase (cada usuario = organización).
 *
 * @throws UnauthorizedError si el token es inválido o no está presente
 */
export async function verifyAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token no proporcionado');
  }

  const token = authHeader.substring(7); // "Bearer ".length

  const supabase = createAnonClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw new UnauthorizedError('Token inválido o expirado');
  }

  return {
    organizationId: data.user.id,
    userId: data.user.id,
  };
}
