// ============================================================================
// Tipos del modelo de Factura Electrónica de Panamá (SFEP)
// Basado en: Ficha Técnica de la FE para PAC V1.00 - Abril 2025
// ============================================================================

// --- Enums según catálogos DGI ---

/** B02 - Ambiente de destino */
export enum Ambiente {
  PRODUCCION = '1',
  PRUEBAS = '2',
}

/** B03 - Tipo de emisión */
export enum TipoEmision {
  USO_PREVIO_NORMAL = '01',
  USO_PREVIO_CONTINGENCIA = '02',
  USO_POSTERIOR_NORMAL = '03',
  USO_POSTERIOR_CONTINGENCIA = '04',
}

/** B06 - Tipo de documento fiscal */
export enum TipoDocumento {
  FACTURA_OPERACION_INTERNA = '01',
  FACTURA_IMPORTACION = '02',
  FACTURA_EXPORTACION = '03',
  NOTA_CREDITO_FE = '04',
  NOTA_DEBITO_FE = '05',
  NOTA_CREDITO_GENERICA = '06',
  NOTA_DEBITO_GENERICA = '07',
  FACTURA_ZONA_FRANCA = '08',
  REEMBOLSO = '09',
  FACTURA_OPERACION_EXTRANJERA = '10',
}

/** B12 - Naturaleza de la operación */
export enum NaturalezaOperacion {
  VENTA = '01',
  EXPORTACION = '02',
  REEXPORTACION = '03',
  VENTA_FUENTE_EXTRANJERA = '04',
  SERVICIO_FUENTE_EXTRANJERA = '05',
  TRANSFERENCIA = '10',
  DEVOLUCION = '11',
  CONSIGNACION = '12',
  REMESA = '13',
  ENTREGA_GRATUITA = '14',
  COMPRA = '20',
  IMPORTACION = '21',
}

/** B13 - Tipo de operación */
export enum TipoOperacion {
  SALIDA_VENTA = '1',
  ENTRADA_COMPRA = '2',
}

/** B401 - Tipo de receptor */
export enum TipoReceptor {
  CONTRIBUYENTE = '01',
  CONSUMIDOR_FINAL = '02',
  GOBIERNO = '03',
  EXTRANJERO = '04',
}

/** C401 - Tasa de ITBMS */
export enum TasaITBMS {
  EXENTO = '00',
  SIETE = '01',
  DIEZ = '02',
  QUINCE = '03',
}

/** Mapeo tasa ITBMS código -> porcentaje decimal */
export const ITBMS_RATE_MAP: Record<string, number> = {
  '00': 0.0,
  '01': 0.07,
  '02': 0.1,
  '03': 0.15,
};

/** B3011 / B4021 - Tipo de contribuyente */
export enum TipoContribuyente {
  NATURAL = '1',
  JURIDICO = '2',
}

/** D12 - Tiempo de pago */
export enum TiempoPago {
  CONTADO = '1',
  CREDITO = '2',
  MIXTO = '3',
}

/** D301 - Forma de pago */
export enum FormaPago {
  CREDITO = '01',
  EFECTIVO = '02',
  TARJETA_CREDITO = '03',
  TARJETA_DEBITO = '04',
  TARJETA_FIDELIZACION = '05',
  VALE = '06',
  TARJETA_REGALO = '07',
  TRANSFERENCIA = '08',
  CHEQUE = '09',
  PUNTO_PAGO = '10',
  OTRO = '99',
}

/** B15 - Formato de generación del CAFE */
export enum FormatoCAFE {
  SIN_CAFE = '1',
  CINTA_PAPEL = '2',
  PAPEL_CARTA = '3',
}

/** B16 - Manera de entrega del CAFE */
export enum EntregaCAFE {
  SIN_CAFE = '1',
  PAPEL = '2',
  ELECTRONICO = '3',
}

/** B18 - Proceso de generación */
export enum ProcesoGeneracion {
  SISTEMA_CONTRIBUYENTE = '1',
  TERCERO_CONTRATADO = '2',
  TERCERO_GRATUITO = '3',
  WEB_DGI = '4',
}

/** D401 - Códigos de retención */
export enum CodigoRetencion {
  SERVICIO_PROFESIONAL_ESTADO = '1',
  VENTA_BIENES_ESTADO = '2',
  NO_DOMICILIADO = '3',
  COMPRA_BIENES = '4',
  COMERCIO_TC_TD = '7',
  OTROS = '8',
}

/** C601 / D601 - Códigos OTI */
export enum CodigoOTI {
  SUME_911 = '01',
  PORTABILIDAD = '02',
  SEGURO_5 = '03',
  ATTT_SEGURO_AUTOS = '04',
  SALIDA_AEROPUERTO = '05',
  INCENTIVO_AEROPUERTO = '06',
  SEGURIDAD_AEROPUERTO = '07',
  OTROS_CARGOS = '08',
  COMBUSTIBLE = '09',
}

// --- Interfaces del modelo XML ---

/** RUC group (B301/B402/B601/B701) */
export interface GrupoRuc {
  dTipoRuc: string; // 1=Natural, 2=Jurídico
  dRuc: string;
  dDV: string;
}

/** Ubicación geográfica (B306/B405) */
export interface GrupoUbicacion {
  dCodUbi: string;
  dCorreg: string;
  dDistr: string;
  dProv: string;
}

/** B30 - Grupo emisor */
export interface GrupoEmisor {
  gRucEmi: GrupoRuc;
  dNombEm: string;
  dSucEm: string;
  dCoordEm: string;
  dDirecEm: string;
  gUbiEm: GrupoUbicacion;
  dTfnEm?: string[];
  dCorElectEmi?: string[];
}

