// ============================================================================
// Tests del servicio de documentos (pipeline de emisión)
//
// Se mockean: Supabase, signing, validators, storage, DGI, CUFE
// ============================================================================

import type { FacturaElectronica, ValidationResult } from '../../src/types';
import type { DocumentRecord, EmitResponse } from '../../src/types/api';

// --- Mocks ---

// Mock de Supabase
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();
const mockOrder = jest.fn();
const mockLimit = jest.fn();
const mockGte = jest.fn();
const mockLte = jest.fn();
const mockLt = jest.fn();
const mockUpload = jest.fn();
const mockDownload = jest.fn();

// Helper para encadenar los métodos de Supabase (estilo fluent)
// Supabase usa un builder pattern donde todos methods return the chain (thenable),
// and the query resolves when awaited (via .then()).
function buildChain(finalData: unknown, finalError: unknown = null) {
  const resolve = () => ({ data: finalData, error: finalError });

  const chain: Record<string, jest.Mock | ((onfulfilled: (v: unknown) => unknown) => unknown)> = {};

  chain.select = jest.fn().mockReturnValue(chain);
  chain.insert = jest.fn().mockReturnValue(chain);
  chain.update = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.single = jest.fn().mockReturnValue(resolve());
  chain.order = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.gte = jest.fn().mockReturnValue(chain);
  chain.lte = jest.fn().mockReturnValue(chain);
  chain.lt = jest.fn().mockReturnValue(chain);

  // Make chain thenable (await chain → resolve)
  chain.then = (onfulfilled: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onfulfilled);

  return chain;
}

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

jest.mock('../../src/validators/document-validator', () => ({
  validateDocument: jest.fn(),
}));

jest.mock('../../src/validators', () => ({
  facturaElectronicaSchema: {
    safeParse: jest.fn(),
  },
}));

jest.mock('../../src/signing/xml-signer', () => ({
  signXml: jest.fn(),
  verifyXmlSignature: jest.fn(),
  pacSignDocument: jest.fn(),
  loadP12: jest.fn(),
  loadPemFiles: jest.fn(),
}));

jest.mock('../../src/cufe/cufe-generator', () => ({
  generateCufe: jest.fn().mockReturnValue('FE0100000000000000000000000000000020250115000000010001010200000000001'),
}));

jest.mock('../../src/utils', () => ({
  parseXml: jest.fn(),
  buildXml: jest.fn().mockReturnValue('<rFE>mock</rFE>'),
}));

jest.mock('../../src/dgi', () => ({
  sendDocument: jest.fn().mockRejectedValue(new Error('Not implemented: sendDocument')),
}));

jest.mock('../../src/services/storage-service', () => ({
  storeSignedXml: jest.fn().mockResolvedValue('org-id/2025/01/cufe.xml'),
  retrieveSignedXml: jest.fn().mockResolvedValue('<xml>signed</xml>'),
  storeCafePdf: jest.fn().mockResolvedValue('org-id/2025/01/cufe.pdf'),
}));

jest.mock('../../src/services/pdf-service', () => ({
  generateCafePdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')),
}));

// --- Imports (DESPUÉS de los mocks) ---

import { supabase } from '../../src/config/supabase';
import { validateDocument } from '../../src/validators/document-validator';
import { facturaElectronicaSchema } from '../../src/validators';
import {
  signXml,
  verifyXmlSignature,
  pacSignDocument,
  loadPemFiles,
} from '../../src/signing/xml-signer';
import { parseXml } from '../../src/utils';
import {
  emitFromXml,
  emitFromJson,
  getDocumentById,
  listDocuments,
  cancelDocument,
  getDocumentPdf,
} from '../../src/services/document-service';

// --- Datos de prueba ---

const MOCK_ORG_ID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_DOC_ID = '660e8400-e29b-41d4-a716-446655440001';
const MOCK_CUFE = 'FE01200000000000000000000000000000002025011500000001000101020000000001';

