import type { DpiExtractedData } from './types'

const MIN_CONFIDENCE = 0.55

export function cuiDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '').slice(0, 13)
}

export function formatCui(value: unknown): string | null {
  const digits = cuiDigits(value)
  if (digits.length !== 13) return null
  return `${digits.slice(0, 4)} ${digits.slice(4, 9)} ${digits.slice(9)}`
}

export function isValidCuiFormat(value: unknown): boolean {
  const digits = cuiDigits(value)
  if (digits.length !== 13) return false
  const department = Number(digits.slice(9, 11))
  const municipality = Number(digits.slice(11, 13))
  return department >= 1 && department <= 22 && municipality >= 1
}

export function sameCui(a: unknown, b: unknown): boolean {
  const left = cuiDigits(a)
  const right = cuiDigits(b)
  return left.length === 13 && left === right
}

export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/\s+/g, ' ').trim()
  return text.length ? text : null
}

export function normalizeSex(value: unknown): 'M' | 'F' | null {
  const raw = cleanText(value)?.toUpperCase()
  if (!raw) return null
  if (['M', 'MASCULINO', 'MASCULINA', 'HOMBRE', 'MALE'].includes(raw)) return 'M'
  if (['F', 'FEMENINO', 'FEMENINA', 'MUJER', 'FEMALE'].includes(raw)) return 'F'
  return null
}

const MONTHS: Record<string, number> = {
  enero: 1,
  ene: 1,
  febrero: 2,
  feb: 2,
  marzo: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  mayo: 5,
  may: 5,
  junio: 6,
  jun: 6,
  julio: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  septiembre: 9,
  setiembre: 9,
  sept: 9,
  sep: 9,
  set: 9,
  octubre: 10,
  oct: 10,
  noviembre: 11,
  nov: 11,
  diciembre: 12,
  dic: 12,
}

function buildIsoDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const dt = new Date(Date.UTC(year, month - 1, day))
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Accepts the formats a vision model commonly returns and normalizes them to
 * an ISO date (YYYY-MM-DD). Returns null when the value is not a real date.
 */
export function normalizeDate(value: unknown): string | null {
  const raw = cleanText(value)
  if (!raw) return null

  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw)
  if (iso) return buildIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const dmy = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(raw)
  if (dmy) return buildIsoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))

  const spanish = /^(\d{1,2})\s*(?:de\s+)?([a-záéíóúñ]+)[\s/-]*(?:de\s+)?(\d{2,4})$/i.exec(raw)
  if (spanish) {
    const month = MONTHS[spanish[2].toLowerCase()]
    const rawYear = Number(spanish[3])
    const year = spanish[3].length === 2 ? 2000 + rawYear : rawYear
    if (month) return buildIsoDate(year, month, Number(spanish[1]))
  }

  return null
}

function confidenceFor(raw: Record<string, unknown>, key: string): number {
  const conf = raw?.confianza
  if (conf && typeof conf === 'object') {
    const value = Number((conf as Record<string, unknown>)[key])
    if (Number.isFinite(value)) return Math.max(0, Math.min(1, value))
  }
  return 0.8
}

function accepted(raw: Record<string, unknown>, key: string, warnings: string[]): boolean {
  const confidence = confidenceFor(raw, key)
  if (confidence < MIN_CONFIDENCE) {
    warnings.push(`El campo ${key} se leyó con baja confianza (${Math.round(confidence * 100)}%); no se autocompletó.`)
    return false
  }
  return true
}

/**
 * Converts the raw model response into a safe, typed DPI payload. Invalid or
 * low-confidence values become null instead of being written to a client.
 */
