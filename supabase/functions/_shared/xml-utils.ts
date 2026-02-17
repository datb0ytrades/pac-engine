// ============================================================================
// Utilidades XML para Deno Edge Functions
// ============================================================================

import { XMLBuilder, XMLParser } from 'fast-xml-parser';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
});

export function parseXml<T = Record<string, unknown>>(xml: string): T {
  return xmlParser.parse(xml) as T;
}

export function buildXml(obj: Record<string, unknown>): string {
  return xmlBuilder.build(obj) as string;
}
