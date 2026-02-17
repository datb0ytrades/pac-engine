// ============================================================================
// Generador de CUFE (Código Único de Factura Electrónica)
// Adaptado para Deno Edge Functions
// ============================================================================

import type { FacturaElectronica } from './types.ts';

// --- Tipos ---

export interface CufeComponents {
  iDoc: string;
  dTipoRuc: string;
  dRuc: string;
  dDV: string;
  dSucEm: string;
  dFechaEm: string;
  dNroDF: string;
  dPtoFacDF: string;
  iTpEmis: string;
  iAmb: string;
  dSeg: string;
}

// --- Utilidades Luhn ---

function letterToDigit(ch: string): string {
  const code = ch.charCodeAt(0);
  return (code % 10).toString();
}

function toDigits(str: string): string {
  let digits = '';
  for (const ch of str) {
    if (ch >= '0' && ch <= '9') {
      digits += ch;
    } else if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) {
      digits += letterToDigit(ch);
    }
  }
  return digits;
}

export function calculateLuhnDV(body: string): number {
  const digits = toDigits(body);
  let sum = 0;
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

export function generateCufeFromComponents(components: CufeComponents): string {
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

  const body =
    iDoc + dTipoRuc + dRuc + dDV + dSucEm + dFechaEm + dNroDF + dPtoFacDF + iTpEmis + iAmb + dSeg;

  if (body.length !== 63) {
    throw new Error(
      `CUFE: el cuerpo debe tener 63 caracteres, tiene ${body.length}`,
    );
  }

  const dv = calculateLuhnDV(body);
  return `FE${body}${dv}`;
}

export function generateCufe(
  doc: Pick<FacturaElectronica, 'gDGen' | 'gItem' | 'gTot'>,
): string {
  const gen = doc.gDGen;
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

export function parseCufe(cufe: string): CufeComponents & { dv: number } {
  if (!cufe.startsWith('FE') || cufe.length !== 66) {
    throw new Error(
      `CUFE inválido: debe tener 66 caracteres y comenzar con "FE" (recibido: ${cufe.length} chars)`,
    );
  }

  const body = cufe.substring(2);
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

  return { iDoc, dTipoRuc, dRuc, dDV, dSucEm, dFechaEm, dNroDF, dPtoFacDF, iTpEmis, iAmb, dSeg, dv };
}

export function validateCufe(cufe: string): boolean {
  if (!cufe.startsWith('FE') || cufe.length !== 66) return false;
  const body = cufe.substring(2, 65);
  const expectedDV = calculateLuhnDV(body);
  const actualDV = parseInt(cufe.charAt(65), 10);
  return expectedDV === actualDV;
}

// --- Helpers ---

function padOrValidate(value: string, length: number, fieldName: string): string {
  if (value.length === length) return value;
  if (value.length < length) {
    return value.padStart(length, '0');
  }
  throw new Error(
    `CUFE: ${fieldName} debe tener ${length} caracteres, tiene ${value.length}: "${value}"`,
  );
}