export function normalizeDpiResponse(raw: unknown): { data: DpiExtractedData | null; warnings: string[] } {
  const warnings: string[] = []
  if (!raw || typeof raw !== 'object') {
    return { data: null, warnings: ['La IA no devolvió un objeto de datos válido.'] }
  }

  const record = raw as Record<string, unknown>
  if (record.documento_valido === false) {
    return {
      data: null,
      warnings: ['Las imágenes no parecen corresponder a un DPI guatemalteco legible. Intenta con fotos más claras.'],
    }
  }

  const field = (key: string): string | null => {
    if (!accepted(record, key, warnings)) return null
    return cleanText(record[key])
  }

  const mrz = parseMrz(record.mrz)

  let nombres = field('nombres')
  let apellidos = field('apellidos')
  if (!nombres && mrz?.givenNames) nombres = mrz.givenNames
  if (!apellidos && mrz?.surnames) apellidos = mrz.surnames

  if (apellidos) {
    const hasSingleLetterToken = /(^|\s)\S(\s|$)/.test(apellidos)
    if (hasSingleLetterToken) {
      const modelLetters = lettersOnly(apellidos)
      const mrzLetters = mrz?.surnames ? lettersOnly(mrz.surnames) : ''
      if (mrzLetters && modelLetters.startsWith(mrzLetters)) {
        apellidos = joinSingleLetterTokens(apellidos)
        warnings.push('Se corrigió un espacio dentro del apellido usando la MRZ.')
      } else {
        warnings.push('Revisa los apellidos: la IA separó una letra que probablemente va unida.')
      }
    }
  }

  const rawCui = field('cui')
  const cui = rawCui && isValidCuiFormat(rawCui) ? formatCui(rawCui) : null
  if (rawCui && !cui) {
    warnings.push('El CUI leído no tiene 13 dígitos válidos; no se autocompletó.')
  }

  const modelSex = accepted(record, 'sexo', warnings) ? normalizeSex(record.sexo) : null
  const sexo = mrz?.sex ?? modelSex
  if (mrz?.sex && modelSex && mrz.sex !== modelSex) {
    warnings.push('El sexo se corrigió usando la MRZ.')
  }

  const rawBirthText = cleanText(record.fecha_nacimiento_raw)
  const rawIssueText = cleanText(record.fecha_emision_raw)
  const rawExpiryText = cleanText(record.fecha_vencimiento_raw)

  const modelBirthDate = normalizeDate(rawBirthText) ?? (accepted(record, 'fecha_nacimiento', warnings)
    ? normalizeDate(record.fecha_nacimiento)
    : null)
  const fechaNacimiento = mrz?.birth ?? modelBirthDate
  if (mrz?.birth && modelBirthDate && mrz.birth !== modelBirthDate) {
    warnings.push('La fecha de nacimiento se corrigió usando la MRZ.')
  }

  const fechaEmision = normalizeDate(rawIssueText) ?? (accepted(record, 'fecha_emision', warnings)
    ? normalizeDate(record.fecha_emision)
    : null)

  const modelExpiryDate = normalizeDate(rawExpiryText) ?? (accepted(record, 'fecha_vencimiento', warnings)
    ? normalizeDate(record.fecha_vencimiento)
    : null)
  const fechaVencimiento = mrz?.expiry ?? modelExpiryDate
  if (mrz?.expiry && modelExpiryDate && mrz.expiry !== modelExpiryDate) {
    warnings.push('La fecha de vencimiento se corrigió usando la MRZ.')
  }

  const modelNationality = field('nacionalidad')
  const nacionalidad = normalizeNationality(mrz?.nationality ?? modelNationality)

  if (record.fecha_nacimiento && !modelBirthDate && !mrz?.birth) {
    warnings.push('La fecha de nacimiento no se pudo interpretar; no se autocompletó.')
  }
  if (record.fecha_emision && !fechaEmision) {
    warnings.push('La fecha de emisión no se pudo interpretar; no se autocompletó.')
  }
  if (record.fecha_vencimiento && !modelExpiryDate && !mrz?.expiry) {
    warnings.push('La fecha de vencimiento no se pudo interpretar; no se autocompletó.')
  }

  const confianza: Record<string, number> = {}
  for (const key of [
    'nombres',
    'apellidos',
    'cui',
    'sexo',
    'fecha_nacimiento',
    'nacionalidad',
    'fecha_emision',
    'fecha_vencimiento',
    'direccion',
    'lugar_nacimiento',
  ]) {
    confianza[key] = confidenceFor(record, key)
  }

  const data: DpiExtractedData = {
    nombres,
    apellidos,
    cui,
    sexo,
    fecha_nacimiento: fechaNacimiento,
    nacionalidad,
    fecha_emision: fechaEmision,
    fecha_vencimiento: fechaVencimiento,
    fecha_nacimiento_raw: rawBirthText,
    fecha_emision_raw: rawIssueText,
    fecha_vencimiento_raw: rawExpiryText,
    direccion: field('direccion'),
    lugar_nacimiento: field('lugar_nacimiento'),
    mrz: mrz?.lines ?? null,
    confianza,
  }

  if (!data.nombres && !data.apellidos && !data.cui) {
    return {
      data: null,
      warnings: [...warnings, 'No se detectaron datos de identidad legibles en las imágenes.'],
    }
  }

  return { data, warnings }
}

