import type { Severity } from '../types.ts';

// ============================================================================
// Códigos de validación según Ficha Técnica DGI Panamá V1.00
// Sección 8.4 - Validaciones del Formato de la FE
// ============================================================================

export interface ValidationRule {
  code: string;
  message: string;
  field: string;
  severity: Severity;
}

function err(code: string, message: string, field: string): ValidationRule {
  return { code, message, field, severity: 'ERROR' };
}

function warn(code: string, message: string, field: string): ValidationRule {
  return { code, message, field, severity: 'WARNING' };
}

// --- Identificación de la FE (A) ---
export const VAL_A02 = err('1000', 'Versión de formato no soportada', 'dVerForm');
export const VAL_A03 = err('1001', 'Dígito verificador del CUFE inválido', 'dId');
export const VAL_A03a = err('1002', 'Documento duplicado', 'dId');

// --- Datos generales (B) ---
export const VAL_B02 = err('1500', 'Ambiente de destino de la FE inválido', 'iAmb');
export const VAL_B02b = err('1502', 'CUFE malformado: Ambiente de destino', 'iAmb');
export const VAL_B03 = err('1503', 'Tipo de emisión inválida', 'iTpEmis');
export const VAL_B03a = err('1504', 'CUFE malformado: Tipo de emisión', 'iTpEmis');
export const VAL_B03b = err('1505', 'Este tipo de operación exige autorización previa', 'iTpEmis');
export const VAL_B04 = err('1506', 'Fecha/hora de contingencia no informada', 'dFechaCont');
export const VAL_B04a = err('1507', 'Fecha/hora de contingencia posterior a fecha de emisión', 'dFechaCont');
export const VAL_B04b = warn('1508', 'Tiempo excesivo en operación en contingencia (>72h)', 'dFechaCont');
export const VAL_B05 = err('1509', 'Razón de contingencia no informada', 'dMotCont');
export const VAL_B06 = err('1510', 'Tipo de documento inválido', 'iDoc');
export const VAL_B06a = err('1511', 'CUFE malformado: Tipo de documento', 'iDoc');
export const VAL_B07 = err('1512', 'Número del documento fiscal inválido', 'dNroDF');
export const VAL_B07b = err('1514', 'CUFE malformado: Número del documento fiscal', 'dNroDF');
export const VAL_B08 = err('1515', 'Punto de facturación inválido', 'dPtoFacDF');
export const VAL_B08a = err('1516', 'CUFE malformado: Punto de facturación', 'dPtoFacDF');
export const VAL_B09 = err('1517', 'Código de seguridad inválido', 'dSeg');
export const VAL_B09a = err('1518', 'CUFE malformado: Código de seguridad', 'dSeg');
export const VAL_B10 = warn('1519', 'Fecha de emisión muy antigua (>30 días)', 'dFechaEm');
export const VAL_B10a = err('1520', 'Fecha de emisión muy alejada en el futuro (>2 días hábiles)', 'dFechaEm');
export const VAL_B10b = err('1521', 'CUFE malformado: Fecha de emisión', 'dFechaEm');
export const VAL_B10c = warn('1535', 'Fecha de emisión en el futuro, posterior a 24 horas', 'dFechaEm');
export const VAL_B12 = err('1524', 'Naturaleza de la operación inválida', 'iNatOp');
export const VAL_B13 = err('1525', 'Tipo de operación inválido', 'iTipoOp');
export const VAL_B14 = err('1526', 'Tipo de destino inválido', 'iDest');
export const VAL_B14a = err('1533', 'Destino no puede ser Panamá si documento es exportación', 'iDest');
export const VAL_B14b = err('1534', 'Destino no puede ser extranjero si documento es factura de operación interna', 'iDest');
export const VAL_B15 = err('1527', 'Formato de generación del CAFE inválido', 'iFormCAFE');
export const VAL_B16 = err('1528', 'Manera de entrega del CAFE inválida', 'iEntCAFE');
export const VAL_B17 = err('1529', 'Envío del contenedor inválido', 'dEnvFE');
export const VAL_B18 = err('1530', 'Proceso de generación de la FE inválido', 'iProGen');
export const VAL_B19 = err('1531', 'Tipo de transacción de venta inválido', 'iTipoTranVenta');

// --- Emisor (B30x) ---
export const VAL_B301 = err('1560', 'Regla de formación del RUC del emisor inválida', 'gRucEmi');
export const VAL_B301d = err('1564', 'CUFE malformado: RUC del emisor', 'gRucEmi.dRuc');
export const VAL_B302 = err('1565', 'Razón social del emisor vacía', 'dNombEm');
export const VAL_B303 = err('1566', 'Código de sucursal inválido', 'dSucEm');
export const VAL_B303a = err('1567', 'CUFE malformado: Código de sucursal', 'dSucEm');
export const VAL_B305 = err('1568', 'Dirección del establecimiento del emisor vacía', 'dDirecEm');

