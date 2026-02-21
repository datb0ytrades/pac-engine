// ============================================================================
// Edge Function: scan-receipt
// POST / { imageBase64 } | { imageUrl }
// Extrae datos de facturas panameñas usando Claude Vision
// ============================================================================

import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { errorResponse, ValidationError } from '../_shared/errors.ts';
import { verifyAuth } from '../_shared/auth.ts';

interface ScanRequest {
  imageBase64?: string;
  imageUrl?: string;
}

interface ScanResponse {
  merchant_name: string;
  ruc: string;
  date: string;
  subtotal: number;
  itbms: number;
  total: number;
  items: Array<{ description: string; quantity?: number; unit_price?: number; total?: number }>;
  confidence: number;
}

const SYSTEM_PROMPT = `Extrae de la factura y responde SOLO con JSON válido:
{"merchant_name":"","ruc":"","date":"YYYY-MM-DD","subtotal":0,"itbms":0,"total":0,"items":[{"description":"","quantity":1,"unit_price":0,"total":0}],"confidence":0.5}
Si no hay dato: "" para strings, 0 para números. confidence: 0-1.`;

Deno.serve(async (req: Request) => {
  console.log('[scan-receipt] handler iniciado');
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    await verifyAuth(req);

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const body = (await req.json()) as ScanRequest;
    const { imageBase64, imageUrl } = body;

    let base64Data: string;
    let mediaType = 'image/jpeg';

    if (imageBase64) {
      base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      const match = imageBase64.match(/^data:(image\/\w+);base64,/);
      if (match) mediaType = match[1];
    } else if (imageUrl) {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new ValidationError('No se pudo cargar la imagen desde la URL');
      const arrayBuffer = await imgRes.arrayBuffer();
      base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const contentType = imgRes.headers.get('content-type');
      if (contentType?.startsWith('image/')) mediaType = contentType;
    } else {
      throw new ValidationError('Se requiere imageBase64 o imageUrl');
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new ValidationError('ANTHROPIC_API_KEY no configurado');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: 'Extrae los datos en JSON.',
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[ANTHROPIC_ERROR]', response.status, errText);
      throw new Error(`Error API Anthropic: ${response.status}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textContent = data.content?.find((c) => c.type === 'text')?.text ?? '';

    if (!textContent) {
      throw new Error('La API no devolvió contenido');
    }

    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : textContent;
    let parsed: ScanResponse;
    try {
      parsed = JSON.parse(jsonStr) as ScanResponse;
    } catch {
      throw new Error(`No se pudo parsear la respuesta: ${textContent.slice(0, 200)}`);
    }

    parsed.merchant_name = String(parsed.merchant_name ?? '').trim() || 'Comercio desconocido';
    parsed.ruc = String(parsed.ruc ?? '').trim();
    parsed.date = String(parsed.date ?? '').trim();
    parsed.subtotal = Number(parsed.subtotal) || 0;
    parsed.itbms = Number(parsed.itbms) || 0;
    parsed.total = Number(parsed.total) || parsed.subtotal + parsed.itbms;
    parsed.items = Array.isArray(parsed.items) ? parsed.items : [];
    parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) ?? 0.5));

    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
