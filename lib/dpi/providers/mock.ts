import type { DpiExtractionInput, DpiExtractionResult } from '../types'

const SAMPLE: DpiExtractionResult['data'] = {
  nombres: 'JUAN CARLOS',
  apellidos: 'PEREZ LOPEZ',
  cui: '1234 56789 0101',
  sexo: 'M',
  fecha_nacimiento: '1990-05-14',
  nacionalidad: 'GUATEMALTECA',
  fecha_emision: '2020-01-10',
  fecha_vencimiento: '2030-01-10',
  direccion: '5A AVENIDA 10-20, ZONA 1, GUATEMALA, GUATEMALA',
  lugar_nacimiento: 'GUATEMALA',
  confianza: {
    nombres: 1,
    apellidos: 1,
    cui: 1,
    sexo: 1,
    fecha_nacimiento: 1,
    nacionalidad: 1,
    fecha_emision: 1,
    fecha_vencimiento: 1,
    direccion: 1,
    lugar_nacimiento: 1,
  },
  documento_valido: true,
}

export async function extractWithMock(_input: DpiExtractionInput): Promise<DpiExtractionResult> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('No hay proveedor de extracción DPI configurado. Agrega GROQ_API_KEY en Vercel.')
  }

  return {
    data: SAMPLE,
    provider: 'mock',
    raw: { mock: true },
    warnings: ['Datos de ejemplo (proveedor mock). Configura GROQ_API_KEY para usar la IA real.'],
  }
}
