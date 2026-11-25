export type DpiProviderName = 'groq' | 'mock'

export interface DpiConfidence {
  nombres?: number
  apellidos?: number
  cui?: number
  sexo?: number
  fecha_nacimiento?: number
  nacionalidad?: number
  fecha_emision?: number
  fecha_vencimiento?: number
  direccion?: number
  lugar_nacimiento?: number
}

export interface DpiExtractedData {
  nombres: string | null
  apellidos: string | null
  cui: string | null
  sexo: 'M' | 'F' | null
  fecha_nacimiento: string | null
  nacionalidad: string | null
  fecha_emision: string | null
  fecha_vencimiento: string | null
  fecha_nacimiento_raw?: string | null
  fecha_emision_raw?: string | null
  fecha_vencimiento_raw?: string | null
  direccion: string | null
  lugar_nacimiento: string | null
  mrz?: string[] | null
  confianza?: DpiConfidence
  documento_valido?: boolean
}

export interface DpiExtractionInput {
  frontBase64: string
  backBase64: string
  frontMime: string
  backMime: string
}

export interface DpiExtractionResult {
  data: DpiExtractedData | null
  provider: DpiProviderName
  raw: unknown
  warnings: string[]
}

export interface DpiScanPayload {
  frontPath: string
  backPath: string
  provider: DpiProviderName
  scannedAt: string
  data: DpiExtractedData | null
  warnings: string[]
}
