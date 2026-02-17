// ============================================================================
// Generador de CUFE (Código Único de Factura Electrónica)
//
// Según la Ficha Técnica de la FE para PAC V1.00 - Abril 2025
// Sección 6.1 / Tabla 14
//
// Estructura del CUFE (dId campo A03):
//   "FE" + cuerpo(63) + DV_Luhn(1) = 66 caracteres
//
// Cuerpo (63 caracteres, Tabla 14):
//   iDoc(2) + dTipoRuc(1) + dRuc(20, pad 0 izq) + dDV(3, pad '-' izq)
//   + dSucEm(4) + dFechaEm(8, YYYYMMDD) + dNroDF(10) + dPtoFacDF(3)
//   + iTpEmis(2) + iAmb(1) + dSeg(9)
//
// El dígito verificador se calcula con Luhn mod-10 sobre el cuerpo.
// ============================================================================

import type { FacturaElectronica } from '../types';

// --- Tipos ---

export interface CufeComponents {
  /** B06 - Tipo de documento (2 chars) */
  iDoc: string;
  /** B3011 - Tipo de contribuyente/RUC (1 char) */
  dTipoRuc: string;
  /** B3012 - RUC del emisor (20 chars, zero-padded left) */
  dRuc: string;
  /** B3013 - Dígito verificador del RUC (3 chars, dash-padded left) */
  dDV: string;
  /** B303 - Código de sucursal (4 chars) */
  dSucEm: string;
  /** B10 - Fecha de emisión (8 chars YYYYMMDD) */
  dFechaEm: string;
  /** B07 - Número de documento fiscal (10 chars) */
  dNroDF: string;
  /** B08 - Punto de facturación (3 chars) */
  dPtoFacDF: string;
  /** B03 - Tipo de emisión (2 chars) */
  iTpEmis: string;
  /** B02 - Ambiente (1 char) */
  iAmb: string;
  /** B09 - Código de seguridad (9 chars) */
  dSeg: string;
}

// --- Utilidades Luhn (compartidas con document-validator) ---

/** Convierte letras a su último dígito ASCII (A=65→5, B=66→6, Z=90→0) */
function letterToDigit(ch: string): string {
  const code = ch.charCodeAt(0);
  return (code % 10).toString();
}

/** Convierte un string alfanumérico a solo dígitos para cálculo Luhn */
function toDigits(str: string): string {
  let digits = '';
  for (const ch of str) {
    if (ch >= '0' && ch <= '9') {
      digits += ch;
    } else if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) {
      digits += letterToDigit(ch);
    }
    // guiones y otros caracteres se ignoran
  }
  return digits;
}

/**
 * Calcula el dígito verificador Luhn (módulo 10) para una cadena.
 * Convierte letras a dígitos, ignora guiones.
 *
 * @param body - String sin el DV (los primeros 63 chars del cuerpo del CUFE)
 * @returns Dígito verificador (0-9)
 */
export function calculateLuhnDV(body: string): number {
  const digits = toDigits(body);
  let sum = 0;
  // De derecha a izquierda, alternando multiplicador 2, 1, 2, 1...
  for (let i = digits.length - 1, alt = true; i >= 0; i--, alt = !alt) {
    let n = parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n = Math.floor(n / 10) + (n % 10);
    }
    sum += n;
  }
  const remainder = sum % 10;
  return remainder === 0 ? 0 : 10 - remainder;
}

// ============================================================================
// Generación del CUFE
// ============================================================================

/**
 * Genera el CUFE (dId) a partir de los componentes individuales.
 *
 * @param components - Campos del documento necesarios para el CUFE
 * @returns String de 66 caracteres: "FE" + cuerpo(63) + DV(1)
 * @throws Error si algún componente tiene longitud incorrecta
 */
export function generateCufeFromComponents(components: CufeComponents): string {
  // Validar y formatear cada componente
  const iDoc = padOrValidate(components.iDoc, 2, 'iDoc');
  const dTipoRuc = padOrValidate(components.dTipoRuc, 1, 'dTipoRuc');
  const dRuc = components.dRuc.padStart(20, '0');
  if (dRuc.length > 20) {
    throw new Error(`CUFE: dRuc excede 20 caracteres: "${components.dRuc}"`);
  }
  const dDV = components.dDV.padStart(3, '-');
  if (dDV.length > 3) {
    throw new Error(`CUFE: dDV excede 3 caracteres: "${components.dDV}"`);
  }
  const dSucEm = padOrValidate(components.dSucEm, 4, 'dSucEm');
  const dFechaEm = padOrValidate(components.dFechaEm, 8, 'dFechaEm');
  const dNroDF = padOrValidate(components.dNroDF, 10, 'dNroDF');
  const dPtoFacDF = padOrValidate(components.dPtoFacDF, 3, 'dPtoFacDF');
  const iTpEmis = padOrValidate(components.iTpEmis, 2, 'iTpEmis');
  const iAmb = padOrValidate(components.iAmb, 1, 'iAmb');
  const dSeg = padOrValidate(components.dSeg, 9, 'dSeg');

  // Concatenar el cuerpo del CUFE (63 chars)
  const body =
    iDoc + dTipoRuc + dRuc + dDV + dSucEm + dFechaEm + dNroDF + dPtoFacDF + iTpEmis + iAmb + dSeg;

  if (body.length !== 63) {
    throw new Error(
      `CUFE: el cuerpo debe tener 63 caracteres, tiene ${body.length}`,
    );
  }

  // Calcular dígito verificador Luhn
  const dv = calculateLuhnDV(body);

  return `FE${body}${dv}`;
}

