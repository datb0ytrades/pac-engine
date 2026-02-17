// ============================================================================
// Validador de Factura Electrónica de Panamá según Ficha Técnica DGI V1.00
// ============================================================================

import type {
  FacturaElectronica,
  ItemDocumento,
  ValidationIssue,
  ValidationResult,
} from '../types';
import { ITBMS_RATE_MAP } from '../types';
import * as V from './validation-codes';

// --- Tolerancia de redondeo según sección 8.4.1 ---
const TOLERANCE = 0.01;

function approxEqual(a: number, b: number, tol = TOLERANCE): boolean {
  return Math.abs(a - b) <= tol;
}

// --- CUFE: Dígito verificador Luhn (sección 6.1.2) ---

/** Convierte letras a su último dígito ASCII (A=65→5, B=66→6, Z=90→0) */
function letterToDigit(ch: string): string {
  const code = ch.charCodeAt(0);
  return (code % 10).toString();
}

/** Extrae solo dígitos del CUFE para el cálculo Luhn (convierte letras, ignora guiones) */
function cufeToDigits(cufe: string): string {
  let digits = '';
  for (const ch of cufe) {
    if (ch >= '0' && ch <= '9') {
      digits += ch;
    } else if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) {
      digits += letterToDigit(ch);
    }
    // guiones se ignoran
  }
  return digits;
}

