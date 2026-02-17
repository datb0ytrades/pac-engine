// Lógica de negocio para procesamiento de documentos fiscales

export {
  emitFromXml,
  emitFromJson,
  getDocumentById,
  listDocuments,
  cancelDocument,
  getDocumentPdf,
} from './document-service';

export {
  storeSignedXml,
  retrieveSignedXml,
  storeCafePdf,
  retrieveCafePdf,
} from './storage-service';

export { generateCafePdf } from './pdf-service';

// Re-export CUFE para backward compatibility
export { generateCufe } from '../cufe';
