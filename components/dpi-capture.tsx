'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { useGSAP } from '@gsap/react'
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  IdCard,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  ScanLine,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { DpiExtractedData } from '@/lib/dpi/types'
import { cn, formatYMDGT } from '@/lib/utils'

export interface DpiCaptureResult {
  data: DpiExtractedData | null
  frontPath: string
  backPath: string
  provider: string
  warnings: string[]
  scannedAt: string
}

interface DpiCaptureProps {
  clientId?: string
  existingFrontUrl?: string | null
  existingBackUrl?: string | null
  required?: boolean
  disabled?: boolean
  onExtracted: (result: DpiCaptureResult) => void
  /** Called when a previously scanned photo is replaced/removed, so the parent
   *  can invalidate the saved paths until the new pair is scanned again. */
  onClearScan?: () => void
  /** True while new photos are selected but not yet uploaded/scanned. */
  onPendingChange?: (pending: boolean) => void
}

type Side = 'front' | 'back'
type ScanStatus = 'idle' | 'scanning' | 'done' | 'partial' | 'error'

const MAX_DIMENSION = 1800
const MAX_AI_FILE_BYTES = 1.2 * 1024 * 1024
const COOLDOWN_SECONDS = 60
const COOLDOWN_STORAGE_KEY = 'dpi:cooldownUntil'

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('El archivo debe ser una imagen')
  }

  // Animated GIFs are returned as-is so the browser does not silently produce
  // a blank canvas. HEIC/HEIF is attempted because Safari can decode it; other
  // browsers fall through and the caller asks for a JPG/PNG instead.
  if (file.type === 'image/gif') {
    return file
  }

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    if (scale === 1 && file.size <= MAX_AI_FILE_BYTES) {
      bitmap.close()
      return file
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return file
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    let bestBlob: Blob | null = null
    for (const quality of [0.85, 0.7, 0.6]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (!blob) continue
      if (!bestBlob || blob.size < bestBlob.size) bestBlob = blob
      if (blob.size <= MAX_AI_FILE_BYTES) break
    }
    if (!bestBlob) return file
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'dpi'
    return new File([bestBlob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  return `${minutes}:${String(safe % 60).padStart(2, '0')}`
}

function DpiSlot({
  label,
  preview,
  existingUrl,
  disabled,
  scanning,
  success,
  partial,
  error,
  onTake,
  onUpload,
  onClear,
}: {
  label: string
  preview: string | null
  existingUrl: string | null
  disabled?: boolean
  scanning?: boolean
  success?: boolean
  partial?: boolean
  error?: boolean
  onTake: () => void
  onUpload: () => void
  onClear: () => void
}) {
  const image = preview || existingUrl
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {existingUrl && !preview ? (
          <Badge variant="secondary" className="text-[10px]">Guardada</Badge>
        ) : null}
      </div>
      <div
        className={cn(
          'relative aspect-[1.586/1] overflow-hidden rounded-lg border bg-muted/30 transition-colors',
          !success && !partial && !error && 'border-border/60',
          success && 'border-emerald-500/60 ring-2 ring-emerald-500/25',
          partial && 'border-amber-500/60 ring-2 ring-amber-500/20',
          error && 'border-rose-500/60 ring-2 ring-rose-500/20',
        )}
      >
        {image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={label} className="h-full w-full object-contain" />
            {preview ? (
              <button
                type="button"
                onClick={onClear}
                disabled={disabled}
                className="absolute right-1.5 top-1.5 z-20 rounded-full bg-background/90 p-1 text-muted-foreground shadow hover:text-foreground disabled:opacity-50"
                aria-label={`Quitar ${label}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-muted-foreground">
            <ImageIcon className="h-7 w-7 opacity-40" />
            <span className="text-xs">Sin foto</span>
          </div>
        )}

        {scanning ? (
          <div className="absolute inset-0 z-10 bg-slate-950/35">
            <div className="dpi-scan-corners pointer-events-none absolute inset-2 opacity-80">
              <span className="absolute left-0 top-0 h-4 w-4 border-l-2 border-t-2 border-emerald-300" />
              <span className="absolute right-0 top-0 h-4 w-4 border-r-2 border-t-2 border-emerald-300" />
              <span className="absolute bottom-0 left-0 h-4 w-4 border-b-2 border-l-2 border-emerald-300" />
              <span className="absolute bottom-0 right-0 h-4 w-4 border-b-2 border-r-2 border-emerald-300" />
            </div>
            <div className="dpi-scan-beam pointer-events-none absolute left-0 right-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_18px_4px_rgba(16,185,129,0.55)]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-white/90" />
            </div>
          </div>
        ) : null}

        {success ? (
          <div className="dpi-status-icon absolute right-2 top-2 z-20 rounded-full bg-emerald-600 p-1 text-white shadow">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        ) : null}
        {partial ? (
          <div className="dpi-status-icon absolute right-2 top-2 z-20 rounded-full bg-amber-500 p-1 text-white shadow">
            <AlertTriangle className="h-4 w-4" />
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onTake} disabled={disabled} className="gap-1.5">
          <Camera className="h-3.5 w-3.5" />
          Tomar foto
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onUpload} disabled={disabled} className="gap-1.5">
          <Upload className="h-3.5 w-3.5" />
          Subir
        </Button>
      </div>
    </div>
  )
}

export function DpiCapture({
  clientId,
  existingFrontUrl,
  existingBackUrl,
  required = false,
  disabled = false,
  onExtracted,
  onClearScan,
  onPendingChange,
}: DpiCaptureProps) {
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [backFile, setBackFile] = useState<File | null>(null)
  const [frontPreview, setFrontPreview] = useState<string | null>(null)
  const [backPreview, setBackPreview] = useState<string | null>(null)
  const [existingFront, setExistingFront] = useState<string | null>(existingFrontUrl || null)
  const [existingBack, setExistingBack] = useState<string | null>(existingBackUrl || null)
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [status, setStatus] = useState<ScanStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [detected, setDetected] = useState<DpiExtractedData | null>(null)
  const [cameraFor, setCameraFor] = useState<Side | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [cooldownRemaining, setCooldownRemaining] = useState(0)

  const frontCaptureRef = useRef<HTMLInputElement>(null)
  const backCaptureRef = useRef<HTMLInputElement>(null)
  const frontUploadRef = useRef<HTMLInputElement>(null)
  const backUploadRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const scopeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (existingFrontUrl || existingBackUrl || !clientId) return
    let cancelled = false
    setLoadingExisting(true)
    fetch(`/api/clients/${clientId}/dpi`, { credentials: 'include' })
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (cancelled || !res.ok || !data) return
        setExistingFront(data.frontUrl || null)
        setExistingBack(data.backUrl || null)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingExisting(false)
      })
    return () => {
      cancelled = true
    }
  }, [clientId, existingFrontUrl, existingBackUrl])

  useEffect(() => {
    return () => {
      if (frontPreview) URL.revokeObjectURL(frontPreview)
    }
  }, [frontPreview])

  useEffect(() => {
    return () => {
      if (backPreview) URL.revokeObjectURL(backPreview)
    }
  }, [backPreview])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(COOLDOWN_STORAGE_KEY)
      const until = Number(raw || 0)
      if (until > Date.now()) {
        setCooldownUntil(until)
        setCooldownRemaining(Math.ceil((until - Date.now()) / 1000))
      } else if (raw) {
        localStorage.removeItem(COOLDOWN_STORAGE_KEY)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (!cooldownUntil) return
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000))
      setCooldownRemaining(remaining)
      if (remaining <= 0) {
        setCooldownUntil(null)
        try {
          localStorage.removeItem(COOLDOWN_STORAGE_KEY)
        } catch {}
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [cooldownUntil])

  useEffect(() => {
    if (!cameraFor) return
    const videoElement = videoRef.current
    let stream: MediaStream | null = null
    let cancelled = false

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((nextStream) => {
        if (cancelled) {
          nextStream.getTracks().forEach((track) => track.stop())
          return
        }
        stream = nextStream
        if (videoElement) {
          videoElement.srcObject = nextStream
          videoElement.play().catch(() => {})
        }
      })
      .catch((err) => {
        setCameraError(err instanceof Error ? err.message : 'No se pudo abrir la cámara')
      })

    return () => {
      cancelled = true
      stream?.getTracks().forEach((track) => track.stop())
      if (videoElement) videoElement.srcObject = null
    }
  }, [cameraFor])

  useGSAP(
    () => {
      const mm = gsap.matchMedia()

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        if (status === 'scanning') {
          gsap.utils.toArray<HTMLElement>('.dpi-scan-beam').forEach((beam, index) => {
            gsap.fromTo(
              beam,
              { top: '0%', opacity: 0.3 },
              {
                top: '100%',
                opacity: 1,
                duration: 2.2,
                repeat: -1,
                ease: 'none',
                delay: index * 0.18,
              },
            )
          })
          gsap.to('.dpi-scan-corners', {
            opacity: 0.45,
            repeat: -1,
            yoyo: true,
            duration: 0.9,
            ease: 'sine.inOut',
          })
          gsap.to('.dpi-scan-dot', {
            opacity: 0.2,
            repeat: -1,
            yoyo: true,
            stagger: 0.12,
            duration: 0.5,
          })
        }

        if (status === 'done' || status === 'partial') {
          if (detected) {
            gsap.from('.dpi-field-chip', {
              opacity: 0,
              y: 10,
              duration: 0.32,
              stagger: 0.06,
              ease: 'power2.out',
            })
          }
          gsap.from('.dpi-status-icon', {
            scale: 0.5,
            opacity: 0,
            duration: 0.4,
            ease: 'back.out(2)',
          })
        }

        if (status === 'error') {
          gsap.fromTo(
            '.dpi-card-shell',
            { x: -3 },
            { x: 3, duration: 0.08, repeat: 3, yoyo: true, clearProps: 'x' },
          )
        }
      })

      return () => mm.revert()
    },
    { scope: scopeRef, dependencies: [status, detected] },
  )

  const startCooldown = useCallback((seconds: number) => {
    const safeSeconds = Math.max(
      1,
      Math.min(300, Math.round(Number.isFinite(seconds) ? seconds : COOLDOWN_SECONDS)),
    )
    const until = Date.now() + safeSeconds * 1000
    setCooldownUntil(until)
    setCooldownRemaining(safeSeconds)
    try {
      localStorage.setItem(COOLDOWN_STORAGE_KEY, String(until))
    } catch {}
  }, [])

  const resetScanState = useCallback(() => {
    setStatus('idle')
    setError(null)
    setWarnings([])
    setDetected(null)
  }, [])

  const handleFile = useCallback(
    async (side: Side, file: File | undefined) => {
      if (!file) return
      if (disabled) return
      try {
        const compressed = await compressImage(file)
        if (compressed.type === 'image/heic' || compressed.type === 'image/heif') {
          toast.error('Este navegador no pudo convertir la foto HEIC. Use JPG/PNG o tome la foto con la cámara.')
          return
        }
        if (compressed.size > 10 * 1024 * 1024) {
          toast.error('La imagen es demasiado grande. Use una foto de menos de 10 MB.')
          return
        }
        const preview = URL.createObjectURL(compressed)
        if (side === 'front') {
          setFrontFile(compressed)
          setFrontPreview(preview)
        } else {
          setBackFile(compressed)
          setBackPreview(preview)
        }
        onClearScan?.()
        onPendingChange?.(true)
        resetScanState()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'No se pudo leer la imagen')
      }
    },
    [disabled, resetScanState, onClearScan, onPendingChange],
  )

  const handleTakePhoto = (side: Side) => {
    if (disabled) return
    if (isMobileDevice()) {
      const input = side === 'front' ? frontCaptureRef.current : backCaptureRef.current
      input?.click()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      const input = side === 'front' ? frontUploadRef.current : backUploadRef.current
      input?.click()
      return
    }
    setCameraError(null)
    setCameraFor(side)
  }

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video || !cameraFor) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `${cameraFor}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
        void handleFile(cameraFor, file)
        setCameraFor(null)
      },
      'image/jpeg',
      0.9,
    )
  }

  const clearSide = (side: Side) => {
    if (side === 'front') {
      setFrontFile(null)
      setFrontPreview(null)
    } else {
      setBackFile(null)
      setBackPreview(null)
    }
    onClearScan?.()
    onPendingChange?.(false)
    resetScanState()
  }

  const canScan = Boolean(frontFile && backFile) && !disabled && cooldownRemaining === 0
  const hasExisting = Boolean(existingFront || existingBack)
  const busy = status === 'scanning'

  const handleScan = async () => {
    if (!frontFile || !backFile) {
      toast.error('Seleccione o tome la foto del frente y del reverso')
      return
    }
    if (cooldownRemaining > 0) {
      toast.info(`Podrá escanear otro DPI en ${formatCountdown(cooldownRemaining)}.`)
      return
    }

    setStatus('scanning')
    setError(null)
    setWarnings([])
    setDetected(null)

    try {
      const formData = new FormData()
      formData.append('front', frontFile)
      formData.append('back', backFile)
      if (clientId) formData.append('clientId', clientId)

      const response = await fetch('/api/clients/dpi/scan', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      const payload = await response.json().catch(() => null)
      const retryAfter = Number(payload?.retryAfter || COOLDOWN_SECONDS)

      if (!response.ok && payload?.frontPath && payload?.backPath) {
        if (response.status === 429) startCooldown(retryAfter)
        const nextWarnings = Array.isArray(payload.warnings) && payload.warnings.length
          ? payload.warnings
          : [friendlyMessage(payload?.error)]
        setStatus('partial')
        setError(null)
        setWarnings(nextWarnings)
        onPendingChange?.(false)
        onExtracted({
          data: null,
          frontPath: payload.frontPath,
          backPath: payload.backPath,
          provider: payload.provider || 'groq',
          warnings: nextWarnings,
          scannedAt: payload.scannedAt || new Date().toISOString(),
        })
        toast.warning(
          response.status === 429
            ? 'Las fotos se guardaron. Podrá analizarlas cuando pase el minuto.'
            : 'Las fotos se guardaron. Puede escribir los datos a mano.',
        )
        return
      }

      if (response.status === 429) {
        startCooldown(retryAfter)
        setStatus('error')
        setError(friendlyMessage(payload?.error))
        toast.error(friendlyMessage(payload?.error))
        return
      }

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `Error ${response.status} al escanear el DPI`)
      }

      if (payload.retryAfter) startCooldown(Number(payload.retryAfter) || COOLDOWN_SECONDS)
      else startCooldown(COOLDOWN_SECONDS)

      setDetected(payload.data || null)
      setWarnings(Array.isArray(payload.warnings) ? payload.warnings : [])
      setStatus(payload.data ? 'done' : 'partial')
      onPendingChange?.(false)

      onExtracted({
        data: payload.data || null,
        frontPath: payload.frontPath,
        backPath: payload.backPath,
        provider: payload.provider || 'groq',
        warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
        scannedAt: payload.scannedAt || new Date().toISOString(),
      })

      if (payload.data) {
        toast.success('DPI escaneado. Se autocompletaron únicamente los campos vacíos.')
      } else {
        toast.warning('Las fotos se guardaron, pero no se pudieron extraer datos. Llena el formulario manualmente.')
      }
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Error al escanear el DPI')
      toast.error(err instanceof Error ? err.message : 'Error al escanear el DPI')
    }
  }

  const detectedFields = [
    { key: 'nombres', label: 'Nombres', value: detected?.nombres ?? null },
    { key: 'apellidos', label: 'Apellidos', value: detected?.apellidos ?? null },
    { key: 'cui', label: 'CUI', value: detected?.cui ?? null },
    {
      key: 'sexo',
      label: 'Sexo',
      value: detected?.sexo === 'M' ? 'Masculino' : detected?.sexo === 'F' ? 'Femenino' : null,
    },
    {
      key: 'fecha_nacimiento',
      label: 'Nacimiento',
      value: detected?.fecha_nacimiento ? formatYMDGT(detected.fecha_nacimiento) : null,
    },
    { key: 'nacionalidad', label: 'Nacionalidad', value: detected?.nacionalidad ?? null },
    {
      key: 'fecha_emision',
      label: 'Emisión',
      value: detected?.fecha_emision ? formatYMDGT(detected.fecha_emision) : null,
    },
    {
      key: 'fecha_vencimiento',
      label: 'Vencimiento',
      value: detected?.fecha_vencimiento ? formatYMDGT(detected.fecha_vencimiento) : null,
    },
    { key: 'direccion', label: 'Vecindad', value: detected?.direccion ?? null },
    { key: 'mrz', label: 'MRZ', value: detected?.mrz?.length ? 'Leída' : null },
  ]
  const foundCount = detectedFields.filter((field) => field.value).length

  const cooldownAnnouncement =
    cooldownRemaining === 0
      ? 'Ya puede escanear otro DPI.'
      : cooldownRemaining === COOLDOWN_SECONDS
        ? `El sistema podrá escanear otro DPI en ${formatCountdown(cooldownRemaining)}.`
        : cooldownRemaining === 30 || cooldownRemaining === 10
          ? `Faltan ${cooldownRemaining} segundos para escanear otro DPI.`
          : ''

  function friendlyMessage(message?: string | null) {
    return message || 'El sistema podrá escanear otro DPI cuando pase el minuto. Mientras tanto, puede escribir los datos a mano.'
  }

  return (
    <div ref={scopeRef}>
      <Card className="dpi-card-shell border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <IdCard className="h-5 w-5" />
              DPI (frente y reverso)
              {required ? <Badge variant="destructive" className="text-[10px]">Obligatorio</Badge> : null}
            </CardTitle>
            {status === 'scanning' ? (
              <Badge variant="secondary" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Analizando
              </Badge>
            ) : null}
            {status === 'done' ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Escaneado
              </Badge>
            ) : null}
            {status === 'partial' ? (
              <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3" />
                Fotos guardadas
              </Badge>
            ) : null}
          </div>
          <CardDescription>
            Suba o tome las dos fotos del DPI. El sistema intentará leer los datos y solo llenará los campos que estén vacíos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
              <Clock className="h-4 w-4 shrink-0" />
              Un DPI por minuto
            </div>
            <p className="mt-1 text-xs leading-5 text-amber-900/80 dark:text-amber-100/80">
              El sistema puede leer un DPI por minuto. Si intenta escanear otro antes de que pase un minuto, no se leerá.
              No es un error: es el límite del servicio gratuito. Si tiene prisa, puede escribir los datos a mano; las fotos se guardan igual.
            </p>
            {cooldownRemaining > 0 ? (
              <div className="mt-2">
                <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                  Podrá escanear el siguiente DPI en {formatCountdown(cooldownRemaining)}.
                </p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-amber-500/20">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-[width] duration-1000"
                    style={{ width: `${Math.min(100, (cooldownRemaining / COOLDOWN_SECONDS) * 100)}%` }}
                  />
                </div>
              </div>
            ) : null}
            <span className="sr-only" aria-live="polite">{cooldownAnnouncement}</span>
          </div>

          <input
            ref={frontCaptureRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void handleFile('front', e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <input
            ref={backCaptureRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void handleFile('back', e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <input
            ref={frontUploadRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              void handleFile('front', e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <input
            ref={backUploadRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              void handleFile('back', e.target.files?.[0])
              e.target.value = ''
            }}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DpiSlot
              label="Frente"
              preview={frontPreview}
              existingUrl={existingFront}
              disabled={disabled || busy}
              scanning={busy}
              success={status === 'done'}
              partial={status === 'partial'}
              error={status === 'error'}
              onTake={() => handleTakePhoto('front')}
              onUpload={() => frontUploadRef.current?.click()}
              onClear={() => clearSide('front')}
            />
            <DpiSlot
              label="Reverso"
              preview={backPreview}
              existingUrl={existingBack}
              disabled={disabled || busy}
              scanning={busy}
              success={status === 'done'}
              partial={status === 'partial'}
              error={status === 'error'}
              onTake={() => handleTakePhoto('back')}
              onUpload={() => backUploadRef.current?.click()}
              onClear={() => clearSide('back')}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void handleScan()} disabled={!canScan || busy} className="gap-2">
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : cooldownRemaining > 0 ? (
                <Clock className="h-4 w-4" />
              ) : (
                <ScanLine className="h-4 w-4" />
              )}
              {busy
                ? 'Analizando DPI...'
                : cooldownRemaining > 0
                  ? `Espere ${formatCountdown(cooldownRemaining)}`
                  : hasExisting && !frontFile && !backFile
                    ? 'Escanear nuevas fotos'
                    : 'Escanear DPI'}
            </Button>
            {busy ? (
              <span className="text-xs text-muted-foreground">
                Leyendo documento
                <span className="dpi-scan-dot">.</span>
                <span className="dpi-scan-dot">.</span>
                <span className="dpi-scan-dot">.</span>
              </span>
            ) : null}
            {loadingExisting ? (
              <span className="text-xs text-muted-foreground">Cargando imágenes guardadas...</span>
            ) : null}
            {!frontFile || !backFile ? (
              <span className="text-xs text-muted-foreground">Se necesitan las dos fotos para analizar.</span>
            ) : null}
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle className="h-4 w-4" />
                Avisos del escaneo
              </div>
              {warnings.map((warning, index) => (
                <p key={index} className="text-xs leading-5">{warning}</p>
              ))}
            </div>
          ) : null}

          {detected ? (
            <div className="rounded-md border border-border/50 bg-muted/20 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                Datos detectados
                <Badge variant="secondary" className="text-[10px]">
                  {foundCount} de {detectedFields.length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {detectedFields.map((field) => (
                  <div
                    key={field.key}
                    className="dpi-field-chip flex items-start gap-2 rounded-md border border-border/40 bg-background/40 p-2"
                  >
                    {field.value ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-muted-foreground/30" />
                    )}
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{field.label}</div>
                      <div className={cn('text-xs leading-4 break-words', field.value ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                        {field.value || 'No se encontró'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Los campos que ya tenían valor no se reemplazaron. Puedes corregir cualquier dato antes de guardar.
              </p>
            </div>
          ) : null}
        </CardContent>

        <Dialog open={Boolean(cameraFor)} onOpenChange={(open) => { if (!open) setCameraFor(null) }}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Tomar foto del {cameraFor === 'front' ? 'frente' : 'reverso'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {cameraError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {cameraError}. Use el botón “Subir” para seleccionar una foto.
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg bg-black">
                  <video ref={videoRef} className="h-auto w-full" playsInline muted />
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setCameraFor(null)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={capturePhoto} disabled={Boolean(cameraError)} className="gap-2">
                  <Camera className="h-4 w-4" />
                  Capturar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  )
}