// --- Receptor (B40x) ---
export const VAL_B401 = err('1600', 'Tipo de receptor inválido', 'iTipoRec');
export const VAL_B401a = err('1620', 'Tipo receptor debe ser extranjero para documento de exportación', 'iTipoRec');
export const VAL_B401b = err('1623', 'Tipo receptor debe ser extranjero para factura de operación extranjera', 'iTipoRec');
export const VAL_B402 = err('1601', 'Regla de formación del RUC del receptor inválida', 'gRucRec');
export const VAL_B402d = err('1621', 'RUC jurídico con tipo receptor consumidor final', 'gRucRec');
export const VAL_B403 = err('1605', 'Razón social del receptor no informada', 'dNombRec');
export const VAL_B404 = warn('1606', 'Dirección del receptor no informada', 'dDirecRec');
export const VAL_B406 = err('1618', 'Identificación extranjera no informada para receptor extranjero', 'gIdExt');
export const VAL_B406a = err('1619', 'No puede informar grupo de ID extranjera y RUC simultáneamente', 'gIdExt');
export const VAL_B410a = err('1611', 'País del receptor debe ser PA si destino es Panamá', 'cPaisRec');
export const VAL_B410b = err('1612', 'País del receptor no puede ser PA si destino es extranjero', 'cPaisRec');

// --- Exportación (B50x) ---
export const VAL_B50 = err('1650', 'Grupo de exportación informado en operación interna', 'gFExp');
export const VAL_B50a = err('1651', 'Grupo de exportación no informado en operación de exportación', 'gFExp');

// --- Documento referenciado (B60x) ---
export const VAL_B606b = err('1705', 'Nota de débito/crédito no referencia ningún documento fiscal', 'gDFRef');
export const VAL_B606c = err('1706', 'Nota de débito/crédito genérica no debe referenciar una FE', 'gDFRef');
export const VAL_B606e = err('1708', 'Factura interna o de zona franca no debe referenciar una FE', 'gDFRef');
export const VAL_B606 = err('1703', 'Estructura del CUFE de FE referenciada inválida', 'dCUFERef');
export const VAL_B606a = err('1704', 'Dígito verificador del CUFE de FE referenciada inválido', 'dCUFERef');
export const VAL_B606f = err('1709', 'CUFE referenciado duplicado en nota de crédito/débito', 'dCUFERef');
export const VAL_B606i = err('1712', 'Nota de crédito referencia una nota de crédito', 'dCUFERef');
export const VAL_B606j = err('1713', 'Nota de débito referencia una nota de débito', 'dCUFERef');
export const VAL_B606l = err('1715', 'Nota de crédito referencia una nota de débito', 'dCUFERef');
export const VAL_B606m = err('1716', 'Nota de débito referencia una nota de crédito', 'dCUFERef');

// --- Ítems (C) ---
export const VAL_C02 = err('2001', 'Número secuencial del ítem duplicado', 'dSecItem');
export const VAL_C03 = err('2000', 'Descripción del producto o servicio vacía', 'dDescProd');
export const VAL_C06 = err('2000', 'Cantidad del producto debe ser mayor a 0', 'dCantCodInt');
export const VAL_C201 = warn('2050', 'Precio unitario muy elevado (>100,000)', 'dPrUnit');
export const VAL_C202 = err('2051', 'Valor del descuento superior al precio unitario', 'dPrUnitDesc');
export const VAL_C202a = err('2052', 'Descuento informado en operación no valorada', 'dPrUnitDesc');
export const VAL_C203 = err('2053', 'Precio del ítem inválido (qty * (unit - desc) != dPrItem)', 'dPrItem');
export const VAL_C204 = err('2054', 'Acarreo por ítem no puede coexistir con acarreo total (D07)', 'dPrAcarItem');
export const VAL_C205 = err('2055', 'Seguro por ítem no puede coexistir con seguro total (D08)', 'dPrSegItem');
export const VAL_C206 = err('2056', 'Valor total del ítem inválido', 'dValTotItem');
export const VAL_C401 = err('2150', 'Tasa de ITBMS inválida', 'dTasaITBMS');
export const VAL_C402a = err('2152', 'Monto del ITBMS del ítem inválido', 'dValITBMS');
export const VAL_C601 = err('2300', 'Código de OTI por ítem duplicado', 'dCodOTI');

// --- Totales (D) ---
export const VAL_D02 = err('2500', 'Suma de precios antes de impuesto inválida', 'dTotNeto');
export const VAL_D03 = err('2501', 'Total ITBMS inválido', 'dTotITBMS');
export const VAL_D05 = err('2503', 'Suma total de monto gravado inválida', 'dTotGravado');
export const VAL_D07 = err('2505', 'Acarreo total no puede coexistir con acarreo por ítem', 'dTotAcar');
export const VAL_D08 = err('2506', 'Seguro total no puede coexistir con seguro por ítem', 'dTotSeg');
export const VAL_D09 = err('2507', 'Valor total de la factura inválido', 'dVTot');
export const VAL_D09b = warn('2509', 'Valor total de la factura muy elevado (>1,000,000)', 'dVTot');
export const VAL_D09c = warn('2515', 'Valor total elevado en venta a consumidor final (>10,000)', 'dVTot');
export const VAL_D10 = err('2510', 'Suma de los valores recibidos inválida', 'dTotRec');
export const VAL_D12 = err('2512', 'Tiempo de pago inválido', 'iPzPag');
export const VAL_D13 = err('2513', 'Número total de ítems inválido', 'dNroItems');
export const VAL_D14 = err('2514', 'Valor total de los ítems inválido', 'dVTotItems');
export const VAL_D301 = err('2600', 'Forma de pago inválida', 'iFormaPago');
export const VAL_D302 = err('2601', 'Falta descripción de forma de pago no listada', 'dFormaPagoDesc');
export const VAL_D302a = err('2602', 'Descripción de forma de pago informada con código existente', 'dFormaPagoDesc');

// --- Items count ---
export const VAL_ITEMS_MIN = err('2000', 'Debe incluir al menos 1 ítem', 'gItem');
export const VAL_ITEMS_MAX = err('2000', 'No puede incluir más de 1000 ítems', 'gItem');