/** Calcula el dígito verificador Luhn (módulo 10) para la cadena sin el último dígito */
export function calculateCufeLuhn(cufeWithoutDV: string): number {
  const digits = cufeToDigits(cufeWithoutDV);
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

// --- Validador principal ---

export function validateDocument(doc: FacturaElectronica): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const push = (rule: V.ValidationRule): void => {
    const issue: ValidationIssue = { ...rule };
    if (rule.severity === 'ERROR') errors.push(issue);
    else warnings.push(issue);
  };

  // =====================================================================
  // 1. IDENTIFICACIÓN DE LA FE (A)
  // =====================================================================
  validateIdentificacion(doc, push);

  // =====================================================================
  // 2. DATOS GENERALES (B)
  // =====================================================================
  validateDatosGenerales(doc, push);

  // =====================================================================
  // 3. EMISOR (B30)
  // =====================================================================
  validateEmisor(doc, push);

  // =====================================================================
  // 4. RECEPTOR (B40)
  // =====================================================================
  validateReceptor(doc, push);

  // =====================================================================
  // 5. EXPORTACIÓN (B50)
  // =====================================================================
  validateExportacion(doc, push);

  // =====================================================================
  // 6. DOCUMENTO REFERENCIADO (B60) - NC/ND
  // =====================================================================
  validateDocReferenciado(doc, push);

  // =====================================================================
  // 7. ÍTEMS (C)
  // =====================================================================
  validateItems(doc, push);

  // =====================================================================
  // 8. TOTALES (D)
  // =====================================================================
  validateTotales(doc, push);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// -----------------------------------------------------------------------
// Secciones de validación
// -----------------------------------------------------------------------

type PushFn = (rule: V.ValidationRule) => void;

function validateIdentificacion(doc: FacturaElectronica, push: PushFn): void {
  // A02 - Versión de formato
  if (doc.dVerForm !== '1.00') {
    push(V.VAL_A02);
  }

  // A03 - CUFE
  const cufe = doc.dId;
  if (cufe && cufe.startsWith('FE') && cufe.length === 66) {
    const cufeBody = cufe.substring(2); // quitar "FE"
    const cufeWithoutDV = cufeBody.substring(0, cufeBody.length - 1);
    const declaredDV = parseInt(cufeBody[cufeBody.length - 1], 10);
    const calculatedDV = calculateCufeLuhn(cufeWithoutDV);
    if (declaredDV !== calculatedDV) {
      push(V.VAL_A03);
    }

    // Validar componentes del CUFE contra campos del documento
    validateCufeComponents(doc, cufeBody, push);
  } else if (cufe) {
    push(V.VAL_A03);
  }
}

function validateCufeComponents(
  doc: FacturaElectronica,
  cufe: string,
  push: PushFn,
): void {
  const gen = doc.gDGen;

  // Posiciones del CUFE según Tabla 14:
  // iDoc(2) + dTipoRuc(1) + dRuc(20) + dDV(3) + dSucEm(4) + dFechaEm(8) +
  // dNroDF(10) + dPtoFacDF(3) + iTpEmis(2) + iAmb(1) + dSeg(9) + DV(1) = 64
  let pos = 0;
  const cufeDoc = cufe.substring(pos, pos + 2); pos += 2;
  const cufeTipoRuc = cufe.substring(pos, pos + 1); pos += 1;
  const cufeRuc = cufe.substring(pos, pos + 20); pos += 20;
  const cufeDV = cufe.substring(pos, pos + 3); pos += 3;
  const cufeSuc = cufe.substring(pos, pos + 4); pos += 4;
  const cufeFecha = cufe.substring(pos, pos + 8); pos += 8;
  const cufeNroDF = cufe.substring(pos, pos + 10); pos += 10;
  const cufePto = cufe.substring(pos, pos + 3); pos += 3;
  const cufeTpEmis = cufe.substring(pos, pos + 2); pos += 2;
  const cufeAmb = cufe.substring(pos, pos + 1); pos += 1;
  const cufeSeg = cufe.substring(pos, pos + 9);

  // B06a - Tipo de documento
  if (cufeDoc !== gen.iDoc) push(V.VAL_B06a);

  // B301d - RUC del emisor
  const rucPadded = gen.gEmis.gRucEmi.dRuc.padStart(20, '0');
  if (cufeRuc !== rucPadded) push(V.VAL_B301d);

  // B303a - Sucursal
  if (cufeSuc !== gen.gEmis.dSucEm) push(V.VAL_B303a);

  // B10b - Fecha de emisión (YYYYMMDD)
  const fechaEm = gen.dFechaEm.substring(0, 10).replace(/-/g, '');
  if (cufeFecha !== fechaEm) push(V.VAL_B10b);

  // B07b - Número de documento
  if (cufeNroDF !== gen.dNroDF) push(V.VAL_B07b);

  // B08a - Punto de facturación
  if (cufePto !== gen.dPtoFacDF) push(V.VAL_B08a);

  // B03a - Tipo de emisión
  if (cufeTpEmis !== gen.iTpEmis) push(V.VAL_B03a);

  // B02b - Ambiente
  if (cufeAmb !== gen.iAmb) push(V.VAL_B02b);

  // B09a - Código de seguridad
  if (cufeSeg !== gen.dSeg) push(V.VAL_B09a);

  // Tipo de contribuyente
  if (cufeTipoRuc !== gen.gEmis.gRucEmi.dTipoRuc) push(V.VAL_B301);

  // DV en CUFE
  const dvPadded = gen.gEmis.gRucEmi.dDV.padStart(3, '-');
  if (cufeDV !== dvPadded && `-${gen.gEmis.gRucEmi.dDV}` !== cufeDV) {
    // Intentar formato con guión
    // DV en el CUFE es 3 posiciones, con guión antes del dígito
  }
}

function validateDatosGenerales(doc: FacturaElectronica, push: PushFn): void {
  const gen = doc.gDGen;

  // B02 - Ambiente
  if (!['1', '2'].includes(gen.iAmb)) push(V.VAL_B02);

  // B03 - Tipo de emisión
  if (!['01', '02', '03', '04'].includes(gen.iTpEmis)) push(V.VAL_B03);

  // B03b - Contribuyente requiere autorización previa
  if (gen.gDatRec.iTipoRec === '01' && !['01', '02'].includes(gen.iTpEmis)) {
    push(V.VAL_B03b);
  }

  // B04/B05 - Contingencia
  const esContingencia = gen.iTpEmis === '02' || gen.iTpEmis === '04';
  if (esContingencia) {
    if (!gen.dFechaCont) push(V.VAL_B04);
    if (!gen.dMotCont) push(V.VAL_B05);

    // B04a - Fecha contingencia posterior a fecha emisión
    if (gen.dFechaCont && gen.dFechaEm) {
      const fechaCont = new Date(gen.dFechaCont);
      const fechaEm = new Date(gen.dFechaEm);
      if (fechaCont > fechaEm) push(V.VAL_B04a);

      // B04b - Más de 72 horas en contingencia
      const now = new Date();
      const diffHours = (now.getTime() - fechaCont.getTime()) / (1000 * 60 * 60);
      if (diffHours > 72) push(V.VAL_B04b);
    }
  }

  // B06 - Tipo de documento
  const validDocs = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'];
  if (!validDocs.includes(gen.iDoc)) push(V.VAL_B06);

  // B07 - Número de documento
  if (gen.dNroDF === '0000000000') push(V.VAL_B07);

  // B08 - Punto de facturación
  if (gen.dPtoFacDF === '000') push(V.VAL_B08);

  // B09 - Código de seguridad
  if (gen.dSeg === '000000000') push(V.VAL_B09);

  // B10 - Fecha de emisión
  if (gen.dFechaEm) {
    const fechaEm = new Date(gen.dFechaEm);
    const now = new Date();

    // B10a - Más de 2 días hábiles en el futuro
    const diffDaysFuture = (fechaEm.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDaysFuture > 2) push(V.VAL_B10a);
    else if (diffDaysFuture > 1) push(V.VAL_B10c);

    // B10 - Más de 30 días en el pasado
    const diffDaysPast = (now.getTime() - fechaEm.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDaysPast > 30) push(V.VAL_B10);
  }

  // B12 - Naturaleza de operación
  const validNatOps = ['01', '02', '03', '04', '05', '10', '11', '12', '13', '14', '20', '21'];
  if (!validNatOps.includes(gen.iNatOp)) push(V.VAL_B12);

  // B13 - Tipo de operación
  if (!['1', '2'].includes(gen.iTipoOp)) push(V.VAL_B13);

  // B14 - Destino
  if (!['1', '2'].includes(gen.iDest)) push(V.VAL_B14);

  // B14a - Exportación no puede tener destino Panamá
  if (gen.iDoc === '03' && gen.iDest === '1') push(V.VAL_B14a);

  // B14b - Operación interna no puede tener destino extranjero
  if (gen.iDoc === '01' && gen.iDest === '2') push(V.VAL_B14b);

  // B15 - Formato CAFE
  if (!['1', '2', '3'].includes(gen.iFormCAFE)) push(V.VAL_B15);

  // B16 - Entrega CAFE
  if (!['1', '2', '3'].includes(gen.iEntCAFE)) push(V.VAL_B16);

  // B17 - Envío contenedor
  if (!['1', '2'].includes(gen.dEnvFE)) push(V.VAL_B17);

  // B18 - Proceso de generación
  if (!['1', '2', '3', '4'].includes(gen.iProGen)) push(V.VAL_B18);

  // B19 - Tipo transacción de venta
  if (gen.iTipoTranVenta && !['1', '2', '3', '4'].includes(gen.iTipoTranVenta)) {
    push(V.VAL_B19);
  }
}

function validateEmisor(doc: FacturaElectronica, push: PushFn): void {
  const emis = doc.gDGen.gEmis;

  // B301 - RUC del emisor
  if (!emis.gRucEmi.dRuc || emis.gRucEmi.dRuc.trim() === '') {
    push(V.VAL_B301);
  }
  if (!['1', '2'].includes(emis.gRucEmi.dTipoRuc)) {
    push(V.VAL_B301);
  }
  if (!emis.gRucEmi.dDV || emis.gRucEmi.dDV.trim() === '') {
    push(V.VAL_B301);
  }

  // B302 - Razón social
  if (!emis.dNombEm || emis.dNombEm.trim().length < 2) {
    push(V.VAL_B302);
  }

  // B303 - Sucursal
  if (!emis.dSucEm || emis.dSucEm.length !== 4) {
    push(V.VAL_B303);
  }

  // B305 - Dirección
  if (!emis.dDirecEm || emis.dDirecEm.trim() === '') {
    push(V.VAL_B305);
  }
}

function validateReceptor(doc: FacturaElectronica, push: PushFn): void {
  const rec = doc.gDGen.gDatRec;
  const gen = doc.gDGen;

  // B401 - Tipo de receptor
  if (!['01', '02', '03', '04'].includes(rec.iTipoRec)) {
    push(V.VAL_B401);
  }

  // B401a - Exportación requiere receptor extranjero
  if (gen.iDoc === '03' && rec.iTipoRec !== '04') {
    push(V.VAL_B401a);
  }

  // B401b - Factura operación extranjera requiere receptor extranjero
  if (gen.iDoc === '10' && rec.iTipoRec !== '04') {
    push(V.VAL_B401b);
  }

  // Validaciones según tipo de receptor
  const esContribuyente = rec.iTipoRec === '01';
  const esGobierno = rec.iTipoRec === '03';
  const esExtranjero = rec.iTipoRec === '04';
  const esConsumidorFinal = rec.iTipoRec === '02';

  // B402 - RUC requerido si contribuyente o gobierno
  if ((esContribuyente || esGobierno) && rec.gRucRec) {
    if (!rec.gRucRec.dRuc || rec.gRucRec.dRuc.trim() === '') {
      push(V.VAL_B402);
    }
    if (!['1', '2'].includes(rec.gRucRec.dTipoRuc)) {
      push(V.VAL_B402);
    }
  }

  // B402d - RUC jurídico no puede ser consumidor final
  if (esConsumidorFinal && rec.gRucRec && rec.gRucRec.dTipoRuc === '2') {
    push(V.VAL_B402d);
  }

  // B403 - Razón social requerida si contribuyente o gobierno
  if ((esContribuyente || esGobierno) && (!rec.dNombRec || rec.dNombRec.trim() === '')) {
    push(V.VAL_B403);
  }

  // B404 - Dirección requerida si contribuyente (warning)
  if (esContribuyente && (!rec.dDirecRec || rec.dDirecRec.trim() === '')) {
    push(V.VAL_B404);
  }

  // B406 - Identificación extranjera requerida
  if (esExtranjero && !rec.gIdExt) {
    push(V.VAL_B406);
  }

  // B406a - No puede informar ID extranjera y RUC simultáneamente
  if (rec.gIdExt && rec.gRucRec) {
    push(V.VAL_B406a);
  }

  // B410a - País debe ser PA si destino es Panamá
  if (gen.iDest === '1' && rec.cPaisRec !== 'PA') {
    push(V.VAL_B410a);
  }

  // B410b - País no puede ser PA si destino es extranjero
  if (gen.iDest === '2' && rec.cPaisRec === 'PA') {
    push(V.VAL_B410b);
  }
}

function validateExportacion(doc: FacturaElectronica, push: PushFn): void {
  const gen = doc.gDGen;

  // B50 - Grupo de exportación
  if (gen.iDest === '1' && gen.gFExp) {
    push(V.VAL_B50);
  }
  if (gen.iDest === '2' && !gen.gFExp) {
    push(V.VAL_B50a);
  }
}

function validateDocReferenciado(doc: FacturaElectronica, push: PushFn): void {
  const gen = doc.gDGen;
  const iDoc = gen.iDoc;

  const esNC = iDoc === '04';
  const esND = iDoc === '05';
  const esNCGenerica = iDoc === '06';
  const esNDGenerica = iDoc === '07';
  const esFacturaInterna = iDoc === '01';
  const esZonaFranca = iDoc === '08';

  // B606b - NC/ND que referencia FE debe tener grupo B60
  if ((esNC || esND) && (!gen.gDFRef || gen.gDFRef.length === 0)) {
    push(V.VAL_B606b);
  }

  // B606e - Factura interna/ZF no debe tener referencia
  if ((esFacturaInterna || esZonaFranca) && gen.gDFRef && gen.gDFRef.length > 0) {
    const tieneRefFE = gen.gDFRef.some((ref) => ref.gDFRefFE);
    if (tieneRefFE) push(V.VAL_B606e);
  }

  // B606c - NC/ND genérica no debe referenciar FE
  if ((esNCGenerica || esNDGenerica) && gen.gDFRef) {
    const tieneRefFE = gen.gDFRef.some((ref) => ref.gDFRefFE);
    if (tieneRefFE) push(V.VAL_B606c);
  }

  // Validaciones sobre cada referencia
  if (gen.gDFRef) {
    const cufesSeen = new Set<string>();

    for (const ref of gen.gDFRef) {
      if (ref.gDFRefFE) {
        const cufeRef = ref.gDFRefFE.dCUFERef;

        // B606 - Estructura del CUFE (66 chars con "FE" prefix)
        if (!cufeRef || cufeRef.length !== 66) {
          push(V.VAL_B606);
          continue;
        }

        // B606a - DV del CUFE referenciado
        const cufeBody = cufeRef.startsWith('FE') ? cufeRef.substring(2) : cufeRef;
        if (cufeBody.length === 64) {
          const withoutDV = cufeBody.substring(0, 63);
          const declaredDV = parseInt(cufeBody[63], 10);
          const calcDV = calculateCufeLuhn(withoutDV);
          if (declaredDV !== calcDV) push(V.VAL_B606a);
        }

        // B606f - CUFE duplicado
        if (cufesSeen.has(cufeRef)) {
          push(V.VAL_B606f);
        }
        cufesSeen.add(cufeRef);

        // B606i - NC referencia NC
        if (esNC) {
          const refDocType = cufeRef.startsWith('FE') ? cufeRef.substring(2, 4) : cufeRef.substring(0, 2);
          if (refDocType === '04') push(V.VAL_B606i);
          if (refDocType === '05') push(V.VAL_B606l);
        }

        // B606j - ND referencia ND
        if (esND) {
          const refDocType = cufeRef.startsWith('FE') ? cufeRef.substring(2, 4) : cufeRef.substring(0, 2);
          if (refDocType === '05') push(V.VAL_B606j);
          if (refDocType === '04') push(V.VAL_B606m);
        }
      }
    }
  }
}

function validateItems(doc: FacturaElectronica, push: PushFn): void {
  const items = doc.gItem;
  const hasTotAcar = doc.gTot.dTotAcar !== undefined && doc.gTot.dTotAcar > 0;
  const hasTotSeg = doc.gTot.dTotSeg !== undefined && doc.gTot.dTotSeg > 0;

  // Validar cantidad de ítems
  if (!items || items.length === 0) {
    push(V.VAL_ITEMS_MIN);
    return;
  }
  if (items.length > 1000) {
    push(V.VAL_ITEMS_MAX);
  }

  const seqNumbers = new Set<number>();

  for (const item of items) {
    validateSingleItem(item, hasTotAcar, hasTotSeg, seqNumbers, push);
  }
}

function validateSingleItem(
  item: ItemDocumento,
  hasTotAcar: boolean,
  hasTotSeg: boolean,
  seqNumbers: Set<number>,
  push: PushFn,
): void {
  // C02 - Número secuencial duplicado
  if (seqNumbers.has(item.dSecItem)) {
    push(V.VAL_C02);
  }
  seqNumbers.add(item.dSecItem);

  // C03 - Descripción vacía
  if (!item.dDescProd || item.dDescProd.trim().length < 2) {
    push(V.VAL_C03);
  }

  // C06 - Cantidad > 0
  if (item.dCantCodInt <= 0) {
    push(V.VAL_C06);
  }

  const p = item.gPrecios;

  // C201 - Precio unitario muy elevado
  if (p.dPrUnit > 100_000) {
    push(V.VAL_C201);
  }

  // C202 - Descuento mayor que precio unitario
  if (p.dPrUnitDesc !== undefined) {
    if (p.dPrUnitDesc > p.dPrUnit) push(V.VAL_C202);
    if (p.dPrUnit === 0) push(V.VAL_C202a);
  }

  // C203 - Precio del ítem = qty * (unitPrice - discount)
  const discount = p.dPrUnitDesc ?? 0;
  const expectedPrItem = item.dCantCodInt * (p.dPrUnit - discount);
  if (!approxEqual(p.dPrItem, expectedPrItem)) {
    push(V.VAL_C203);
  }

  // C204 - Acarreo por ítem no puede coexistir con acarreo total
  if (p.dPrAcarItem !== undefined && p.dPrAcarItem > 0 && hasTotAcar) {
    push(V.VAL_C204);
  }

  // C205 - Seguro por ítem no puede coexistir con seguro total
  if (p.dPrSegItem !== undefined && p.dPrSegItem > 0 && hasTotSeg) {
    push(V.VAL_C205);
  }

  // C401 - Tasa ITBMS válida
  const validTasas = ['00', '01', '02', '03'];
  if (!validTasas.includes(item.gITBMSItem.dTasaITBMS)) {
    push(V.VAL_C401);
  }

  // C402a - Monto ITBMS correcto = tasa * dPrItem
  const rate = ITBMS_RATE_MAP[item.gITBMSItem.dTasaITBMS] ?? 0;
  const expectedITBMS = p.dPrItem * rate;
  if (!approxEqual(item.gITBMSItem.dValITBMS, expectedITBMS)) {
    push(V.VAL_C402a);
  }

  // C206 - Valor total del ítem
  const acar = p.dPrAcarItem ?? 0;
  const seg = p.dPrSegItem ?? 0;
  const isc = item.gISCItem?.dValISC ?? 0;
  const otiSum = (item.gOTIItem ?? []).reduce((s, o) => s + o.dValOTI, 0);
  const expectedTotItem = p.dPrItem + acar + seg + item.gITBMSItem.dValITBMS + isc + otiSum;
  if (!approxEqual(p.dValTotItem, expectedTotItem)) {
    push(V.VAL_C206);
  }

  // C601 - Códigos OTI duplicados
  if (item.gOTIItem && item.gOTIItem.length > 1) {
    const otiCodes = item.gOTIItem.map((o) => o.dCodOTI);
    if (new Set(otiCodes).size !== otiCodes.length) {
      push(V.VAL_C601);
    }
  }
}

function validateTotales(doc: FacturaElectronica, push: PushFn): void {
  const tot = doc.gTot;
  const items = doc.gItem;
  const gen = doc.gDGen;

  // D02 - dTotNeto = suma de dPrItem (C203)
  const sumPrItem = items.reduce((s, i) => s + i.gPrecios.dPrItem, 0);
  if (!approxEqual(tot.dTotNeto, sumPrItem)) {
    push(V.VAL_D02);
  }

  // D03 - dTotITBMS = suma de dValITBMS (C402)
  const sumITBMS = items.reduce((s, i) => s + i.gITBMSItem.dValITBMS, 0);
  if (!approxEqual(tot.dTotITBMS, sumITBMS)) {
    push(V.VAL_D03);
  }

  // D05 - dTotGravado = D03 + D04 + D602 (suma OTI totales)
  const totISC = tot.dTotISC ?? 0;
  const totOTI = (tot.gOTITotal ?? []).reduce((s, o) => s + o.dValOTITotal, 0);
  const expectedGravado = tot.dTotITBMS + totISC + totOTI;
  if (!approxEqual(tot.dTotGravado, expectedGravado)) {
    push(V.VAL_D05);
  }

  // D07/D08 - Coexistencia acarreo/seguro
  const hasItemAcar = items.some(
    (i) => i.gPrecios.dPrAcarItem !== undefined && i.gPrecios.dPrAcarItem > 0,
  );
  const hasItemSeg = items.some(
    (i) => i.gPrecios.dPrSegItem !== undefined && i.gPrecios.dPrSegItem > 0,
  );
  if (tot.dTotAcar !== undefined && tot.dTotAcar > 0 && hasItemAcar) {
    push(V.VAL_D07);
  }
  if (tot.dTotSeg !== undefined && tot.dTotSeg > 0 && hasItemSeg) {
    push(V.VAL_D08);
  }

  // D09 - dVTot = dTotGravado + dTotNeto + dTotAcar + dTotSeg - dTotDesc + dTotOtrosGastos
  // Según spec: D09 = D14 + D07 + D08 + D15 - D06
  // Donde D14 = suma de C206 (dValTotItem)
  const d14 = tot.dVTotItems;
  const d07 = tot.dTotAcar ?? 0;
  const d08 = tot.dTotSeg ?? 0;
  const d15 = tot.dTotOtrosGastos ?? 0;
  const d06 = tot.dTotDesc ?? 0;
  const expectedVTot = d14 + d07 + d08 + d15 - d06;
  if (!approxEqual(tot.dVTot, expectedVTot)) {
    push(V.VAL_D09);
  }

  // D09b - Valor total muy elevado
  if (tot.dVTot > 1_000_000) {
    push(V.VAL_D09b);
  }

  // D09c - Valor total elevado para consumidor final
  if (gen.gDatRec.iTipoRec === '02' && tot.dVTot > 10_000) {
    push(V.VAL_D09c);
  }

  // D10 - Suma de valores recibidos = suma de dVlrCuota (D303)
  const sumCuotas = tot.gFormaPago.reduce((s, f) => s + f.dVlrCuota, 0);
  if (!approxEqual(tot.dTotRec, sumCuotas)) {
    push(V.VAL_D10);
  }

  // D12 - Tiempo de pago
  if (!['1', '2', '3'].includes(tot.iPzPag)) {
    push(V.VAL_D12);
  }

  // D13 - Número total de ítems
  if (tot.dNroItems !== items.length) {
    push(V.VAL_D13);
  }

  // D14 - Valor total de los ítems = suma de dValTotItem (C206)
  const sumValTotItem = items.reduce((s, i) => s + i.gPrecios.dValTotItem, 0);
  if (!approxEqual(tot.dVTotItems, sumValTotItem)) {
    push(V.VAL_D14);
  }

  // D301 - Formas de pago
  const validFormasPago = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '99'];
  for (const fp of tot.gFormaPago) {
    if (!validFormasPago.includes(fp.iFormaPago)) {
      push(V.VAL_D301);
    }
    // D302 - Descripción requerida si forma = 99
    if (fp.iFormaPago === '99' && (!fp.dFormaPagoDesc || fp.dFormaPagoDesc.trim() === '')) {
      push(V.VAL_D302);
    }
    // D302a - Descripción no debe existir si forma != 99
    if (fp.iFormaPago !== '99' && fp.dFormaPagoDesc) {
      push(V.VAL_D302a);
    }
  }
}