/** B406 - Identificación extranjera */
export interface GrupoIdExtranjero {
  dIdExt: string;
  dPaisExt?: string;
}

/** B40 - Grupo receptor */
export interface GrupoReceptor {
  iTipoRec: string;
  gRucRec?: GrupoRuc;
  dNombRec?: string;
  dDirecRec?: string;
  gUbiRec?: GrupoUbicacion;
  gIdExt?: GrupoIdExtranjero;
  dTfnRec?: string[];
  dCorElectRec?: string[];
  cPaisRec: string;
  dPaisRecDesc?: string;
}

/** B50 - Grupo exportación */
export interface GrupoExportacion {
  cCondEntr: string;
  cMoneda?: string;
  cMonedaDesc?: string;
  dCambio?: number;
  dVTotEst?: number;
  dPuertoEmbarq?: string;
}

/** B60 - Documento fiscal referenciado */
export interface GrupoDocReferenciado {
  gRucEmDFRef: GrupoRuc;
  dNombEmRef: string;
  dFechaDFRef: string;
  gDFRefFE?: { dCUFERef: string };
  gDFRefFacPap?: { dNroFacPap: string };
  gDFRefFacIE?: { dNroFacIE: string };
}

/** B70 - Autorizados a descargar */
export interface GrupoAutorizado {
  gRucAutXML: GrupoRuc;
}

/** C20 - Grupo precios del ítem */
export interface GrupoPrecios {
  dPrUnit: number;
  dPrUnitDesc?: number;
  dPrItem: number;
  dPrAcarItem?: number;
  dPrSegItem?: number;
  dValTotItem: number;
}

/** C40 - Grupo ITBMS del ítem */
export interface GrupoITBMS {
  dTasaITBMS: string;
  dValITBMS: number;
}

/** C50 - Grupo ISC del ítem */
export interface GrupoISC {
  dTasaISC?: number;
  dValISC: number;
}

/** C60 - Grupo OTI del ítem */
export interface GrupoOTIItem {
  dCodOTI: string;
  dValOTI: number;
}

/** C01 - Ítem del documento */
export interface ItemDocumento {
  dSecItem: number;
  dDescProd: string;
  dCodProd?: string;
  cUnidad?: string;
  dCantCodInt: number;
  dFechaFab?: string;
  dFechaCad?: string;
  dCodCPBSabr?: string;
  dCodCPBScmp?: string;
  cUnidadCPBS?: string;
  dInfEmFE?: string;
  gPrecios: GrupoPrecios;
  gITBMSItem: GrupoITBMS;
  gISCItem?: GrupoISC;
  gOTIItem?: GrupoOTIItem[];
}

/** D20 - Descuentos/bonificaciones adicionales */
export interface GrupoDescuento {
  dDescBonwordsif: string;
  dValDesc: number;
}

/** D30 - Forma de pago */
export interface GrupoFormaPago {
  iFormaPago: string;
  dFormaPagoDesc?: string;
  dVlrCuota: number;
}

/** D40 - Retenciones */
export interface GrupoRetencion {
  cCodRetenc: string;
  cValRetenc: number;
}

/** D50 - Pago a plazo */
export interface GrupoPagoPlazo {
  dSecItem: number;
  dFecItPlazo: string;
  dValItPlazo: number;
  dInfPagPlazo?: string;
}

/** D60 - Total OTI */
export interface GrupoOTITotal {
  dCodOTITotal: string;
  dValOTITotal: number;
}

/** D01 - Totales del documento */
export interface GrupoTotales {
  dTotNeto: number;
  dTotITBMS: number;
  dTotISC?: number;
  dTotGravado: number;
  dTotDesc?: number;
  dTotAcar?: number;
  dTotSeg?: number;
  dVTot: number;
  dTotRec: number;
  dVuelto?: number;
  iPzPag: string;
  dNroItems: number;
  dVTotItems: number;
  dTotOtrosGastos?: number;
  gDescBonif?: GrupoDescuento[];
  gFormaPago: GrupoFormaPago[];
  gRetenc?: GrupoRetencion;
  gPagPlazo?: GrupoPagoPlazo[];
  gOTITotal?: GrupoOTITotal[];
}

/** B01 - Datos generales de la transacción */
export interface DatosGenerales {
  iAmb: string;
  iTpEmis: string;
  dFechaCont?: string;
  dMotCont?: string;
  iDoc: string;
  dNroDF: string;
  dPtoFacDF: string;
  dSeg: string;
  dFechaEm: string;
  dFechaSalida?: string;
  iNatOp: string;
  iTipoOp: string;
  iDest: string;
  iFormCAFE: string;
  iEntCAFE: string;
  dEnvFE: string;
  iProGen: string;
  iTipoTranVenta?: string;
  iTipoSuc?: string;
  dInfEmFE?: string;
  gEmis: GrupoEmisor;
  gDatRec: GrupoReceptor;
  gFExp?: GrupoExportacion;
  gDFRef?: GrupoDocReferenciado[];
  gAutXML?: GrupoAutorizado[];
}

/** A01 - Raíz de la Factura Electrónica */
export interface FacturaElectronica {
  dVerForm: string;
  dId: string; // "FE" + CUFE (66 chars)
  gDGen: DatosGenerales;
  gItem: ItemDocumento[];
  gTot: GrupoTotales;
}

// --- Interfaces de resultado de validación ---

export type Severity = 'ERROR' | 'WARNING';

export interface ValidationIssue {
  code: string;
  message: string;
  field: string;
  severity: Severity;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

// --- Interfaces para respuesta DGI ---

export interface DgiResponse {
  status: 'accepted' | 'rejected' | 'pending';
  code: string;
  message: string;
  timestamp: Date;
}
