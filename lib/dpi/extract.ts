import type { DpiExtractionInput, DpiExtractionResult, DpiProviderName } from './types'
import { extractWithGroq } from './providers/groq'
import { extractWithMock } from './providers/mock'

export function getDpiProviderName(): DpiProviderName {
  const configured = String(process.env.DPI_AI_PROVIDER || '').toLowerCase()
  if (configured === 'groq' || configured === 'mock') return configured
  return process.env.GROQ_API_KEY ? 'groq' : 'mock'
}

export async function extractDpi(input: DpiExtractionInput): Promise<DpiExtractionResult> {
  const provider = getDpiProviderName()
  if (provider === 'groq') return extractWithGroq(input)
  if (provider === 'mock') return extractWithMock(input)
  throw new Error(`Proveedor DPI no soportado: ${provider}`)
}

export * from './types'
