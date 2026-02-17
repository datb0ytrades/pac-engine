// ============================================================================
// Tests del servicio de generación de PDF CAFE
// ============================================================================

import type { DocumentRecord } from '../../src/types/api';
import { generateCafePdf } from '../../src/services/pdf-service';

const createMockRecord = (overrides: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: 'doc-uuid-123',
  cufe: 'FE01200000000000000000000000000000002025011500000001000101020000000001',
  organization_id: 'org-uuid-123',
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
  xml_storage_path: 'org/2025/01/cufe.xml',
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

describe('pdf-service', () => {
  describe('generateCafePdf', () => {
    it('debería generar un Buffer con contenido PDF válido', async () => {
      const record = createMockRecord();
      const pdf = await generateCafePdf(record);

      expect(pdf).toBeInstanceOf(Buffer);
      expect(pdf.length).toBeGreaterThan(0);

      // Verificar header PDF
      const header = pdf.toString('binary', 0, 9);
      expect(header).toBe('%PDF-1.4\n');
    });

    it('debería contener el trailer y %%EOF', async () => {
      const record = createMockRecord();
      const pdf = await generateCafePdf(record);
      const content = pdf.toString('binary');

      expect(content).toContain('%%EOF');
      expect(content).toContain('trailer');
      expect(content).toContain('startxref');
    });

    it('debería incluir los datos del emisor en el contenido', async () => {
      const record = createMockRecord();
      const pdf = await generateCafePdf(record);
      const content = pdf.toString('binary');

      expect(content).toContain('155-1234567-2-00');
      expect(content).toContain('Empresa Test S.A.');
    });

    it('debería incluir el CUFE', async () => {
      const record = createMockRecord();
      const pdf = await generateCafePdf(record);
      const content = pdf.toString('binary');

      expect(content).toContain(record.cufe);
    });

    it('debería incluir los montos', async () => {
      const record = createMockRecord();
      const pdf = await generateCafePdf(record);
      const content = pdf.toString('binary');

      expect(content).toContain('107.00');
      expect(content).toContain('7.00');
      expect(content).toContain('100.00'); // Subtotal = 107 - 7
    });

    it('debería manejar documento sin receptor', async () => {
      const record = createMockRecord({
        receiver_ruc: null,
        receiver_name: null,
      });

      const pdf = await generateCafePdf(record);
      const content = pdf.toString('binary');

      expect(content).toContain('N/A');
      expect(content).toContain('Consumidor Final');
    });

    it('debería mostrar el tipo de documento legible', async () => {
      const record = createMockRecord({ doc_type: '03' });
      const pdf = await generateCafePdf(record);
      const content = pdf.toString('binary');

      expect(content).toContain('Factura de Exportacion');
    });

    it('debería mostrar el ambiente correcto', async () => {
      const sandbox = createMockRecord({ environment: 'sandbox' });
      const production = createMockRecord({ environment: 'production' });

      const pdfSandbox = await generateCafePdf(sandbox);
      const pdfProd = await generateCafePdf(production);

      expect(pdfSandbox.toString('binary')).toContain('PRUEBAS');
      expect(pdfProd.toString('binary')).toContain('PRODUCCION');
    });

    it('debería mostrar código de autorización cuando existe', async () => {
      const record = createMockRecord({ authorization_code: 'DGI-AUTH-2025-001' });
      const pdf = await generateCafePdf(record);
      const content = pdf.toString('binary');

      expect(content).toContain('DGI-AUTH-2025-001');
    });

    it('debería mostrar "Pendiente" si no hay código de autorización', async () => {
      const record = createMockRecord({ authorization_code: null });
      const pdf = await generateCafePdf(record);
      const content = pdf.toString('binary');

      expect(content).toContain('Pendiente');
    });

    it('debería ser un PDF con estructura válida (5 objetos)', async () => {
      const record = createMockRecord();
      const pdf = await generateCafePdf(record);
      const content = pdf.toString('binary');

      // Catalog, Pages, Page, Content, Font
      expect(content).toContain('1 0 obj');
      expect(content).toContain('2 0 obj');
      expect(content).toContain('3 0 obj');
      expect(content).toContain('4 0 obj');
      expect(content).toContain('5 0 obj');
      expect(content).toContain('/Type /Catalog');
      expect(content).toContain('/Type /Pages');
      expect(content).toContain('/Type /Page');
      expect(content).toContain('/Type /Font');
      expect(content).toContain('/BaseFont /Courier');
    });

    it('debería tener un tamaño razonable', async () => {
      const record = createMockRecord();
      const pdf = await generateCafePdf(record);

      // El PDF mínimo debería pesar entre 1KB y 10KB
      expect(pdf.length).toBeGreaterThan(1000);
      expect(pdf.length).toBeLessThan(10000);
    });
  });
});
