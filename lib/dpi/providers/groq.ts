import type { DpiExtractionInput, DpiExtractionResult } from '../types'
import { normalizeDpiResponse } from '../normalize'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'qwen/qwen3.8-27b'

const PROMPT = `Eres un extractor experto de datos de Documentos Personales de Identificación (DPI) de Guatemala, emitidos por RENAP. Recibirás dos imágenes: la primera es el FRENTE del DPI y la segunda es el REVERSO. Pueden ser de las series 2009, 2014 o 2025, y el reverso puede variar de diseño.

Devuelve SOLO un objeto JSON válido, sin markdown ni texto adicional, con exactamente esta forma:
{
  "documento_valido": true,
  "nombres": "NOMBRES DE PILA" | null,
  "apellidos": "APELLIDOS" | null,
  "cui": "13 dígitos sin espacios" | null,
  "sexo": "M" | "F" | null,
  "fecha_nacimiento": "YYYY-MM-DD" | null,
  "fecha_nacimiento_raw": "fecha tal como está impresa" | null,
  "nacionalidad": "NACIONALIDAD" | null,
  "fecha_emision": "YYYY-MM-DD" | null,
  "fecha_emision_raw": "fecha tal como está impresa" | null,
  "fecha_vencimiento": "YYYY-MM-DD" | null,
  "fecha_vencimiento_raw": "fecha tal como está impresa" | null,
  "direccion": "dirección completa" | null,
  "lugar_nacimiento": "lugar de nacimiento" | null,
  "mrz": ["línea 1 de la MRZ", "línea 2 de la MRZ", "línea 3 de la MRZ"] | null,
  "confianza": {
    "nombres": 0.0,
    "apellidos": 0.0,
    "cui": 0.0,
    "sexo": 0.0,
    "fecha_nacimiento": 0.0,
    "nacionalidad": 0.0,
    "fecha_emision": 0.0,
    "fecha_vencimiento": 0.0,
    "direccion": 0.0,
    "lugar_nacimiento": 0.0
  }
}

Reglas:
1. No inventes datos. Si un campo no se ve con claridad, usa null.
2. El CUI tiene exactamente 13 dígitos y suele imprimirse en grupos 4-5-4. No lo confundas con el número de serie, libro, folio o partida.
3. "nombres" son los nombres de pila; "apellidos" son los apellidos. No los intercambies. Aunque el frente diga "NOMBRE" o "APELLIDO" en singular, devuelve todos los nombres y apellidos completos.
4. El sexo impreso como M o MASCULINO es "M"; F o FEMENINO es "F".
5. Las fechas numéricas del DPI están en formato DD/MM/YYYY (día primero, mes después). No las interpretes como MM/DD/YYYY. Normaliza todas las fechas a YYYY-MM-DD. Además, transcribe la fecha tal como está impresa en "fecha_nacimiento_raw", "fecha_emision_raw" y "fecha_vencimiento_raw"; no interpretes esos campos _raw.
6. En el reverso, "direccion" debe ser la VECINDAD (departamento y municipio). No uses el LUGAR DE NACIMIENTO como dirección.
7. Si el reverso tiene una zona MRZ (las tres líneas con muchos signos <), transcríbela completa en "mrz" y úsala para verificar fechas, sexo, nacionalidad y apellidos. En la MRZ el apellido está antes de << y los nombres después.
8. No separes letras que pertenecen a una misma palabra. Por ejemplo, "BOTEO" es una sola palabra; no devuelvas "BOTE O". Usa la MRZ para confirmar el apellido.
9. Si NACIONALIDAD o PAIS DE NAC. dice GTM, GT o GUATEMALA, devuelve "GUATEMALTECA".
10. "documento_valido" debe ser false si las imágenes no son un DPI guatemalteco o no son legibles.
11. La confianza debe ser un número entre 0 y 1 por campo, según qué tan claro se vea.
12. Devuelve el JSON completo, incluso si todos los campos son null.`

function extractJsonObject(content: string): unknown {
  const trimmed = content.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    throw new Error('La IA no devolvió un JSON válido')
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

async function callGroq(payload: Record<string, unknown>, apiKey: string, timeoutMs: number): Promise<Response> {
  return fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Math.max(2_000, timeoutMs)),
  })
}

export async function extractWithGroq(input: DpiExtractionInput): Promise<DpiExtractionResult> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    throw new Error('GROQ_API_KEY no está configurada')
  }

  const model = process.env.DPI_AI_MODEL || DEFAULT_MODEL
  const payload: Record<string, unknown> = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: `data:${input.frontMime};base64,${input.frontBase64}` } },
          { type: 'image_url', image_url: { url: `data:${input.backMime};base64,${input.backBase64}` } },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
    max_completion_tokens: 900,
  }

  const deadline = Date.now() + 45_000
  let response = await callGroq(payload, apiKey, deadline - Date.now())

  // Some model versions reject response_format; retry once without it.
  if (response.status === 400) {
    const errorText = await response.text()
    if (errorText.toLowerCase().includes('response_format') && deadline - Date.now() > 5_000) {
      delete payload.response_format
      response = await callGroq(payload, apiKey, deadline - Date.now())
    } else {
      throw new Error(`Groq rechazó la solicitud: ${errorText.slice(0, 400)}`)
    }
  }

  for (let attempt = 0; attempt < 2 && isRetryableStatus(response.status); attempt++) {
    const remaining = deadline - Date.now()
    if (remaining <= 8_000) break
    const retryAfter = Number(response.headers.get('retry-after') || 0)
    const requestedWait = Math.max(retryAfter * 1000, 3_500 * (attempt + 1))
    const waitMs = Math.min(requestedWait, Math.max(0, remaining - 6_000))
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    response = await callGroq(payload, apiKey, deadline - Date.now())
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Groq respondió ${response.status}: ${errorText.slice(0, 400)}`)
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('Groq no devolvió contenido')
  }

  const raw = extractJsonObject(content)
  const normalized = normalizeDpiResponse(raw)
  return {
    data: normalized.data,
    provider: 'groq',
    raw,
    warnings: normalized.warnings,
  }
}
