'use client'

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { useRole } from "@/contexts/role-context"
import { LoadingSpinner } from "@/components/loading-spinner"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BetterwareInfoCard } from "@/components/betterware/betterware-info-card"
import { BetterwareDocsPanel } from "@/components/betterware/betterware-docs-panel"
import { BetterwareAuthPanel } from "@/components/betterware/betterware-auth-panel"
import { BetterwareStatusPanel } from "@/components/betterware/betterware-status-panel"
import { BetterwareBillingPanel } from "@/components/betterware/betterware-billing-panel"
import { ArrowLeft } from "lucide-react"

const CACHE_TTL_MS = Number.MAX_SAFE_INTEGER
const readCache = (key: string) => {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (!obj || typeof obj.ts !== 'number') return null
    if (Date.now() - obj.ts > CACHE_TTL_MS) return null
    return obj.data ?? null
  } catch { }
  return null
}
const writeCache = (key: string, data: any) => {
  try { sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })) } catch { }
}

export default function BetterwareDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { role } = useRole()
  const [data, setData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const inFlightRef = useRef(false)

  const fetchDetails = async () => {
    try {
      const res = await fetch(`/api/betterware/${params.id}/details`, { credentials: 'include' as any })
      if (res.status === 401) { router.push('/auth/login'); return }
      if (res.ok) {
        const d = await res.json()
        setData(d)
        writeCache(`bw:detail:${params.id}`, d)
        setErrorMsg(null)
      } else {
        setErrorMsg('Error cargando solicitud')
      }
    } catch {
      setErrorMsg('Error de red')
    } finally {
      setIsLoading(false)
      inFlightRef.current = false
    }
  }

  useEffect(() => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setIsLoading(true)
    const cached = readCache(`bw:detail:${params.id}`)
    if (cached) { setData(cached); setIsLoading(false); inFlightRef.current = false }
    fetchDetails()
    const onFocus = () => { fetchDetails() }
    window.addEventListener('focus', onFocus)
    return () => { window.removeEventListener('focus', onFocus); inFlightRef.current = false }
  }, [params.id])

  if (isLoading) return <LoadingSpinner />
  if (errorMsg) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-2">
        <p className="text-muted-foreground">{errorMsg}</p>
        <Button variant="outline" onClick={() => { inFlightRef.current = false; setIsLoading(true); fetchDetails() }}>Reintentar</Button>
      </div>
    </div>
  )
  if (!data?.solicitud) return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <p className="text-muted-foreground">Solicitud no encontrada</p>
        <Button onClick={() => router.push("/dashboard/betterware")} className="mt-4">Volver</Button>
      </div>
    </div>
  )

  const canManage = ['admin', 'betterware_supervisor'].includes(role || '')

  return (
    <div className="w-full">
      <div className="flex items-center mb-6">
        <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/betterware")} className="mr-2">
          <ArrowLeft className="h-4 w-4 mr-2" />Volver
        </Button>
      </div>
      <div className="space-y-6">
        <BetterwareInfoCard solicitud={data.solicitud} docsCompleteness={data.docs_completeness} />
        <Tabs defaultValue="documentos" className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-4 bg-muted/50">
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
            <TabsTrigger value="autorizacion">Autorización</TabsTrigger>
            <TabsTrigger value="estado">Estado</TabsTrigger>
            <TabsTrigger value="facturacion">Facturación</TabsTrigger>
          </TabsList>
          <TabsContent value="documentos" className="mt-6">
            <BetterwareDocsPanel
              solicitudId={String(params.id)}
              documentos={data.documentos}
              docsCompleteness={data.docs_completeness}
              canManage={canManage || role === 'asesor'}
              onUpdate={fetchDetails}
            />
          </TabsContent>
          <TabsContent value="autorizacion" className="mt-6">
            <BetterwareAuthPanel
              solicitudId={String(params.id)}
              solicitud={data.solicitud}
              autorizaciones={data.autorizaciones}
              canManage={canManage}
              onUpdate={fetchDetails}
            />
          </TabsContent>
          <TabsContent value="estado" className="mt-6">
            <BetterwareStatusPanel
              solicitudId={String(params.id)}
              solicitud={data.solicitud}
              estadosLog={data.estados_log}
              canManage={canManage}
              onUpdate={fetchDetails}
            />
          </TabsContent>
          <TabsContent value="facturacion" className="mt-6">
            <BetterwareBillingPanel
              solicitudId={String(params.id)}
              solicitud={data.solicitud}
              facturacion={data.facturacion}
              canManage={canManage || role === 'asesor'}
              onUpdate={fetchDetails}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
