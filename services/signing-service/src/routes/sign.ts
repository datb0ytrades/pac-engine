// ============================================================================
// POST /sign — Firma un XML con XAdES-BES usando el certificado del PAC
//
// Request:  { xml: string, documentId: string }
// Response: { signedXml: string }
//
// Carga las credenciales del PAC desde SIGNING_P12_BASE64 + SIGNING_P12_PASSWORD
// ============================================================================

import { Router, Request, Response } from 'express';
import {
  signXml,
  pacSignDocument,
  loadP12,
  type P12Credentials,
} from '../signing/xml-signer';

export const signRouter = Router();

// Cache de credenciales a nivel de módulo
let cachedCreds: P12Credentials | null = null;

function loadCredentials(): P12Credentials {
  if (cachedCreds) return cachedCreds;

  const p12Base64 = process.env.SIGNING_P12_BASE64;
  const p12Password = process.env.SIGNING_P12_PASSWORD;

  if (!p12Base64 || !p12Password) {
    throw new Error(
      'SIGNING_P12_BASE64 y SIGNING_P12_PASSWORD deben estar configurados',
    );
  }

  const p12Buffer = Buffer.from(p12Base64, 'base64');
  cachedCreds = loadP12(p12Buffer, p12Password);
  return cachedCreds;
}

signRouter.post('/', (async (req: Request, res: Response) => {
  try {
    const { xml, documentId } = req.body;

    if (!xml || typeof xml !== 'string') {
      res.status(400).json({ error: 'Se requiere "xml" como string' });
      return;
    }

    if (!documentId || typeof documentId !== 'string') {
      res.status(400).json({ error: 'Se requiere "documentId" como string' });
      return;
    }

    const creds = loadCredentials();

    // Intentar firma PAC completa (verifica firma existente + agrega firma PAC)
    // Si falla la verificación, firma directamente (modo JSON sin firma del emisor)
    let signedXml: string;

    try {
      const result = pacSignDocument(xml, creds, { documentId });
      signedXml = result.signedXml;
    } catch {
      // Si no hay firma previa del emisor, firmar directamente
      const result = signXml(xml, creds, { documentId });
      signedXml = result.signedXml;
    }

    res.json({ signedXml });
  } catch (err) {
    console.error('[SIGN ERROR]', (err as Error).message);
    res.status(500).json({
      error: 'Error al firmar el documento',
      message: (err as Error).message,
    });
  }
}) as import('express').RequestHandler);
