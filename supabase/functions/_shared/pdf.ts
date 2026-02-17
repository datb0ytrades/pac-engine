// ============================================================================
// Generación de CAFE (Comprobante Auxiliar de Factura Electrónica) en PDF
// Adaptado para Deno Edge Functions (Uint8Array en lugar de Buffer)
// ============================================================================

import type { DocumentRecord } from './types.ts';

/**
 * Genera un PDF simple del CAFE con la información esencial del documento.
 * Retorna Uint8Array en lugar de Buffer para compatibilidad con Deno.
 */
export async function generateCafePdf(document: DocumentRecord): Promise<Uint8Array> {
  const lines = [
    '═══════════════════════════════════════════════',
    '     COMPROBANTE AUXILIAR DE FACTURA ELECTRONICA',
    '              (CAFE) - PANAMA',
    '═══════════════════════════════════════════════',
    '',
    `CUFE: ${document.cufe}`,
    '',
    '--- EMISOR ---',
    `RUC: ${document.emitter_ruc}`,
    `Razon Social: ${document.emitter_name}`,
    '',
    '--- RECEPTOR ---',
    `RUC: ${document.receiver_ruc ?? 'N/A'}`,
    `Razon Social: ${document.receiver_name ?? 'Consumidor Final'}`,
    '',
    '--- DOCUMENTO ---',
    `Tipo: ${formatDocType(document.doc_type)}`,
    `Fecha de Emision: ${document.emission_date}`,
    `Ambiente: ${document.environment === 'sandbox' ? 'PRUEBAS' : 'PRODUCCION'}`,
    '',
    '--- MONTOS ---',
    `Subtotal: B/. ${Number(document.total_amount - document.total_tax).toFixed(2)}`,
    `ITBMS: B/. ${Number(document.total_tax).toFixed(2)}`,
    `Total: B/. ${Number(document.total_amount).toFixed(2)}`,
    `Moneda: ${document.currency}`,
    '',
    '--- AUTORIZACION ---',
    `Codigo: ${document.authorization_code ?? 'Pendiente'}`,
    `Estado: ${formatStatus(document.status)}`,
    '',
    '═══════════════════════════════════════════════',
    `Generado: ${new Date().toISOString()}`,
    'Documento fiscal electronico - DGI Panama',
    '═══════════════════════════════════════════════',
  ];

  const content = lines.join('\n');
  return buildMinimalPdf(content);
}

// --- Helpers ---

function formatDocType(code: string): string {
  const types: Record<string, string> = {
    '01': 'Factura de Operacion Interna',
    '02': 'Factura de Importacion',
    '03': 'Factura de Exportacion',
    '04': 'Nota de Credito referente a FE',
    '05': 'Nota de Debito referente a FE',
    '06': 'Nota de Credito Generica',
    '07': 'Nota de Debito Generica',
    '08': 'Factura de Zona Franca',
    '09': 'Reembolso',
    '10': 'Factura de Operacion Extranjera',
  };
  return types[code] ?? `Tipo ${code}`;
}

function formatStatus(status: string): string {
  const labels: Record<string, string> = {
    received: 'Recibido',
    validated: 'Validado',
    signed: 'Firmado',
    sent_to_dgi: 'Enviado a DGI',
    accepted: 'Aceptado',
    rejected: 'Rechazado',
    cancelled: 'Anulado',
    error: 'Error',
  };
  return labels[status] ?? status;
}

/**
 * Convierte un string binario a Uint8Array (reemplazo de Buffer.from(str, 'binary'))
 */
function stringToBytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xFF;
  }
  return bytes;
}

/**
 * Construye un archivo PDF mínimo válido con contenido de texto plano.
 * Sigue la especificación PDF 1.4. Retorna Uint8Array.
 */
function buildMinimalPdf(text: string): Uint8Array {
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

  const textLines = escaped.split('\n');
  const textCommands = textLines
    .map((line, i) => `1 0 0 1 50 ${750 - i * 14} Tm (${line}) Tj`)
    .join('\n');

  const stream = `BT\n/F1 10 Tf\n${textCommands}\nET`;

  const objects: string[] = [];
  const offsets: number[] = [];
  let output = '%PDF-1.4\n';

  // Objeto 1: Catálogo
  offsets.push(output.length);
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  output += objects[objects.length - 1];

  // Objeto 2: Páginas
  offsets.push(output.length);
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  output += objects[objects.length - 1];

  // Objeto 3: Página
  offsets.push(output.length);
  objects.push(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
    '/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n'
  );
  output += objects[objects.length - 1];

  // Objeto 4: Contenido (stream)
  offsets.push(output.length);
  objects.push(
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`
  );
  output += objects[objects.length - 1];

  // Objeto 5: Fuente
  offsets.push(output.length);
  objects.push(
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n'
  );
  output += objects[objects.length - 1];

  // Tabla de referencias cruzadas
  const xrefOffset = output.length;
  let xref = `xref\n0 ${offsets.length + 1}\n`;
  xref += '0000000000 65535 f \n';
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  output += xref;

  // Trailer
  output += `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\n`;
  output += `startxref\n${xrefOffset}\n%%EOF\n`;

  return stringToBytes(output);
}