export interface DpiClientFields {
  first_name?: string
  last_name?: string
  dpi?: string
  gender?: 'hombre' | 'mujer'
  address?: string
  birth_date?: string
  nationality?: string
  dpi_issue_date?: string
  dpi_expiry_date?: string
}

/**
 * Maps DPI fields to the names used by the client form. Only non-empty values
 * are returned; the form decides whether a field is empty before filling it.
 */
export function mapDpiToClientFields(data: DpiExtractedData | null): DpiClientFields {
  if (!data) return {}
  const mapped: DpiClientFields = {}
  if (data.nombres) mapped.first_name = data.nombres
  if (data.apellidos) mapped.last_name = data.apellidos
  if (data.cui) mapped.dpi = data.cui
  if (data.sexo === 'M') mapped.gender = 'hombre'
  if (data.sexo === 'F') mapped.gender = 'mujer'
  if (data.direccion) mapped.address = data.direccion
  if (data.fecha_nacimiento) mapped.birth_date = data.fecha_nacimiento
  if (data.nacionalidad) mapped.nationality = data.nacionalidad
  if (data.fecha_emision) mapped.dpi_issue_date = data.fecha_emision
  if (data.fecha_vencimiento) mapped.dpi_expiry_date = data.fecha_vencimiento
  return mapped
}

export function isDpiExpired(value: string | null | undefined): boolean {
  if (!value) return false
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())
  return value < today
}

export function normalizeNationality(value: string | null): string | null {
  if (!value) return null
  const upper = value.trim().toUpperCase()
  if (['GTM', 'GT', 'GUATEMALA', 'GUATEMALTECO', 'GUATEMALTECA'].includes(upper)) {
    return 'GUATEMALTECA'
  }
  return value.trim()
}

function joinSingleLetterTokens(value: string): string {
  const tokens = value.split(/\s+/).filter(Boolean)
  const out: string[] = []
  for (const token of tokens) {
    if (token.length === 1 && out.length > 0) {
      out[out.length - 1] += token
    } else {
      out.push(token)
    }
  }
  return out.join(' ')
}

function lettersOnly(value: string): string {
  return value.toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ]/g, '')
}

interface ParsedMrz {
  lines: string[]
  birth: string | null
  sex: 'M' | 'F' | null
  expiry: string | null
  nationality: string | null
  surnames: string | null
  givenNames: string | null
}

function mrzDate(value: string, kind: 'birth' | 'expiry'): string | null {
  if (!/^\d{6}$/.test(value)) return null
  const yy = Number(value.slice(0, 2))
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  let year = 2000 + yy
  const currentYear = new Date().getUTCFullYear()
  if (kind === 'birth' && year > currentYear) year = 1900 + yy
  if (kind === 'expiry' && year < currentYear - 20) year = 2000 + yy
  return buildIsoDate(year, month, day)
}

/**
 * Parses the three TD1 MRZ lines on the reverse of a Guatemalan DPI. The MRZ
 * is far more reliable than OCR for dates, sex and the first surname, so it is
 * used to validate/correct the vision model output.
 */
export function parseMrz(value: unknown): ParsedMrz | null {
  const lines = (Array.isArray(value) ? value : String(value ?? '').split(/\r?\n/))
    .map((line) => String(line ?? '').toUpperCase().replace(/\s+/g, ''))
    .filter(Boolean)

  if (lines.length < 3) return null

  const line2 = lines.find((line) => /^\d{6}\d?[MF<]\d{6}/.test(line)) || lines[1]
  const line3 = lines.find((line) => /^[A-Z<]{2,}<<[A-Z<]+/.test(line)) || lines[2]
  if (!line2 || !line3) return null

  const birth = mrzDate(line2.slice(0, 6), 'birth')
  const sexChar = line2.charAt(7)
  const sex = sexChar === 'M' ? 'M' : sexChar === 'F' ? 'F' : null
  const expiry = mrzDate(line2.slice(8, 14), 'expiry')
  const nationality = line2.slice(15, 18) || null

  const nameParts = line3.replace(/0/g, 'O').split('<<')
  const surnames = nameParts[0]?.replace(/</g, ' ').replace(/\s+/g, ' ').trim() || null
  const givenNames = nameParts.slice(1).join(' ').replace(/</g, ' ').replace(/\s+/g, ' ').trim() || null

  if (!birth && !expiry && !surnames && !givenNames) return null

  return {
    lines,
    birth,
    sex,
    expiry,
    nationality,
    surnames,
    givenNames,
  }
}
