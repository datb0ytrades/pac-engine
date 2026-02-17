// ============================================================================
// Firma Electrónica XAdES-BES para Factura Electrónica de Panamá
//
// Flujo DGI (sección 3.6 de la Ficha Técnica):
//   1. Emisor firma con SU certificado X.509
//   2. PAC verifica la firma del emisor
//   3. PAC firma con SU certificado (autorización de uso)
//
// Estándar: XAdES-BES sobre XML-DSIG
//   - xml-crypto para XML-DSIG base
//   - Extensión XAdES manual (SignedProperties, SigningTime, SigningCertificate)
// ============================================================================

import { SignedXml } from 'xml-crypto';
import * as forge from 'node-forge';
import * as crypto from 'crypto';
import * as fs from 'fs';

// --- Tipos ---

export interface CertificateInfo {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
  thumbprint: string;
}

export interface P12Credentials {
  privateKeyPem: string;
  certificatePem: string;
  certificateDer: Buffer;
  chain: string[];
  info: CertificateInfo;
}

export interface SigningResult {
  signedXml: string;
  signatureId: string;
  signingTime: string;
  certificateInfo: CertificateInfo;
}

export interface VerificationResult {
  isValid: boolean;
  errors: string[];
  certificateInfo?: CertificateInfo;
}

// --- Constantes ---

const XADES_NS = 'http://uri.etsi.org/01903/v1.3.2#';
const XMLDSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';

const SIGNATURE_ALGORITHM = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const CANONICALIZATION_ALGORITHM = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const DIGEST_ALGORITHM = 'http://www.w3.org/2001/04/xmlenc#sha256';
const ENVELOPED_TRANSFORM = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

// ============================================================================
// Carga de certificados P12/PFX
// ============================================================================

/**
 * Carga un certificado .p12/.pfx y extrae la clave privada, certificado y cadena.
 */
export function loadP12(pathOrBuffer: string | Buffer, password: string): P12Credentials {
  const p12Buffer =
    typeof pathOrBuffer === 'string' ? fs.readFileSync(pathOrBuffer) : pathOrBuffer;

  const p12Der = forge.util.decode64(p12Buffer.toString('base64'));
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

  // Extraer clave privada
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [];
  const altKeyBags = p12.getBags({ bagType: forge.pki.oids.keyBag });
  const altBag = altKeyBags[forge.pki.oids.keyBag] ?? [];
  const allKeys = [...keyBag, ...altBag];

  if (!allKeys.length || !allKeys[0].key) {
    throw new Error('No se encontró clave privada en el archivo P12');
  }

  const privateKeyPem = forge.pki.privateKeyToPem(allKeys[0].key);

  // Extraer certificados
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certs = certBags[forge.pki.oids.certBag] ?? [];

  if (!certs.length || !certs[0].cert) {
    throw new Error('No se encontró certificado en el archivo P12');
  }

  const mainCert = certs[0].cert;
  const certificatePem = forge.pki.certificateToPem(mainCert);
  const certificateDer = Buffer.from(
    forge.asn1.toDer(forge.pki.certificateToAsn1(mainCert)).getBytes(),
    'binary',
  );
  const chain = certs.slice(1).map((bag) => forge.pki.certificateToPem(bag.cert!));
  const info = extractCertInfo(mainCert);

  return { privateKeyPem, certificatePem, certificateDer, chain, info };
}

/**
 * Carga un certificado PEM y su clave privada PEM desde archivos separados.
 */
export function loadPemFiles(certPath: string, keyPath: string): P12Credentials {
  const certificatePem = fs.readFileSync(certPath, 'utf-8');
  const privateKeyPem = fs.readFileSync(keyPath, 'utf-8');

  const cert = forge.pki.certificateFromPem(certificatePem);
  const certificateDer = Buffer.from(
    forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(),
    'binary',
  );
  const info = extractCertInfo(cert);

  return { privateKeyPem, certificatePem, certificateDer, chain: [], info };
}

// ============================================================================
// Información del certificado
// ============================================================================

/**
 * Extrae información legible del certificado X.509.
 */
export function extractCertInfo(cert: forge.pki.Certificate): CertificateInfo {
  const subjectAttrs = cert.subject.attributes.map(
    (a) => `${a.shortName || a.name}=${a.value}`,
  );
  const issuerAttrs = cert.issuer.attributes.map(
    (a) => `${a.shortName || a.name}=${a.value}`,
  );

  const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const thumbprint = crypto.createHash('sha1').update(Buffer.from(derBytes, 'binary')).digest('hex');

  return {
    subject: subjectAttrs.join(', '),
    issuer: issuerAttrs.join(', '),
    serialNumber: cert.serialNumber,
    validFrom: cert.validity.notBefore,
    validTo: cert.validity.notAfter,
    thumbprint,
  };
}

