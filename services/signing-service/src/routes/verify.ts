// ============================================================================
// POST /verify — Verifica la firma XAdES-BES de un XML
//
// Request:  { xml: string }
// Response: { isValid: boolean, errors: string[] }
// ============================================================================

import { Router, Request, Response } from 'express';
import { verifyXmlSignature } from '../signing/xml-signer';

export const verifyRouter = Router();

verifyRouter.post('/', (async (req: Request, res: Response) => {
  try {
    const { xml } = req.body;

    if (!xml || typeof xml !== 'string') {
      res.status(400).json({ error: 'Se requiere "xml" como string' });
      return;
    }

    const result = verifyXmlSignature(xml);

    res.json({
      isValid: result.isValid,
      errors: result.errors,
    });
  } catch (err) {
    console.error('[VERIFY ERROR]', (err as Error).message);
    res.status(500).json({
      error: 'Error al verificar la firma',
      message: (err as Error).message,
    });
  }
}) as import('express').RequestHandler);