/**
 * Genera el CUFE (dId) directamente desde un objeto FacturaElectronica.
 *
 * Extrae los campos necesarios de la estructura del documento y genera el CUFE.
 * La fecha de emisión se convierte de formato ISO (YYYY-MM-DD) a YYYYMMDD.
 *
 * @param doc - Documento de factura electrónica (puede no tener dId aún)
 * @returns String de 66 caracteres: "FE" + cuerpo(63) + DV(1)
 */
export function generateCufe(
  doc: Pick<FacturaElectronica, 'gDGen' | 'gItem' | 'gTot'>,
): string {
  const gen = doc.gDGen;

  // Convertir fecha de emisión a YYYYMMDD
  const fechaEm = gen.dFechaEm.substring(0, 10).replace(/-/g, '');

  return generateCufeFromComponents({
    iDoc: gen.iDoc,
    dTipoRuc: gen.gEmis.gRucEmi.dTipoRuc,
    dRuc: gen.gEmis.gRucEmi.dRuc,
    dDV: gen.gEmis.gRucEmi.dDV,
    dSucEm: gen.gEmis.dSucEm,
    dFechaEm: fechaEm,
    dNroDF: gen.dNroDF,
    dPtoFacDF: gen.dPtoFacDF,
    iTpEmis: gen.iTpEmis,
    iAmb: gen.iAmb,
    dSeg: gen.dSeg,
  });
}

/**
 * Descompone un CUFE en sus componentes individuales.
 *
 * @param cufe - String de 66 caracteres (incluyendo el prefijo "FE")
 * @returns Componentes del CUFE y el dígito verificador
 * @throws Error si el CUFE no tiene el formato correcto
 */
export function parseCufe(cufe: string): CufeComponents & { dv: number } {
  if (!cufe.startsWith('FE') || cufe.length !== 66) {
    throw new Error(
      `CUFE inválido: debe tener 66 caracteres y comenzar con "FE" (recibido: ${cufe.length} chars)`,
    );
  }

  const body = cufe.substring(2); // quitar "FE"
  let pos = 0;

  const iDoc = body.substring(pos, pos + 2); pos += 2;
  const dTipoRuc = body.substring(pos, pos + 1); pos += 1;
  const dRuc = body.substring(pos, pos + 20); pos += 20;
  const dDV = body.substring(pos, pos + 3); pos += 3;
  const dSucEm = body.substring(pos, pos + 4); pos += 4;
  const dFechaEm = body.substring(pos, pos + 8); pos += 8;
  const dNroDF = body.substring(pos, pos + 10); pos += 10;
  const dPtoFacDF = body.substring(pos, pos + 3); pos += 3;
  const iTpEmis = body.substring(pos, pos + 2); pos += 2;
  const iAmb = body.substring(pos, pos + 1); pos += 1;
  const dSeg = body.substring(pos, pos + 9); pos += 9;
  const dv = parseInt(body.substring(pos, pos + 1), 10);

  return {
    iDoc,
    dTipoRuc,
    dRuc,
    dDV,
    dSucEm,
    dFechaEm,
    dNroDF,
    dPtoFacDF,
    iTpEmis,
    iAmb,
    dSeg,
    dv,
  };
}

/**
 * Valida que un CUFE sea estructuralmente correcto (formato + Luhn).
 *
 * @param cufe - String de 66 caracteres
 * @returns true si el formato y DV son correctos
 */
export function validateCufe(cufe: string): boolean {
  if (!cufe.startsWith('FE') || cufe.length !== 66) return false;

  const body = cufe.substring(2, 65); // 63 chars del cuerpo
  const expectedDV = calculateLuhnDV(body);
  const actualDV = parseInt(cufe.charAt(65), 10);

  return expectedDV === actualDV;
}

// --- Helpers ---

function padOrValidate(value: string, length: number, fieldName: string): string {
  if (value.length === length) return value;
  if (value.length < length) {
    // Pad con ceros a la izquierda solo para campos numéricos cortos
    return value.padStart(length, '0');
  }
  throw new Error(
    `CUFE: ${fieldName} debe tener ${length} caracteres, tiene ${value.length}: "${value}"`,
  );
}