const createMockDocument = (): FacturaElectronica => ({
  dVerForm: '1.00',
  dId: MOCK_CUFE,
  gDGen: {
    iAmb: '2',
    iTpEmis: '01',
    iDoc: '01',
    dNroDF: '0000000001',
    dPtoFacDF: '001',
    dSeg: '000000001',
    dFechaEm: '2025-01-15T10:30:00-05:00',
    iNatOp: '01',
    iTipoOp: '1',
    iDest: '1',
    iFormCAFE: '1',
    iEntCAFE: '1',
    dEnvFE: '1',
    iProGen: '1',
    gEmis: {
      gRucEmi: { dTipoRuc: '2', dRuc: '155-1234567-2-00', dDV: '00' },
      dNombEm: 'Empresa Test S.A.',
      dSucEm: '0001',
      dCoordEm: '+8.9,-79.5',
      dDirecEm: 'Calle 50, Panama',
      gUbiEm: { dCodUbi: '8-1-1', dCorreg: 'Bella Vista', dDistr: 'Panama', dProv: 'Panama' },
    },
    gDatRec: {
      iTipoRec: '01',
      gRucRec: { dTipoRuc: '2', dRuc: '155-9876543-2-00', dDV: '01' },
      dNombRec: 'Cliente Test S.A.',
      cPaisRec: 'PA',
    },
  },
  gItem: [
    {
      dSecItem: 1,
      dDescProd: 'Producto Test',
      dCantCodInt: 1,
      gPrecios: { dPrUnit: 100, dPrItem: 100, dValTotItem: 100 },
      gITBMSItem: { dTasaITBMS: '01', dValITBMS: 7 },
    },
  ],
  gTot: {
    dTotNeto: 100,
    dTotITBMS: 7,
    dTotGravado: 100,
    dVTot: 107,
    dTotRec: 107,
    iPzPag: '1',
    dNroItems: 1,
    dVTotItems: 100,
    gFormaPago: [{ iFormaPago: '02', dVlrCuota: 107 }],
  },
});

const createMockRecord = (overrides: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: MOCK_DOC_ID,
  cufe: MOCK_CUFE,
  organization_id: MOCK_ORG_ID,
  doc_type: '01',
  emitter_ruc: '155-1234567-2-00',
  emitter_name: 'Empresa Test S.A.',
  receiver_ruc: '155-9876543-2-00',
  receiver_name: 'Cliente Test S.A.',
  emission_date: '2025-01-15T10:30:00-05:00',
  total_amount: 107,
  total_tax: 7,
  currency: 'USD',
  status: 'signed',
  xml_storage_path: 'org-id/2025/01/cufe.xml',
  pdf_storage_path: null,
  authorization_code: null,
  dgi_response: null,
  validation_warnings: [],
  environment: 'sandbox',
  cancelled_reason: null,
  cancelled_at: null,
  created_at: '2025-01-15T10:30:00Z',
  updated_at: '2025-01-15T10:30:00Z',
  ...overrides,
});

// --- Helpers ---

