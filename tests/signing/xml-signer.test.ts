import {
  generateTestCertificate,
  generateTestP12,
  loadP12,
  signXml,
  verifyXmlSignature,
  extractCertInfoFromPem,
  pacSignDocument,
  type P12Credentials,
} from '../../src/signing/xml-signer';
import * as crypto from 'crypto';

// ============================================================================
// Helpers
// ============================================================================

/** Construye credenciales P12 a partir de un certificado de prueba */
function buildTestCredentials(name: string): P12Credentials {
  const testCert = generateTestCertificate({ commonName: name, country: 'PA' });
  const info = extractCertInfoFromPem(testCert.certificatePem);
  return {
    privateKeyPem: testCert.privateKeyPem,
    certificatePem: testCert.certificatePem,
    certificateDer: testCert.certificateDer,
    chain: [],
    info,
  };
}

/** Documento XML de factura de prueba */
function sampleFEXml(documentId?: string): string {
  const idAttr = documentId ? ` Id="${documentId}"` : '';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rFE${idAttr} xmlns="https://dgi.mef.gob.pa">`,
    '  <dVerForm>1.00</dVerForm>',
    '  <gDGen>',
    '    <iAmb>2</iAmb>',
    '    <iDoc>01</iDoc>',
    '    <dNroDF>0000000001</dNroDF>',
    '  </gDGen>',
    '  <gItem>',
    '    <dDescProd>Servicio de consultoría</dDescProd>',
    '    <dCantCodInt>1</dCantCodInt>',
    '  </gItem>',
    '  <gTot>',
    '    <dVTot>107.00</dVTot>',
    '  </gTot>',
    '</rFE>',
  ].join('\n');
}

// Generar certificados de prueba una sola vez (RSA 2048 es lento)
let emitterCreds: P12Credentials;
let pacCreds: P12Credentials;

beforeAll(() => {
  emitterCreds = buildTestCredentials('Emisor de Prueba S.A.');
  pacCreds = buildTestCredentials('PAC de Prueba S.A.');
}, 30000); // Dar 30s por la generación RSA

// ============================================================================
// Tests
// ============================================================================

describe('XML Signer - XAdES-BES', () => {
  // =========================================================================
  // Generación de certificados de prueba
  // =========================================================================
  describe('Generación de certificados', () => {
    it('genera un certificado de prueba con los datos correctos', () => {
      const cert = generateTestCertificate({
        commonName: 'Test Corp',
        organization: 'Test Org',
        country: 'PA',
        validDays: 30,
      });

      expect(cert.privateKeyPem).toContain('-----BEGIN RSA PRIVATE KEY-----');
      expect(cert.certificatePem).toContain('-----BEGIN CERTIFICATE-----');
      expect(cert.certificateDer).toBeInstanceOf(Buffer);
      expect(cert.certificateDer.length).toBeGreaterThan(0);
    });

    it('genera un P12 que puede ser recargado', () => {
      const password = 'test-password-123';
      const p12Buffer = generateTestP12({
        commonName: 'P12 Test Corp',
        password,
      });

      expect(p12Buffer).toBeInstanceOf(Buffer);
      expect(p12Buffer.length).toBeGreaterThan(0);

      // Debe poder recargarse
      const loaded = loadP12(p12Buffer, password);
      expect(loaded.privateKeyPem).toContain('-----BEGIN RSA PRIVATE KEY-----');
      expect(loaded.certificatePem).toContain('-----BEGIN CERTIFICATE-----');
      expect(loaded.info.subject).toContain('P12 Test Corp');
    });

    it('falla al cargar P12 con contraseña incorrecta', () => {
      const p12Buffer = generateTestP12({
        commonName: 'Fail Test',
        password: 'correct-password',
      });

      expect(() => loadP12(p12Buffer, 'wrong-password')).toThrow();
    });
  });

  // =========================================================================
  // Extracción de información del certificado
  // =========================================================================
  describe('Información del certificado', () => {
    it('extrae subject, issuer y fechas correctamente', () => {
      const info = emitterCreds.info;

      expect(info.subject).toContain('Emisor de Prueba S.A.');
      expect(info.issuer).toContain('Emisor de Prueba S.A.'); // Self-signed
      expect(info.serialNumber).toBe('01');
      expect(info.validFrom).toBeInstanceOf(Date);
      expect(info.validTo).toBeInstanceOf(Date);
      expect(info.validTo.getTime()).toBeGreaterThan(info.validFrom.getTime());
      expect(info.thumbprint).toMatch(/^[a-f0-9]{40}$/); // SHA-1 hex
    });

    it('extrae información desde PEM string', () => {
      const info = extractCertInfoFromPem(emitterCreds.certificatePem);

      expect(info.subject).toContain('Emisor de Prueba S.A.');
      expect(info.thumbprint).toBe(emitterCreds.info.thumbprint);
    });

    it('emisor y PAC tienen certificados diferentes', () => {
      expect(emitterCreds.info.thumbprint).not.toBe(pacCreds.info.thumbprint);
      expect(emitterCreds.info.subject).not.toBe(pacCreds.info.subject);
    });
  });

  // =========================================================================
  // Firma XML
  // =========================================================================
  describe('Firma de documentos', () => {
    it('firma un XML y produce un documento firmado válido', () => {
      const xml = sampleFEXml();
      const result = signXml(xml, emitterCreds);

      expect(result.signedXml).toContain('<ds:Signature');
      expect(result.signedXml).toContain('<ds:SignatureValue>');
      expect(result.signedXml).toContain('<ds:X509Certificate>');
      expect(result.signatureId).toBeTruthy();
      expect(result.signingTime).toBeTruthy();
      expect(result.certificateInfo.subject).toContain('Emisor de Prueba');
    });

    it('incluye el bloque XAdES SignedProperties', () => {
      const xml = sampleFEXml();
      const result = signXml(xml, emitterCreds);

      expect(result.signedXml).toContain('xades:QualifyingProperties');
      expect(result.signedXml).toContain('xades:SignedProperties');
      expect(result.signedXml).toContain('xades:SigningTime');
      expect(result.signedXml).toContain('xades:SigningCertificateV2');
      expect(result.signedXml).toContain('xades:CertDigest');
    });

    it('el SigningTime contiene una fecha ISO válida', () => {
      const xml = sampleFEXml();
      const result = signXml(xml, emitterCreds);

      const timeMatch = result.signedXml.match(
        /<xades:SigningTime>(.*?)<\/xades:SigningTime>/,
      );
      expect(timeMatch).toBeTruthy();

      const parsedDate = new Date(timeMatch![1]);
      expect(parsedDate.getTime()).not.toBeNaN();
    });

    it('el CertDigest es un SHA-256 válido del certificado', () => {
      const xml = sampleFEXml();
      const result = signXml(xml, emitterCreds);

      const digestMatch = result.signedXml.match(
        /<ds:DigestValue[^>]*>(.*?)<\/ds:DigestValue>/,
      );
      expect(digestMatch).toBeTruthy();

      // Calcular digest esperado
      const expectedDigest = crypto
        .createHash('sha256')
        .update(emitterCreds.certificateDer)
        .digest('base64');

      // El primer DigestValue en el XML podría ser del documento o del cert
      // Verificar que el digest esperado aparece en algún lugar
      expect(result.signedXml).toContain(expectedDigest);
    });

    it('firma con documentId referencia el elemento correcto', () => {
      const docId = 'FE0123456789';
      const xml = sampleFEXml(docId);
      const result = signXml(xml, emitterCreds, { documentId: docId });

      expect(result.signedXml).toContain(`Id="${docId}"`);
      expect(result.signedXml).toContain(`URI="#${docId}"`);
    });

    it('el ds:Object con XAdES está dentro de ds:Signature', () => {
      const xml = sampleFEXml();
      const result = signXml(xml, emitterCreds);

      // El Object debe estar entre <ds:Signature> y </ds:Signature>
      const sigStart = result.signedXml.indexOf('<ds:Signature');
      const sigEnd = result.signedXml.indexOf('</ds:Signature>');
      const objectPos = result.signedXml.indexOf('<ds:Object>');

      expect(sigStart).toBeGreaterThan(-1);
      expect(sigEnd).toBeGreaterThan(sigStart);
      expect(objectPos).toBeGreaterThan(sigStart);
      expect(objectPos).toBeLessThan(sigEnd);
    });

    it('genera IDs únicos por cada firma', () => {
      const xml = sampleFEXml();
      const result1 = signXml(xml, emitterCreds);
      const result2 = signXml(xml, emitterCreds);

      expect(result1.signatureId).not.toBe(result2.signatureId);
    });
  });

  // =========================================================================
  // Verificación de firma
  // =========================================================================
  describe('Verificación de firma', () => {
    it('verifica correctamente una firma válida', () => {
      const xml = sampleFEXml();
      const signed = signXml(xml, emitterCreds);
      const verification = verifyXmlSignature(
        signed.signedXml,
        emitterCreds.certificatePem,
      );

      expect(verification.isValid).toBe(true);
      expect(verification.errors).toHaveLength(0);
      expect(verification.certificateInfo).toBeTruthy();
      expect(verification.certificateInfo!.subject).toContain('Emisor de Prueba');
    });

    it('rechaza un XML no firmado', () => {
      const xml = sampleFEXml();
      const verification = verifyXmlSignature(xml);

      expect(verification.isValid).toBe(false);
      expect(verification.errors.length).toBeGreaterThan(0);
    });

    it('rechaza un XML con firma manipulada', () => {
      const xml = sampleFEXml();
      const signed = signXml(xml, emitterCreds);

      // Manipular el SignatureValue
      const tampered = signed.signedXml.replace(
        /<ds:SignatureValue>(.*?)<\/ds:SignatureValue>/,
        '<ds:SignatureValue>AAAA</ds:SignatureValue>',
      );

      const verification = verifyXmlSignature(tampered, emitterCreds.certificatePem);
      expect(verification.isValid).toBe(false);
    });

    it('rechaza verificación con certificado equivocado', () => {
      const xml = sampleFEXml();
      const signed = signXml(xml, emitterCreds);

      // Verificar con el certificado del PAC (incorrecto)
      const verification = verifyXmlSignature(
        signed.signedXml,
        pacCreds.certificatePem,
      );

      expect(verification.isValid).toBe(false);
    });

    it('detecta certificado expirado', () => {
      // Generar certificado que ya expiró
      const expiredCert = generateTestCertificate({
        commonName: 'Expired Corp',
        validDays: -1, // Ya expiró
      });
      const expiredInfo = extractCertInfoFromPem(expiredCert.certificatePem);
      const expiredCreds: P12Credentials = {
        ...expiredCert,
        certificateDer: expiredCert.certificateDer,
        chain: [],
        info: expiredInfo,
      };

      const xml = sampleFEXml();
      const signed = signXml(xml, expiredCreds);
      const verification = verifyXmlSignature(
        signed.signedXml,
        expiredCreds.certificatePem,
      );

      // La firma criptográfica puede ser válida, pero el cert expiró
      expect(verification.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('expirado')]),
      );
    });
  });

  // =========================================================================
  // Flujo PAC: Emisor firma → PAC verifica → PAC firma
  // =========================================================================
  describe('Flujo PAC completo', () => {
    it('ejecuta el flujo emisor→PAC correctamente', () => {
      // 1. Emisor firma su documento
      const xml = sampleFEXml();
      const emitterSigned = signXml(xml, emitterCreds);

      // 2. PAC recibe, verifica y firma
      const pacResult = pacSignDocument(emitterSigned.signedXml, pacCreds);

      expect(pacResult.emitterVerification.isValid).toBe(true);
      expect(pacResult.pacSignature.signedXml).toContain('<ds:Signature');
      expect(pacResult.pacSignature.certificateInfo.subject).toContain('PAC de Prueba');
    });

    it('el documento final contiene ambos certificados', () => {
      const xml = sampleFEXml();
      const emitterSigned = signXml(xml, emitterCreds);
      const pacResult = pacSignDocument(emitterSigned.signedXml, pacCreds);

      const finalXml = pacResult.signedXml;

      // Extraer todos los X509Certificate
      const certMatches = finalXml.match(
        /<ds:X509Certificate>([\s\S]*?)<\/ds:X509Certificate>/g,
      );

      // Debe haber al menos 2 certificados (emisor + PAC)
      expect(certMatches).toBeTruthy();
      expect(certMatches!.length).toBeGreaterThanOrEqual(2);
    });

    it('rechaza si la firma del emisor es inválida', () => {
      const xml = sampleFEXml();
      const emitterSigned = signXml(xml, emitterCreds);

      // Manipular la firma del emisor
      const tampered = emitterSigned.signedXml.replace(
        /<ds:SignatureValue>([\s\S]*?)<\/ds:SignatureValue>/,
        '<ds:SignatureValue>TAMPERED</ds:SignatureValue>',
      );

      expect(() => pacSignDocument(tampered, pacCreds)).toThrow(
        /Firma del emisor inválida/,
      );
    });

    it('el documento final tiene las QualifyingProperties del PAC', () => {
      const xml = sampleFEXml();
      const emitterSigned = signXml(xml, emitterCreds);
      const pacResult = pacSignDocument(emitterSigned.signedXml, pacCreds);

      // Debe contener QualifyingProperties del PAC
      const qpMatches = pacResult.signedXml.match(
        /xades:QualifyingProperties/g,
      );
      expect(qpMatches).toBeTruthy();
      expect(qpMatches!.length).toBeGreaterThanOrEqual(2);
    });
  });
});
