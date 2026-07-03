"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ReceiptUpload } from "@/components/receipt-upload"
import { Download, FileText, Trash2, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"

interface ActaComiteTabProps {
  loanId: string
  actaUrl: string | null
  actaUploadedAt: string | null
  onActaChanged?: () => void
}

export function ActaComiteTab({ loanId, actaUrl, actaUploadedAt, onActaChanged }: ActaComiteTabProps) {
  const [actaDate, setActaDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [isDeleting, setIsDeleting] = useState(false)
  const [isPersisting, setIsPersisting] = useState(false)

  const handleUploadComplete = async (url: string) => {
    setIsPersisting(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/acta-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actaUrl: url }),
      })
      if (!res.ok) {
        const txt = await res.text()
        let msg = txt
        try { msg = JSON.parse(txt).error || txt } catch {}
        throw new Error(msg || "Error al guardar")
      }
      toast.success("Acta firmada guardada correctamente")
      onActaChanged?.()
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar el acta")
    } finally {
      setIsPersisting(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm("¿Eliminar el acta firmada?")) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/loans/${loanId}/acta-upload`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) {
        const txt = await res.text()
        let msg = txt
        try { msg = JSON.parse(txt).error || txt } catch {}
        throw new Error(msg || "Error al eliminar")
      }
      toast.success("Acta eliminada")
      onActaChanged?.()
    } catch (e: any) {
      toast.error(e?.message || "Error al eliminar el acta")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold text-foreground mb-1">Acta de Comité de Créditos</h3>
        <p className="text-sm text-muted-foreground">
          Genera el acta en blanco, imprímela, hazla firmar por los integrantes del comité y luego sube el archivo firmado.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <h4 className="text-sm font-medium">Generar acta en blanco</h4>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <Label htmlFor="acta-date-detail">Fecha del acta</Label>
            <Input
              id="acta-date-detail"
              type="date"
              value={actaDate}
              onChange={(e) => setActaDate(e.target.value)}
              className="w-full sm:w-[200px]"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => window.open(`/api/loans/${loanId}/acta-pdf?date=${actaDate}`, "_blank")}
          >
            <Download className="mr-2 h-4 w-4" />
            Generar y Descargar Acta PDF
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <h4 className="text-sm font-medium">Acta firmada</h4>
        </div>

        {actaUrl ? (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md border">
              <div className="flex items-center gap-2 text-foreground font-medium mb-1">
                <FileText className="h-4 w-4" />
                Acta firmada subida
              </div>
              {actaUploadedAt && (
                <div className="text-xs">
                  Subida el {new Date(actaUploadedAt).toLocaleString("es-GT")}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(actaUrl, "_blank")}
              >
                <Download className="mr-2 h-4 w-4" />
                Descargar acta firmada
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                className="text-destructive hover:text-destructive"
              >
                {isDeleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Eliminar
              </Button>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Reemplazar con otro archivo
              </summary>
              <div className="mt-3">
                <ReceiptUpload
                  onUploadComplete={handleUploadComplete}
                  folderPath={`actas/${loanId}`}
                  maxSizeMB={5}
                  acceptedTypes={["application/pdf", "image/jpeg", "image/png", "image/webp"]}
                  title="Reemplazar acta firmada"
                  description="Sube un nuevo PDF o imagen del acta firmada"
                  buttonText="Subir reemplazo"
                />
                {isPersisting && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Guardando...
                  </div>
                )}
              </div>
            </details>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              No hay acta firmada subida todavía.
            </p>
            <ReceiptUpload
              onUploadComplete={handleUploadComplete}
              folderPath={`actas/${loanId}`}
              maxSizeMB={5}
              acceptedTypes={["application/pdf", "image/jpeg", "image/png", "image/webp"]}
              title="Subir Acta Firmada"
              description="Sube el PDF o imagen del acta firmada por los integrantes del comité"
              buttonText="Subir Acta"
            />
            {isPersisting && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Guardando...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
