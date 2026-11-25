import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { extractDpi, getDpiProviderName } from '@/lib/dpi/extract'
import { cuiDigits } from '@/lib/dpi/normalize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'dpi-images'
const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_AI_BYTES = 2.8 * 1024 * 1024
const COOLDOWN_SECONDS = 60
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

function extensionFor(type: string): string {
  if (type === 'image/png') return 'png'
  if (type === 'image/webp') return 'webp'
  return 'jpg'
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'arrayBuffer' in value &&
      'type' in value &&
      'size' in value,
  )
}

async function ensureBucket(admin: ReturnType<typeof createAdminClient>) {
  const { data: bucket } = await admin.storage.getBucket(BUCKET)
  if (bucket) return

  const { error } = await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_FILE_BYTES,
    allowedMimeTypes: ALLOWED_TYPES,
  })

  if (error && !/already exists/i.test(error.message)) {
    throw new Error(
      `No se pudo crear el bucket privado ${BUCKET}: ${error.message}. Aplica la migración 20261120090000_add_dpi_documents_to_clients.sql.`,
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: me, error: meError } = await admin
      .from('users')
      .select('id, role')
      .eq('auth_id', user.id)
      .maybeSingle()

    if (meError || !me || !['admin', 'asesor'].includes(me.role)) {
      return NextResponse.json({ error: 'No autorizado para escanear DPI' }, { status: 403 })
    }

    const form = await request.formData()
    const front = form.get('front')
    const back = form.get('back')
    const rawClientId = String(form.get('clientId') || '').trim()
    const clientId = rawClientId && rawClientId !== 'undefined' && rawClientId !== 'null' ? rawClientId : null

    if (!isUploadedFile(front) || !isUploadedFile(back)) {
      return NextResponse.json({ error: 'Debes enviar la foto del frente y la del reverso' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(front.type) || !ALLOWED_TYPES.includes(back.type)) {
      return NextResponse.json({ error: 'Formato no permitido. Usa JPG, PNG o WEBP.' }, { status: 400 })
    }

    if (front.size > MAX_FILE_BYTES || back.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Cada imagen debe pesar menos de 10 MB' }, { status: 413 })
    }

    if (clientId) {
      const { data: client, error: clientError } = await admin
        .from('clients')
        .select('id, advisor_id')
        .eq('id', clientId)
        .maybeSingle()

      if (clientError || !client) {
        return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
      }
      if (me.role === 'asesor' && client.advisor_id !== me.id) {
        return NextResponse.json({ error: 'No autorizado para este cliente' }, { status: 403 })
      }
    }

    await ensureBucket(admin)

    const [frontBuffer, backBuffer] = await Promise.all([
      front.arrayBuffer().then((value) => Buffer.from(value)),
      back.arrayBuffer().then((value) => Buffer.from(value)),
    ])

    const now = Date.now()
    const folder = clientId ? `clients/${clientId}` : `temp/${me.id}/${crypto.randomUUID()}`
    const frontPath = `${folder}/front-${now}.${extensionFor(front.type)}`
    const backPath = `${folder}/back-${now}.${extensionFor(back.type)}`

    const [frontUpload, backUpload] = await Promise.all([
      admin.storage.from(BUCKET).upload(frontPath, frontBuffer, {
        contentType: front.type,
        upsert: false,
        cacheControl: '3600',
      }),
      admin.storage.from(BUCKET).upload(backPath, backBuffer, {
        contentType: back.type,
        upsert: false,
        cacheControl: '3600',
      }),
    ])

    if (frontUpload.error || backUpload.error) {
      const message = frontUpload.error?.message || backUpload.error?.message || 'Error desconocido'
      console.error('[dpi-scan] Error uploading images:', message)
      return NextResponse.json(
        { error: `No se pudieron guardar las imágenes: ${message}` },
        { status: 500 },
      )
    }

    const scannedAt = new Date().toISOString()
    const provider = getDpiProviderName()

    const { data: slot, error: slotError } = await admin.rpc('claim_dpi_scan_slot', {
      p_cooldown_seconds: COOLDOWN_SECONDS,
    })

    if (slotError) {
      const missingFunction =
        slotError.code === 'PGRST202' ||
        /Could not find the function|claim_dpi_scan_slot/i.test(slotError.message || '')

      if (missingFunction) {
        const message =
          'Falta aplicar la migración 20261120120000_add_dpi_scan_cooldown.sql para activar el límite de un DPI por minuto. Las fotos sí se guardaron; puedes escribir los datos a mano.'
        return NextResponse.json(
          {
            ok: false,
            code: 'DPI_COOLDOWN_NOT_CONFIGURED',
            error: message,
            frontPath,
            backPath,
            provider,
            scannedAt,
            data: null,
            warnings: [message],
            extractionOk: false,
          },
          { status: 503 },
        )
      }

      console.error('[dpi-scan] Cooldown error:', slotError)
      return NextResponse.json(
        { error: 'No se pudo verificar el límite de escaneo. Intenta nuevamente.' },
        { status: 500 },
      )
    }

    const retryAfter = Number((slot as { retryAfter?: number } | null)?.retryAfter || 0)
    if (slot && (slot as { allowed?: boolean }).allowed === false) {
      const seconds = Math.max(1, retryAfter)
      const message = `El sistema puede leer un DPI por minuto. Las fotos se guardaron. Podrá escanear otro DPI en ${seconds} segundos. Mientras tanto, puede escribir los datos a mano.`
      return NextResponse.json(
        {
          ok: false,
          code: 'DPI_COOLDOWN',
          error: message,
          retryAfter: seconds,
          frontPath,
          backPath,
          provider,
          scannedAt,
          data: null,
          warnings: [message],
          extractionOk: false,
        },
        { status: 429, headers: { 'Retry-After': String(seconds) } },
      )
    }

    const warnings: string[] = []
    let data = null as Awaited<ReturnType<typeof extractDpi>>['data']
    let raw: unknown = null
    let extractionOk = false

    const totalBytes = frontBuffer.length + backBuffer.length
    if (totalBytes > MAX_AI_BYTES) {
      warnings.push(
        'Las imágenes son muy grandes para el análisis automático. Se guardaron correctamente; llena los datos manualmente o vuelve a tomarlas con menos resolución.',
      )
    } else {
      try {
        const result = await extractDpi({
          frontBase64: frontBuffer.toString('base64'),
          backBase64: backBuffer.toString('base64'),
          frontMime: front.type,
          backMime: back.type,
        })
        data = result.data
        raw = result.raw
        warnings.push(...result.warnings)
        extractionOk = Boolean(result.data)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido'
        console.error('[dpi-scan] Extraction error:', message)
        warnings.push(
          `No se pudieron extraer los datos automáticamente: ${message}. Las fotos sí quedaron guardadas; puedes llenar el formulario manualmente.`,
        )
      }
    }

    const dpiDigits = data?.cui ? cuiDigits(data.cui) : ''
    try {
      await admin.from('logs').insert({
        actor_user_id: me.id,
        action_type: 'CREATE',
        entity_name: 'clients_dpi',
        entity_id: clientId,
        action_at: scannedAt,
        details: {
          message: clientId
            ? `Escaneó el DPI del cliente ${clientId}`
            : 'Escaneó un DPI para un cliente nuevo',
          provider,
          extraction_ok: extractionOk,
          fields: data
            ? Object.entries(data)
                .filter(([key, value]) => key !== 'confianza' && key !== 'documento_valido' && value)
                .map(([key]) => key)
            : [],
          cui_last4: dpiDigits.length === 13 ? dpiDigits.slice(-4) : null,
          warnings,
        },
      })
    } catch (logError) {
      console.error('[dpi-scan] Error writing audit log:', logError)
    }

    return NextResponse.json({
      ok: true,
      frontPath,
      backPath,
      provider,
      scannedAt,
      data,
      warnings,
      extractionOk,
      retryAfter: COOLDOWN_SECONDS,
      raw: process.env.NODE_ENV === 'development' ? raw : undefined,
    })
  } catch (error) {
    console.error('[dpi-scan] Unexpected error:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Error interno al escanear el DPI. Intenta nuevamente.',
      },
      { status: 500 },
    )
  }
}