/**
 * Extrae información del certificado desde una cadena PEM.
 */
export function extractCertInfoFromPem(pem: string): CertificateInfo {
  const cert = forge.pki.certificateFromPem(pem);
  return extractCertInfo(cert);
}

// ============================================================================
// Firma XAdES-BES
// ============================================================================

/**
 * Firma un documento XML con XAdES-BES usando las credenciales proporcionadas.
 * Esta función implementa la extensión XAdES sobre XML-DSIG.
 *
 * Usa la API nativa de ds:Object de xml-crypto (PR #506) para insertar las
 * QualifyingProperties dentro de ds:Signature ANTES de computar los digests,
 * garantizando la integridad de la firma.
 *
 * @param xml - Documento XML a firmar
 * @param credentials - Credenciales del firmante (emisor o PAC)
 * @param options - Opciones adicionales de firma
 */
export function signXml(
  xml: string,
  credentials: P12Credentials,
  options: {
    /** XPath para posicionar la firma. Default: raíz del documento */
    signatureParentXpath?: string;
    /** URI de referencia al documento. Default: "" (documento completo) */
    referenceUri?: string;
    /** ID para el elemento dId de la FE. Si se provee, se usa como URI de referencia */
    documentId?: string;
    /** Prefijo para IDs generados. Default: "xmldsig" */
    idPrefix?: string;
  } = {},
): SigningResult {
  const {
    signatureParentXpath = "//*[local-name()='rFE']",
    documentId,
    idPrefix = 'xmldsig',
  } = options;

  const signatureId = `${idPrefix}-${crypto.randomUUID()}`;
  const signedPropertiesId = `${signatureId}-signedprops`;
  const signingTime = new Date().toISOString();

  // Calcular digest del certificado (SHA-256 del DER)
  const certDigest = crypto
    .createHash('sha256')
    .update(credentials.certificateDer)
    .digest('base64');

  // Construir el contenido XAdES QualifyingProperties (sin ds:Object wrapper)
  const xadesContent = buildXadesContent(
    signatureId,
    signedPropertiesId,
    signingTime,
    certDigest,
    credentials.info,
  );

  // Crear la firma XML-DSIG con xml-crypto y ds:Object nativo
  const sig = new SignedXml({
    privateKey: credentials.privateKeyPem,
    publicCert: credentials.certificatePem,
    signatureAlgorithm: SIGNATURE_ALGORITHM,
    canonicalizationAlgorithm: CANONICALIZATION_ALGORITHM,
    getKeyInfoContent: (args) => {
      const cert = args?.publicCert?.toString() ?? credentials.certificatePem;
      const pfx = args?.prefix ?? undefined;
      return buildKeyInfoContent(cert, pfx ?? undefined);
    },
    // ds:Object con XAdES QualifyingProperties — insertado dentro de ds:Signature
    // por xml-crypto ANTES de computar los digests de las referencias
    objects: [{ content: xadesContent }],
  });

  // Referencia 1: el documento completo (o el elemento específico)
  const referenceUri = documentId ? `#${documentId}` : (options.referenceUri ?? '');
  sig.addReference({
    xpath: referenceUri === '' ? "/*" : `//*[@Id='${documentId}']`,
    transforms: [ENVELOPED_TRANSFORM, CANONICALIZATION_ALGORITHM],
    digestAlgorithm: DIGEST_ALGORITHM,
    uri: referenceUri,
  });

  // Referencia 2: SignedProperties (requerido por XAdES-BES)
  // El type indica que es una referencia a SignedProperties según ETSI XAdES
  sig.addReference({
    xpath: `//*[@Id='${signedPropertiesId}']`,
    transforms: [CANONICALIZATION_ALGORITHM],
    digestAlgorithm: DIGEST_ALGORITHM,
    uri: `#${signedPropertiesId}`,
    type: 'http://uri.etsi.org/01903#SignedProperties',
  });

  // Computar la firma — xml-crypto inserta el ds:Object en el ds:Signature,
  // resuelve las XPath references (incluyendo SignedProperties dentro del Object),
  // computa los digests y firma el SignedInfo
  sig.computeSignature(xml, {
    prefix: 'ds',
    attrs: { Id: signatureId },
    location: {
      reference: signatureParentXpath || "/*",
      action: 'append',
    },
  });

  const signedXml = sig.getSignedXml();

  return {
    signedXml,
    signatureId,
    signingTime,
    certificateInfo: credentials.info,
  };
}

// ============================================================================
// Verificación de firma
// ============================================================================

