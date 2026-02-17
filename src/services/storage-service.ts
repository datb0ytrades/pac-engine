// ============================================================================
// Servicio de almacenamiento en Supabase Storage
//
// Buckets:
//   - xml-documents: XMLs firmados
//   - pdf-cafe: PDFs del CAFE
// ============================================================================

import { supabase } from '../config/supabase';

const XML_BUCKET = 'xml-documents';
const PDF_BUCKET = 'pdf-cafe';

/**
 * Genera la ruta de almacenamiento: {orgId}/{YYYY}/{MM}/{cufe}.{ext}
 */
function buildPath(organizationId: string, cufe: string, ext: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${organizationId}/${year}/${month}/${cufe}.${ext}`;
}

/**
 * Almacena el XML firmado en el bucket 'xml-documents'.
 * @returns La ruta del archivo en el storage
 */
export async function storeSignedXml(
  organizationId: string,
  cufe: string,
  signedXml: string,
): Promise<string> {
  const path = buildPath(organizationId, cufe, 'xml');

  const { error } = await supabase.storage
    .from(XML_BUCKET)
    .upload(path, signedXml, {
      contentType: 'application/xml',
      upsert: false,
    });

  if (error) {
    throw new Error(`Error al almacenar XML: ${error.message}`);
  }

  return path;
}

/**
 * Recupera el XML firmado desde el bucket 'xml-documents'.
 */
export async function retrieveSignedXml(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(XML_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Error al recuperar XML: ${error?.message ?? 'datos vacíos'}`);
  }

  return await data.text();
}

/**
 * Almacena el PDF CAFE en el bucket 'pdf-cafe'.
 * @returns La ruta del archivo en el storage
 */
export async function storeCafePdf(
  organizationId: string,
  cufe: string,
  pdfBuffer: Buffer,
): Promise<string> {
  const path = buildPath(organizationId, cufe, 'pdf');

  const { error } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(path, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (error) {
    throw new Error(`Error al almacenar PDF: ${error.message}`);
  }

  return path;
}

/**
 * Recupera el PDF CAFE desde el bucket 'pdf-cafe'.
 */
export async function retrieveCafePdf(storagePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from(PDF_BUCKET)
    .download(storagePath);

  if (error || !data) {
    throw new Error(`Error al recuperar PDF: ${error?.message ?? 'datos vacíos'}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
