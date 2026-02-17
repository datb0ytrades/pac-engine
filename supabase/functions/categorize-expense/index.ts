// ============================================================================
// Edge Function: categorize-expense
// POST / { merchant_name, amount, description }
// Categoriza un gasto usando Claude (Anthropic API)
// ============================================================================

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { errorResponse, ValidationError } from '../_shared/errors.ts';

const CATEGORIES = [
  'Alimentacion',
  'Salud',
  'Transporte',
  'Vivienda',
  'Educacion',
  'Seguros',
  'Entretenimiento',
  'Servicios Profesionales',
  'Otros',
];

interface CategorizeRequest {
  merchant_name: string;
  amount: number;
  description: string;
}

interface CategorizeResponse {
  category: string;
  confidence: number;
  is_deductible: boolean;
  reason: string;
}

serve(async (req: Request) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED' }),
        { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } },
      );
    }

    const body = (await req.json()) as CategorizeRequest;
    const { merchant_name, amount, description } = body;

    if (!merchant_name || typeof merchant_name !== 'string') {
      throw new ValidationError('Se requiere merchant_name');
    }
    if (typeof amount !== 'number' || amount < 0) {
      throw new ValidationError('amount debe ser un número positivo');
    }
    if (!description || typeof description !== 'string') {
      throw new ValidationError('Se requiere description');
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new ValidationError('ANTHROPIC_API_KEY no configurado. Ejecute: supabase secrets set ANTHROPIC_API_KEY=tu-key');
    }

    const prompt = `Categoriza este gasto en Panamá según las categorías permitidas.

Gasto:
- Comercio/comerciante: ${merchant_name}
- Monto: ${amount}
- Descripción: ${description}

Categorías posibles (debes elegir UNA): ${CATEGORIES.join(', ')}

Responde ÚNICAMENTE con un JSON válido, sin markdown ni texto adicional, con esta estructura exacta:
{
  "category": "NombreDeLaCategoria",
  "confidence": 0.95,
  "is_deductible": true,
  "reason": "Breve explicación en una frase"
}

- category: una de las categorías listadas.
- confidence: número entre 0 y 1 (tu nivel de confianza).
- is_deductible: true si el gasto podría ser deducible de impuestos en Panamá según normativa fiscal, false si no.
- reason: explicación breve en una frase.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('[ANTHROPIC_ERROR]', response.status, errText);
      throw new Error(`Error API Anthropic: ${response.status} - ${errText}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const textContent = data.content?.find((c) => c.type === 'text')?.text ?? '';

    if (!textContent) {
      throw new Error('La API no devolvió contenido de texto');
    }

    // Extraer JSON del texto (por si Claude añadió markdown)
    let parsed: CategorizeResponse;
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : textContent;
    try {
      parsed = JSON.parse(jsonStr) as CategorizeResponse;
    } catch {
      throw new Error(`No se pudo parsear la respuesta: ${textContent}`);
    }

    if (!CATEGORIES.includes(parsed.category)) {
      parsed.category = 'Otros';
    }
    parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
    parsed.is_deductible = Boolean(parsed.is_deductible);

    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (err) {
    return errorResponse(err, corsHeaders);
  }
});