/**
 * Verifica la firma XML-DSIG/XAdES de un documento.
 *
 * Soporta firmas con prefijo ds: y sin prefijo.
 * Si no se provee un certificado de confianza, extrae el certificado del KeyInfo.
 */
export function verifyXmlSignature(
  signedXml: string,
  trustedCertPem?: string,
): VerificationResult {
  const errors: string[] = [];

  try {
    // Extraer el certificado del XML firmado si no se proporcionó uno de confianza
    const certPem = trustedCertPem ?? extractCertFromSignedXml(signedXml);

    if (!certPem) {
      return {
        isValid: false,
        errors: ['No se encontró certificado en el XML firmado ni se proporcionó uno de confianza'],
      };
    }

    const sig = new SignedXml({
      publicCert: certPem,
      signatureAlgorithm: SIGNATURE_ALGORITHM,
      canonicalizationAlgorithm: CANONICALIZATION_ALGORITHM,
      getCertFromKeyInfo: () => certPem,
    });

    // Extraer el nodo Signature usando una búsqueda robusta de tags balanceados
    const sigXml = extractSignatureXml(signedXml);

    if (!sigXml) {
      return { isValid: false, errors: ['No se encontró elemento Signature en el XML'] };
    }

    sig.loadSignature(sigXml);
    const isValid = sig.checkSignature(signedXml);

    if (!isValid) {
      errors.push('Firma inválida: la verificación criptográfica falló');
    }

    const certInfo = extractCertInfoFromPem(certPem);

    // Verificar vigencia del certificado
    const now = new Date();
    if (now < certInfo.validFrom) {
      errors.push('El certificado aún no es válido');
    }
    if (now > certInfo.validTo) {
      errors.push('El certificado ha expirado');
    }

    return {
      isValid: isValid && errors.length === 0,
      errors,
      certificateInfo: certInfo,
    };
  } catch (err) {
    return {
      isValid: false,
      errors: [`Error al verificar firma: ${(err as Error).message}`],
    };
  }
}

// ============================================================================
// Flujo completo PAC: Emisor firma → PAC verifica → PAC firma
// ============================================================================

/**
 * Flujo completo de firma para el PAC:
 * 1. Verifica la firma del emisor
 * 2. Si es válida, agrega la firma del PAC (autorización de uso)
 */
export function pacSignDocument(
  emitterSignedXml: string,
  pacCredentials: P12Credentials,
  options: {
    documentId?: string;
  } = {},
): {
  signedXml: string;
  emitterVerification: VerificationResult;
  pacSignature: SigningResult;
} {
  // Paso 1: Verificar firma del emisor
  const emitterVerification = verifyXmlSignature(emitterSignedXml);

  if (!emitterVerification.isValid) {
    throw new Error(
      `Firma del emisor inválida: ${emitterVerification.errors.join(', ')}`,
    );
  }

  // Paso 2: Agregar firma del PAC
  const pacSignature = signXml(emitterSignedXml, pacCredentials, {
    idPrefix: 'pac-xmldsig',
    documentId: options.documentId,
  });

  return {
    signedXml: pacSignature.signedXml,
    emitterVerification,
    pacSignature,
  };
}

// ============================================================================
// Funciones auxiliares internas
// ============================================================================

/**
 * Construye el contenido XAdES QualifyingProperties (sin wrapper ds:Object).
 * xml-crypto se encarga de envolver esto en <ds:Object> automáticamente.
 */
function buildXadesContent(
  signatureId: string,
  signedPropertiesId: string,
  signingTime: string,
  certDigestBase64: string,
  certInfo: CertificateInfo,
): string {
  return [
    `<xades:QualifyingProperties xmlns:xades="${XADES_NS}" Target="#${signatureId}">`,
    `<xades:SignedProperties Id="${signedPropertiesId}">`,
    `<xades:SignedSignatureProperties>`,
    `<xades:SigningTime>${signingTime}</xades:SigningTime>`,
    `<xades:SigningCertificateV2>`,
    `<xades:Cert>`,
    `<xades:CertDigest>`,
    `<ds:DigestMethod xmlns:ds="${XMLDSIG_NS}" Algorithm="${DIGEST_ALGORITHM}"/>`,
    `<ds:DigestValue xmlns:ds="${XMLDSIG_NS}">${certDigestBase64}</ds:DigestValue>`,
    `</xades:CertDigest>`,
    `<xades:IssuerSerial>`,
    `<ds:X509IssuerName xmlns:ds="${XMLDSIG_NS}">${escapeXml(certInfo.issuer)}</ds:X509IssuerName>`,
    `<ds:X509SerialNumber xmlns:ds="${XMLDSIG_NS}">${certInfo.serialNumber}</ds:X509SerialNumber>`,
    `</xades:IssuerSerial>`,
    `</xades:Cert>`,
    `</xades:SigningCertificateV2>`,
    `</xades:SignedSignatureProperties>`,
    `</xades:SignedProperties>`,
    `</xades:QualifyingProperties>`,
  ].join('');
}

