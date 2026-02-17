// Firma electrónica XAdES-BES para documentos fiscales de Panamá

export {
  // Carga de certificados
  loadP12,
  loadPemFiles,

  // Firma
  signXml,
  pacSignDocument,

  // Verificación
  verifyXmlSignature,

  // Información de certificados
  extractCertInfo,
  extractCertInfoFromPem,

  // Testing
  generateTestCertificate,
  generateTestP12,

  // Tipos
  type CertificateInfo,
  type P12Credentials,
  type SigningResult,
  type VerificationResult,
} from './xml-signer';
