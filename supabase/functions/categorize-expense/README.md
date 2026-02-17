# categorize-expense

Edge Function que categoriza gastos usando Claude (Anthropic API).

## Request

```json
{
  "merchant_name": "Super 99",
  "amount": 45.50,
  "description": "Compra de supermercado"
}
```

## Response

```json
{
  "category": "Alimentacion",
  "confidence": 0.95,
  "is_deductible": true,
  "reason": "Compra en supermercado"
}
```

## Configuración

Configura el secret de Anthropic antes de desplegar:

```bash
supabase secrets set ANTHROPIC_API_KEY=tu-key
```

Obtén tu API key en [console.anthropic.com](https://console.anthropic.com/).
