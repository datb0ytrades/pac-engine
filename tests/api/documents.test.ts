// ============================================================================
// Tests de los endpoints REST de documentos
//
// Usa supertest para testear las rutas Express.
// Se mockean: Supabase, signing, validators, storage, DGI, CUFE, auth
// ============================================================================

import express from 'express';
import request from 'supertest';

// --- Mocks (antes de importar los módulos) ---

// Mock Supabase
jest.mock('../../src/config/supabase', () => {
  const fromMock = jest.fn();
  const storageMock = {
    from: jest.fn().mockReturnValue({
      upload: jest.fn().mockResolvedValue({ error: null }),
      download: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
    }),
  };
  return {
    supabase: {
      from: fromMock,
      storage: storageMock,
    },
  };
});

jest.mock('../../src/config/env', () => ({
  env: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_KEY: 'test-service-key',
    SUPABASE_ANON_KEY: 'test-anon-key',
    DGI_ENVIRONMENT: 'sandbox',
    SIGNING_CERT_PATH: '/tmp/test-cert.pem',
    SIGNING_KEY_PATH: '/tmp/test-key.pem',
    SIGNING_P12_PATH: undefined,
    SIGNING_P12_PASSWORD: undefined,
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX_REQUESTS: 100,
    PORT: 3000,
    NODE_ENV: 'test',
  },
}));

// Mock el document-service directamente (no testear pipeline, solo endpoints)
jest.mock('../../src/services/document-service');

// Mock auth middleware para inyectar organizationId directamente
jest.mock('../../src/middleware/auth', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as Record<string, unknown>).organizationId = 'org-test-id';
    (req as unknown as Record<string, unknown>).userId = 'user-test-id';
    next();
  },
}));

// Mock rate-limit middleware (pasar directamente)
jest.mock('../../src/middleware/rate-limit', () => ({
  rateLimitMiddleware: (_req: express.Request, _res: express.Response, next: express.NextFunction) => {
    next();
  },
}));

// --- Imports ---

import {
  emitFromXml,
  emitFromJson,
  getDocumentById,
  listDocuments,
  cancelDocument,
  getDocumentPdf,
} from '../../src/services/document-service';
import { errorHandlerMiddleware } from '../../src/middleware/error-handler';
import { ValidationError, NotFoundError, ConflictError } from '../../src/middleware/error-handler';
import documentsRouter from '../../src/api/v1/documents';

// --- App de test ---

function createTestApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(express.text({ type: 'application/xml', limit: '5mb' }));

  // Inyectar organizationId como haría authMiddleware
  app.use((req, _res, next) => {
    (req as unknown as Record<string, unknown>).organizationId = 'org-test-id';
    (req as unknown as Record<string, unknown>).userId = 'user-test-id';
    next();
  });

  app.use('/documents', documentsRouter);
  app.use(errorHandlerMiddleware);
  return app;
}

// --- Datos de prueba ---

const MOCK_EMIT_RESPONSE = {
  cufe: 'FE01200000000000000000000000000000002025011500000001000101020000000001',
  status: 'signed',
  authorizationCode: null,
  warnings: [],
  documentId: 'doc-uuid-123',
};

const MOCK_DOCUMENT_DETAIL = {
  id: 'doc-uuid-123',
  cufe: 'FE01200000000000000000000000000000002025011500000001000101020000000001',
  docType: '01',
  emitterRuc: '155-1234567-2-00',
  emitterName: 'Empresa Test S.A.',
  receiverRuc: '155-9876543-2-00',
  receiverName: 'Cliente Test S.A.',
  emissionDate: '2025-01-15T10:30:00-05:00',
  totalAmount: 107,
  totalTax: 7,
  currency: 'USD',
  status: 'signed',
  authorizationCode: null,
  dgiResponse: null,
  validationWarnings: [],
  environment: 'sandbox',
  createdAt: '2025-01-15T10:30:00Z',
  updatedAt: '2025-01-15T10:30:00Z',
};

// ============================================================================
// Tests
// ============================================================================

