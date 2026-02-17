// ============================================================================
// Endpoints REST para documentos fiscales electrónicos
// ============================================================================

import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../middleware/auth';
import {
  emitFromXml,
  emitFromJson,
  getDocumentById,
  listDocuments,
  cancelDocument,
  getDocumentPdf,
} from '../../services/document-service';
import { ValidationError, NotFoundError } from '../../middleware/error-handler';

const router = Router();

// --- Schemas de validación de entrada ---

const emitXmlSchema = z.object({
  xml: z.string().min(50, 'XML requerido (mínimo 50 caracteres)'),
});

const cancelSchema = z.object({
  reason: z
    .string()
    .min(10, 'Motivo de anulación debe tener al menos 10 caracteres')
    .max(500, 'Motivo de anulación no puede exceder 500 caracteres'),
});

const listFiltersSchema = z.object({
  status: z
    .enum([
      'received', 'validated', 'signed', 'sent_to_dgi',
      'accepted', 'rejected', 'cancelled', 'error',
    ])
    .optional(),
  docType: z
    .enum(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'])
    .optional(),
  emitterRuc: z.string().max(20).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Helper: obtener organizationId del request autenticado
function getOrgId(req: Request): string {
  return (req as AuthenticatedRequest).organizationId;
}

// ============================================================================
// POST /api/v1/documents/emit
// Recibe XML firmado por el emisor → pipeline completo
// ============================================================================

router.post('/emit', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = emitXmlSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Datos de entrada inválidos', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await emitFromXml(parsed.data.xml, getOrgId(req));
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

// ============================================================================
// POST /api/v1/documents/emit-json
// Recibe documento como JSON → genera XML, firma, pipeline completo
// ============================================================================

router.post('/emit-json', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body;

    if (!body || !body.document) {
      throw new ValidationError('Se requiere el campo "document"');
    }

    const result = await emitFromJson(body.document, getOrgId(req));
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

// ============================================================================
// GET /api/v1/documents/:id
// Obtiene un documento por ID
// ============================================================================

router.get('/:id', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    // Evitar que rutas como /emit o /emit-json caigan aquí
    if (['emit', 'emit-json'].includes(id)) {
      next();
      return;
    }

    const document = await getDocumentById(id, getOrgId(req));

    if (!document) {
      throw new NotFoundError('Documento no encontrado');
    }

    res.json(document);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

// ============================================================================
// GET /api/v1/documents
// Lista documentos con filtros y paginación por cursor
// ============================================================================

router.get('/', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = listFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ValidationError('Filtros inválidos', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await listDocuments(getOrgId(req), parsed.data);
    res.json(result);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

// ============================================================================
// POST /api/v1/documents/:id/cancel
// Anula un documento
// ============================================================================

router.post('/:id/cancel', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = cancelSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Datos de anulación inválidos', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const id = req.params.id as string;
    const result = await cancelDocument(id, getOrgId(req), parsed.data.reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

// ============================================================================
// GET /api/v1/documents/:id/pdf
// Genera y retorna el CAFE en PDF
// ============================================================================

router.get('/:id/pdf', (async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    const pdfBuffer = await getDocumentPdf(id, getOrgId(req));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="CAFE-${id}.pdf"`,
    );
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}) as RequestHandler);

export default router;
