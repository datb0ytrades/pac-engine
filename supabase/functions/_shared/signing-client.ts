// ============================================================================
// Cliente HTTP para el microservicio de firma XAdES-BES
// Las Edge Functions de Deno no pueden usar xml-crypto/node-forge directamente,
// así que delegan la firma a un microservicio Node.js separado.
// ============================================================================

export interface SignResponse {
  signedXml: string;
}

export interface VerifyResponse {
  isValid: boolean;
  errors: string[];
}

/**
 * Obtiene la URL y secreto del signing service desde variables de entorno.
 */
function getSigningConfig(): { url: string; secret: string } {
  const url = Deno.env.get('SIGNING_SERVICE_URL');
  const secret = Deno.env.get('SIGNING_SERVICE_SECRET');

  if (!url || !secret) {
    throw new Error(
      'SIGNING_SERVICE_URL y SIGNING_SERVICE_SECRET deben estar configurados. ' +
      'Ejecute: supabase secrets set SIGNING_SERVICE_URL=... SIGNING_SERVICE_SECRET=...'
    );
  }

  return { url, secret };
}

/**
 * Envía un XML al microservicio de firma para que lo firme con XAdES-BES.
 *
 * @param xml - Documento XML a firmar
 * @param documentId - ID del documento (usado como URI de referencia)
 * @returns El XML firmado
 */
export async function signXmlRemote(
  xml: string,
  documentId: string,
): Promise<string> {
  const { url, secret } = getSigningConfig();

  const response = await fetch(`${url}/sign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signing-Secret': secret,
    },
    body: JSON.stringify({ xml, documentId }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Signing service error (${response.status}): ${errorBody}`);
  }

  const result: SignResponse = await response.json();
  return result.signedXml;
}

/**
 * Envía un XML firmado al microservicio para verificar su firma.
 *
 * @param xml - Documento XML firmado a verificar
 * @returns Resultado de la verificación
 */
export async function verifyXmlRemote(xml: string): Promise<VerifyResponse> {
  const { url, secret } = getSigningConfig();

  const response = await fetch(`${url}/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Signing-Secret': secret,
    },
    body: JSON.stringify({ xml }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Signing service error (${response.status}): ${errorBody}`);
  }

  return await response.json();
}