function setupSupabaseFrom(responses: Array<{ data: unknown; error: unknown }>) {
  let callIndex = 0;
  (supabase.from as jest.Mock).mockImplementation(() => {
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return buildChain(resp.data, resp.error);
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('document-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Setup defaults para que loadPemFiles funcione
    (loadPemFiles as jest.Mock).mockReturnValue({
      privateKeyPem: 'mock-key',
      certificatePem: 'mock-cert',
      chain: [],
    });
  });

  afterEach(() => {
    // Run and clear any pending timers (queueDgiSubmission uses setTimeout)
    jest.runAllTimers();
    jest.useRealTimers();
  });

  // ======================================================================
  // emitFromXml
  // ======================================================================

  describe('emitFromXml', () => {
    it('debería emitir un documento XML exitosamente', async () => {
      const mockDoc = createMockDocument();
      const mockRecord = createMockRecord();

      // Setup mocks
      (parseXml as jest.Mock).mockReturnValue({ rFE: mockDoc });
      (validateDocument as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
      });
      (verifyXmlSignature as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
      (pacSignDocument as jest.Mock).mockReturnValue({ signedXml: '<xml>pac-signed</xml>' });

      setupSupabaseFrom([
        { data: mockRecord, error: null }, // insert
      ]);

      const result = await emitFromXml('<xml>signed-by-emitter</xml>', MOCK_ORG_ID);

      expect(result).toBeDefined();
      expect(result.cufe).toBe(MOCK_CUFE);
      expect(result.status).toBe('signed');
      expect(result.documentId).toBe(MOCK_DOC_ID);
      expect(parseXml).toHaveBeenCalledWith('<xml>signed-by-emitter</xml>');
      expect(validateDocument).toHaveBeenCalledWith(mockDoc);
      expect(verifyXmlSignature).toHaveBeenCalledWith('<xml>signed-by-emitter</xml>');
      expect(pacSignDocument).toHaveBeenCalled();
    });

    it('debería lanzar ValidationError si el XML no contiene rFE', async () => {
      (parseXml as jest.Mock).mockReturnValue({ otherElement: {} });

      await expect(emitFromXml('<xml>bad</xml>', MOCK_ORG_ID)).rejects.toThrow(
        'XML no contiene elemento rFE',
      );
    });

    it('debería lanzar ValidationError si la validación de negocio falla', async () => {
      const mockDoc = createMockDocument();
      (parseXml as jest.Mock).mockReturnValue({ rFE: mockDoc });
      (validateDocument as jest.Mock).mockReturnValue({
        isValid: false,
        errors: [{ code: 'E001', message: 'Error', field: 'test', severity: 'ERROR' }],
        warnings: [],
      });

      await expect(emitFromXml('<xml>signed</xml>', MOCK_ORG_ID)).rejects.toThrow(
        'Documento no cumple las reglas de validación',
      );
    });

    it('debería lanzar ValidationError si la firma del emisor es inválida', async () => {
      const mockDoc = createMockDocument();
      (parseXml as jest.Mock).mockReturnValue({ rFE: mockDoc });
      (validateDocument as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
      });
      (verifyXmlSignature as jest.Mock).mockReturnValue({
        isValid: false,
        errors: ['Firma inválida'],
      });

      await expect(emitFromXml('<xml>bad-sig</xml>', MOCK_ORG_ID)).rejects.toThrow(
        'Firma del emisor inválida',
      );
    });

    it('debería incluir warnings en la respuesta', async () => {
      const mockDoc = createMockDocument();
      const mockRecord = createMockRecord();
      const warnings = [
        { code: 'W001', message: 'Advertencia', field: 'gDGen.iAmb', severity: 'WARNING' as const },
      ];

      (parseXml as jest.Mock).mockReturnValue({ rFE: mockDoc });
      (validateDocument as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        warnings,
      });
      (verifyXmlSignature as jest.Mock).mockReturnValue({ isValid: true, errors: [] });
      (pacSignDocument as jest.Mock).mockReturnValue({ signedXml: '<xml>signed</xml>' });

      setupSupabaseFrom([{ data: mockRecord, error: null }]);

      const result = await emitFromXml('<xml>ok</xml>', MOCK_ORG_ID);
      expect(result.warnings).toEqual(warnings);
    });
  });

  // ======================================================================
  // emitFromJson
  // ======================================================================

  describe('emitFromJson', () => {
    it('debería emitir un documento JSON exitosamente', async () => {
      const mockDoc = createMockDocument();
      delete (mockDoc as Partial<FacturaElectronica>).dId; // Sin CUFE
      const mockRecord = createMockRecord();

      (facturaElectronicaSchema.safeParse as jest.Mock).mockReturnValue({
        success: true,
        data: mockDoc,
      });
      (validateDocument as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
      });
      (signXml as jest.Mock).mockReturnValue({ signedXml: '<xml>pac-signed</xml>' });

      setupSupabaseFrom([{ data: mockRecord, error: null }]);

      const result = await emitFromJson(mockDoc, MOCK_ORG_ID);

      expect(result).toBeDefined();
      expect(result.status).toBe('signed');
      expect(result.documentId).toBe(MOCK_DOC_ID);
      expect(signXml).toHaveBeenCalled(); // PAC firma directamente
    });

    it('debería lanzar ValidationError si Zod falla', async () => {
      const mockDoc = createMockDocument();

      (facturaElectronicaSchema.safeParse as jest.Mock).mockReturnValue({
        success: false,
        error: { flatten: () => ({ fieldErrors: { dId: ['Requerido'] } }) },
      });

      await expect(emitFromJson(mockDoc, MOCK_ORG_ID)).rejects.toThrow(
        'Documento JSON no cumple el schema',
      );
    });

    it('debería generar CUFE si no se proporciona dId', async () => {
      const mockDoc = createMockDocument();
      mockDoc.dId = ''; // Vacío
      const mockRecord = createMockRecord();

      (facturaElectronicaSchema.safeParse as jest.Mock).mockReturnValue({
        success: true,
        data: mockDoc,
      });
      (validateDocument as jest.Mock).mockReturnValue({
        isValid: true,
        errors: [],
        warnings: [],
      });
      (signXml as jest.Mock).mockReturnValue({ signedXml: '<xml>signed</xml>' });

      setupSupabaseFrom([{ data: mockRecord, error: null }]);

      const { generateCufe } = require('../../src/cufe/cufe-generator');
      await emitFromJson(mockDoc, MOCK_ORG_ID);

      expect(generateCufe).toHaveBeenCalled();
    });
  });

  // ======================================================================
  // getDocumentById
  // ======================================================================

  describe('getDocumentById', () => {
    it('debería retornar el documento si existe', async () => {
      const mockRecord = createMockRecord();
      setupSupabaseFrom([{ data: mockRecord, error: null }]);

      const result = await getDocumentById(MOCK_DOC_ID, MOCK_ORG_ID);

      expect(result).toBeDefined();
      expect(result!.id).toBe(MOCK_DOC_ID);
      expect(result!.cufe).toBe(MOCK_CUFE);
      expect(result!.docType).toBe('01'); // Camel case en la respuesta
      expect(result!.emitterRuc).toBe('155-1234567-2-00');
    });

    it('debería retornar null si no existe', async () => {
      setupSupabaseFrom([{ data: null, error: { message: 'Not found' } }]);

      const result = await getDocumentById('nonexistent', MOCK_ORG_ID);
      expect(result).toBeNull();
    });

    it('debería incluir todos los campos en la respuesta', async () => {
      const mockRecord = createMockRecord({
        authorization_code: 'AUTH-123',
        dgi_response: { status: 'accepted' },
        validation_warnings: [
          { code: 'W001', message: 'Warn', field: 'test', severity: 'WARNING' },
        ],
      });

      setupSupabaseFrom([{ data: mockRecord, error: null }]);

      const result = await getDocumentById(MOCK_DOC_ID, MOCK_ORG_ID);

      expect(result!.authorizationCode).toBe('AUTH-123');
      expect(result!.dgiResponse).toEqual({ status: 'accepted' });
      expect(result!.validationWarnings).toHaveLength(1);
      expect(result!.environment).toBe('sandbox');
    });
  });

  // ======================================================================
  // listDocuments
  // ======================================================================

  describe('listDocuments', () => {
    it('debería listar documentos con paginación', async () => {
      const records = Array.from({ length: 3 }, (_, i) =>
        createMockRecord({ id: `doc-${i}`, created_at: `2025-01-1${5 + i}T10:00:00Z` }),
      );

      (supabase.from as jest.Mock).mockImplementation(() => buildChain(records));

      const result = await listDocuments(MOCK_ORG_ID, { limit: 20 });

      expect(result.data).toHaveLength(3);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.cursor).toBeNull();
    });

    it('debería retornar hasMore=true cuando hay más documentos', async () => {
      // limit=2 + 1 extra = 3 registros retornados → hasMore=true
      const records = Array.from({ length: 3 }, (_, i) =>
        createMockRecord({ id: `doc-${i}`, created_at: `2025-01-1${5 + i}T10:00:00Z` }),
      );

      (supabase.from as jest.Mock).mockImplementation(() => buildChain(records));

      const result = await listDocuments(MOCK_ORG_ID, { limit: 2 });

      expect(result.data).toHaveLength(2); // Solo retorna 2 (sin el extra)
      expect(result.pagination.hasMore).toBe(true);
      expect(result.pagination.cursor).toBe('doc-1'); // Último visible
    });

    it('debería aplicar filtro de status', async () => {
      (supabase.from as jest.Mock).mockImplementation(() => buildChain([]));

      await listDocuments(MOCK_ORG_ID, { status: 'accepted', limit: 20 });

      // Verificar que se llamó eq con 'status'
      const fromCall = (supabase.from as jest.Mock).mock.results[0].value;
      expect(fromCall.eq).toHaveBeenCalledWith('status', 'accepted');
    });

    it('debería manejar lista vacía', async () => {
      (supabase.from as jest.Mock).mockImplementation(() => buildChain([]));

      const result = await listDocuments(MOCK_ORG_ID, { limit: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.pagination.hasMore).toBe(false);
    });
  });

  // ======================================================================
  // cancelDocument
  // ======================================================================

  describe('cancelDocument', () => {
    it('debería anular un documento aceptado', async () => {
      const mockRecord = createMockRecord({ status: 'accepted' });
      const cancelledRecord = createMockRecord({
        status: 'cancelled',
        cancelled_reason: 'Error en los datos del receptor',
        cancelled_at: '2025-01-16T10:00:00Z',
      });

      let callIndex = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        const data = callIndex === 0 ? mockRecord : cancelledRecord;
        callIndex++;
        return buildChain(data);
      });

      const result = await cancelDocument(
        MOCK_DOC_ID,
        MOCK_ORG_ID,
        'Error en los datos del receptor',
      );

      expect(result.status).toBe('cancelled');
    });

    it('debería anular un documento firmado', async () => {
      const mockRecord = createMockRecord({ status: 'signed' });
      const cancelledRecord = createMockRecord({ status: 'cancelled' });

      let callIndex = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        const data = callIndex === 0 ? mockRecord : cancelledRecord;
        callIndex++;
        return buildChain(data);
      });

      const result = await cancelDocument(MOCK_DOC_ID, MOCK_ORG_ID, 'Motivo de prueba largo');

      expect(result.status).toBe('cancelled');
    });

    it('debería lanzar NotFoundError si el documento no existe', async () => {
      setupSupabaseFrom([{ data: null, error: { message: 'Not found' } }]);

      await expect(
        cancelDocument('nonexistent', MOCK_ORG_ID, 'Motivo de prueba'),
      ).rejects.toThrow('Documento no encontrado');
    });

    it('debería lanzar ConflictError si el documento ya está anulado', async () => {
      const mockRecord = createMockRecord({ status: 'cancelled' });
      setupSupabaseFrom([{ data: mockRecord, error: null }]);

      await expect(
        cancelDocument(MOCK_DOC_ID, MOCK_ORG_ID, 'Intentar anular de nuevo'),
      ).rejects.toThrow('El documento ya está anulado');
    });

    it('debería lanzar ConflictError si el status no permite anulación', async () => {
      const mockRecord = createMockRecord({ status: 'received' });
      setupSupabaseFrom([{ data: mockRecord, error: null }]);

      await expect(
        cancelDocument(MOCK_DOC_ID, MOCK_ORG_ID, 'No se puede anular recibido'),
      ).rejects.toThrow('No se puede anular un documento en estado "received"');
    });
  });

  // ======================================================================
  // getDocumentPdf
  // ======================================================================

  describe('getDocumentPdf', () => {
    it('debería generar PDF si no existe en storage', async () => {
      const mockRecord = createMockRecord({ pdf_storage_path: null });

      // Primera llamada: buscar documento. Segunda: update pdf_storage_path
      let callIndex = 0;
      (supabase.from as jest.Mock).mockImplementation(() => {
        const data = callIndex === 0 ? mockRecord : mockRecord;
        callIndex++;
        return buildChain(data);
      });

      const result = await getDocumentPdf(MOCK_DOC_ID, MOCK_ORG_ID);

      expect(result).toBeInstanceOf(Buffer);
      const { generateCafePdf } = require('../../src/services/pdf-service');
      expect(generateCafePdf).toHaveBeenCalledWith(mockRecord);
    });

    it('debería lanzar NotFoundError si el documento no existe', async () => {
      setupSupabaseFrom([{ data: null, error: { message: 'Not found' } }]);

      await expect(getDocumentPdf('nonexistent', MOCK_ORG_ID)).rejects.toThrow(
        'Documento no encontrado',
      );
    });
  });
});