describe('API /documents', () => {
  let app: express.Express;

  beforeAll(() => {
    app = createTestApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ======================================================================
  // POST /documents/emit
  // ======================================================================

  describe('POST /documents/emit', () => {
    it('debería emitir un documento XML (201)', async () => {
      (emitFromXml as jest.Mock).mockResolvedValue(MOCK_EMIT_RESPONSE);

      const res = await request(app)
        .post('/documents/emit')
        .send({ xml: '<rFE>' + 'x'.repeat(50) + '</rFE>' })
        .expect(201);

      expect(res.body.cufe).toBeDefined();
      expect(res.body.status).toBe('signed');
      expect(res.body.documentId).toBe('doc-uuid-123');
      expect(emitFromXml).toHaveBeenCalledTimes(1);
    });

    it('debería retornar 400 si falta el campo xml', async () => {
      const res = await request(app)
        .post('/documents/emit')
        .send({})
        .expect(400);

      expect(res.body.error).toContain('inválidos');
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('debería retornar 400 si el xml es muy corto', async () => {
      const res = await request(app)
        .post('/documents/emit')
        .send({ xml: '<short>' })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('debería propagar errores del servicio', async () => {
      (emitFromXml as jest.Mock).mockRejectedValue(
        new ValidationError('Firma del emisor inválida'),
      );

      const res = await request(app)
        .post('/documents/emit')
        .send({ xml: '<rFE>' + 'x'.repeat(50) + '</rFE>' })
        .expect(400);

      expect(res.body.error).toContain('Firma del emisor inválida');
    });
  });

  // ======================================================================
  // POST /documents/emit-json
  // ======================================================================

  describe('POST /documents/emit-json', () => {
    it('debería emitir un documento JSON (201)', async () => {
      (emitFromJson as jest.Mock).mockResolvedValue(MOCK_EMIT_RESPONSE);

      const res = await request(app)
        .post('/documents/emit-json')
        .send({ document: { dVerForm: '1.00' } })
        .expect(201);

      expect(res.body.cufe).toBeDefined();
      expect(res.body.status).toBe('signed');
      expect(emitFromJson).toHaveBeenCalledTimes(1);
    });

    it('debería retornar 400 si falta el campo document', async () => {
      const res = await request(app)
        .post('/documents/emit-json')
        .send({})
        .expect(400);

      expect(res.body.error).toContain('document');
    });

    it('debería propagar ValidationError del servicio', async () => {
      (emitFromJson as jest.Mock).mockRejectedValue(
        new ValidationError('Documento JSON no cumple el schema', {
          errors: { dId: ['Requerido'] },
        }),
      );

      const res = await request(app)
        .post('/documents/emit-json')
        .send({ document: {} })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toBeDefined();
    });
  });

  // ======================================================================
  // GET /documents/:id
  // ======================================================================

  describe('GET /documents/:id', () => {
    it('debería retornar un documento por ID (200)', async () => {
      (getDocumentById as jest.Mock).mockResolvedValue(MOCK_DOCUMENT_DETAIL);

      const res = await request(app)
        .get('/documents/doc-uuid-123')
        .expect(200);

      expect(res.body.id).toBe('doc-uuid-123');
      expect(res.body.cufe).toBeDefined();
      expect(res.body.emitterRuc).toBe('155-1234567-2-00');
    });

    it('debería retornar 404 si no existe', async () => {
      (getDocumentById as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .get('/documents/nonexistent-id')
        .expect(404);

      expect(res.body.error).toContain('no encontrado');
    });
  });

  // ======================================================================
  // GET /documents
  // ======================================================================

  describe('GET /documents', () => {
    it('debería listar documentos (200)', async () => {
      (listDocuments as jest.Mock).mockResolvedValue({
        data: [MOCK_DOCUMENT_DETAIL],
        pagination: { cursor: null, hasMore: false, limit: 20 },
      });

      const res = await request(app)
        .get('/documents')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.hasMore).toBe(false);
    });

    it('debería aceptar filtros válidos', async () => {
      (listDocuments as jest.Mock).mockResolvedValue({
        data: [],
        pagination: { cursor: null, hasMore: false, limit: 10 },
      });

      const res = await request(app)
        .get('/documents?status=accepted&docType=01&limit=10')
        .expect(200);

      expect(listDocuments).toHaveBeenCalledWith('org-test-id', expect.objectContaining({
        status: 'accepted',
        docType: '01',
        limit: 10,
      }));
    });

    it('debería retornar 400 para status inválido', async () => {
      const res = await request(app)
        .get('/documents?status=invalid_status')
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('debería retornar 400 para limit fuera de rango', async () => {
      const res = await request(app)
        .get('/documents?limit=500')
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('debería retornar lista vacía sin error', async () => {
      (listDocuments as jest.Mock).mockResolvedValue({
        data: [],
        pagination: { cursor: null, hasMore: false, limit: 20 },
      });

      const res = await request(app)
        .get('/documents')
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });
  });

  // ======================================================================
  // POST /documents/:id/cancel
  // ======================================================================

  describe('POST /documents/:id/cancel', () => {
    it('debería anular un documento (200)', async () => {
      const cancelledDoc = { ...MOCK_DOCUMENT_DETAIL, status: 'cancelled' };
      (cancelDocument as jest.Mock).mockResolvedValue(cancelledDoc);

      const res = await request(app)
        .post('/documents/doc-uuid-123/cancel')
        .send({ reason: 'Error en los datos del receptor del documento' })
        .expect(200);

      expect(res.body.status).toBe('cancelled');
      expect(cancelDocument).toHaveBeenCalledWith(
        'doc-uuid-123',
        'org-test-id',
        'Error en los datos del receptor del documento',
      );
    });

    it('debería retornar 400 si el motivo es muy corto', async () => {
      const res = await request(app)
        .post('/documents/doc-uuid-123/cancel')
        .send({ reason: 'corto' })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('debería retornar 400 si falta el motivo', async () => {
      const res = await request(app)
        .post('/documents/doc-uuid-123/cancel')
        .send({})
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('debería retornar 404 si el documento no existe', async () => {
      (cancelDocument as jest.Mock).mockRejectedValue(
        new NotFoundError('Documento no encontrado'),
      );

      const res = await request(app)
        .post('/documents/nonexistent/cancel')
        .send({ reason: 'Motivo de prueba suficientemente largo' })
        .expect(404);

      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('debería retornar 409 si el documento ya está anulado', async () => {
      (cancelDocument as jest.Mock).mockRejectedValue(
        new ConflictError('El documento ya está anulado'),
      );

      const res = await request(app)
        .post('/documents/doc-uuid-123/cancel')
        .send({ reason: 'Intentar anular de nuevo' })
        .expect(409);

      expect(res.body.code).toBe('CONFLICT');
    });
  });

  // ======================================================================
  // GET /documents/:id/pdf
  // ======================================================================

  describe('GET /documents/:id/pdf', () => {
    it('debería retornar PDF (200)', async () => {
      const pdfContent = Buffer.from('%PDF-1.4 mock content');
      (getDocumentPdf as jest.Mock).mockResolvedValue(pdfContent);

      const res = await request(app)
        .get('/documents/doc-uuid-123/pdf')
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toContain('CAFE-doc-uuid-123.pdf');
    });

    it('debería retornar 404 si el documento no existe', async () => {
      (getDocumentPdf as jest.Mock).mockRejectedValue(
        new NotFoundError('Documento no encontrado'),
      );

      const res = await request(app)
        .get('/documents/nonexistent/pdf')
        .expect(404);

      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  // ======================================================================
  // Error handler
  // ======================================================================

  describe('Error handler', () => {
    it('debería manejar errores internos como 500', async () => {
      (getDocumentById as jest.Mock).mockRejectedValue(new Error('DB connection failed'));

      const res = await request(app)
        .get('/documents/doc-uuid-123')
        .expect(500);

      expect(res.body.error).toContain('Error interno');
      expect(res.body.code).toBe('INTERNAL_ERROR');
    });
  });
});