function buildKeyInfoContent(certPem: string, prefix?: string): string {
  const certBase64 = certPem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');

  const p = prefix ? `${prefix}:` : '';
  return `<${p}X509Data><${p}X509Certificate>${certBase64}</${p}X509Certificate></${p}X509Data>`;
}


/**
 * Extrae el bloque XML de la primera ds:Signature (o Signature) de un documento firmado.
 * Busca la etiqueta exacta (no confundir con ds:SignatureValue, ds:SignatureMethod, etc.)
 * y encuentra su cierre correspondiente contando aperturas/cierres del elemento Signature.
 */
function extractSignatureXml(signedXml: string): string | null {
  const prefixes = ['ds:', ''];
  for (const p of prefixes) {
    // Buscar la apertura exacta: <ds:Signature seguido de espacio, > o />
    const escapedP = p.replace(':', '\\:');
    const openPattern = new RegExp(`<${escapedP}Signature[\\s>]`);
    const openMatch = openPattern.exec(signedXml);
    if (!openMatch) continue;

    const startIdx = openMatch.index;
    const closeTag = `</${p}Signature>`;

    // Regex para encontrar <ds:Signature ... > (apertura exacta, no SignatureValue etc.)
    const exactOpenRegex = new RegExp(`<${escapedP}Signature[\\s>]`, 'g');

    // Buscar el cierre balanceado
    let depth = 1;
    // Comenzar búsqueda después del tag de apertura completo
    const firstTagEnd = signedXml.indexOf('>', startIdx);
    if (firstTagEnd === -1) continue;

    // Verificar si es self-closing
    if (signedXml[firstTagEnd - 1] === '/') {
      return signedXml.substring(startIdx, firstTagEnd + 1);
    }

    let searchFrom = firstTagEnd + 1;
    while (depth > 0 && searchFrom < signedXml.length) {
      const nextCloseIdx = signedXml.indexOf(closeTag, searchFrom);
      if (nextCloseIdx === -1) break; // Mal formado

      // Contar aperturas entre searchFrom y nextCloseIdx
      exactOpenRegex.lastIndex = searchFrom;
      let match;
      while ((match = exactOpenRegex.exec(signedXml)) !== null && match.index < nextCloseIdx) {
        depth++;
      }

      depth--; // Por el cierre encontrado
      if (depth === 0) {
        return signedXml.substring(startIdx, nextCloseIdx + closeTag.length);
      }
      searchFrom = nextCloseIdx + closeTag.length;
    }
  }
  return null;
}

/**
 * Extrae el certificado X.509 PEM del KeyInfo de un XML firmado.
 */
function extractCertFromSignedXml(signedXml: string): string | null {
  const match = signedXml.match(
    /<(?:ds:)?X509Certificate>([\s\S]*?)<\/(?:ds:)?X509Certificate>/,
  );
  if (!match) return null;

  const base64 = match[1].replace(/\s/g, '');
  return `-----BEGIN CERTIFICATE-----\n${base64.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// Generación de certificados de prueba (solo para testing/desarrollo)
// ============================================================================

/**
 * Genera un par certificado/clave autofirmado para testing.
 * NO usar en producción.
 */
export function generateTestCertificate(options: {
  commonName: string;
  organization?: string;
  country?: string;
  validDays?: number;
}): { privateKeyPem: string; certificatePem: string; certificateDer: Buffer } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(
    cert.validity.notAfter.getDate() + (options.validDays ?? 365),
  );

  const attrs = [
    { name: 'commonName', value: options.commonName },
    { name: 'organizationName', value: options.organization ?? 'Test' },
    { name: 'countryName', value: options.country ?? 'PA' },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs); // Self-signed
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const certificatePem = forge.pki.certificateToPem(cert);
  const certificateDer = Buffer.from(
    forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes(),
    'binary',
  );

  return { privateKeyPem, certificatePem, certificateDer };
}

/**
 * Genera un archivo P12 de prueba en memoria.
 * NO usar en producción.
 */
export function generateTestP12(options: {
  commonName: string;
  organization?: string;
  country?: string;
  password: string;
  validDays?: number;
}): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(
    cert.validity.notAfter.getDate() + (options.validDays ?? 365),
  );

  const attrs = [
    { name: 'commonName', value: options.commonName },
    { name: 'organizationName', value: options.organization ?? 'Test' },
    { name: 'countryName', value: options.country ?? 'PA' },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], options.password, {
    algorithm: '3des',
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(p12Der, 'binary');
}
