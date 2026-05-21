'use client'

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Upload, Trash2, FileText, Image, File, CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

interface Props {
  solicitudId: string
  documentos: any[]
  docsCompleteness: { total_required: number; uploaded: number; complete: boolean; missing: string[] }
  canManage: boolean
  onUpdate: () => void
}

const DOC_TYPES: Record<string, string> = {
  solicitud_credito: "Solicitud de Crédito",
  consulta_buro: "Consulta de Buró",
  dpi: "DPI",
  recibo: "Recibo",
  otro: "Otro",
}

export function BetterwareDocsPanel({ solicitudId, documentos, docsCompleteness, canManage, onUpdate }: Props) {
  const [isUploading, setIsUploading] = useState(false)
  const [selectedType, setSelectedType] = useState<string>('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [deleteDialog, setDeleteDialog] = useState<{isOpen: boolean, docId: string}>({isOpen: false, docId: ''})
  const [deleteMotivo, setDeleteMotivo] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedType) {
      toast.error('Seleccione un tipo de documento primero')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('El archivo no puede superar 10 MB')
      return
    }
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('tipo_documento', selectedType)
      const res = await fetch(`/api/betterware/${solicitudId}/documentos`, { method: 'POST', body: formData })
      if (res.ok) {
        toast.success('Documento subido correctamente')
        setSelectedType('')
        onUpdate()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al subir documento')
      }
    } catch {
      toast.error('Error de red')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDelete = async () => {
    if (!deleteMotivo.trim()) {
      toast.error('Debe ingresar un motivo para eliminar')
      return
    }
    
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/betterware/${solicitudId}/documentos?docId=${deleteDialog.docId}`, { 
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: deleteMotivo })
      })
      if (res.ok) { 
        toast.success('Documento eliminado')
        setDeleteDialog({isOpen: false, docId: ''})
        setDeleteMotivo('')
        onUpdate() 
      }
      else { const e = await res.json(); toast.error(e.error || 'Error') }
    } catch { toast.error('Error de red') }
    finally { setIsDeleting(false) }
  }

  const getFileIcon = (mime: string) => {
    if (mime?.startsWith('image/')) return <Image className="h-4 w-4 text-blue-400" />
    if (mime?.includes('pdf')) return <FileText className="h-4 w-4 text-red-400" />
    return <File className="h-4 w-4 text-muted-foreground" />
  }

  const formatBytes = (bytes: number) => {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-foreground">Documentos Obligatorios</h3>

      {/* Completeness indicator */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Object.entries(DOC_TYPES).filter(([k]) => k !== 'otro').map(([key, label]) => {
          const hasDoc = documentos.some(d => d.tipo_documento === key)
          return (
            <div key={key} className={`rounded-lg border p-3 text-center ${hasDoc ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
              {hasDoc ? <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" /> : <AlertTriangle className="h-5 w-5 text-amber-500 mx-auto mb-1" />}
              <div className="text-xs font-medium">{label}</div>
              <div className="text-xs text-muted-foreground">{hasDoc ? 'Subido' : 'Pendiente'}</div>
            </div>
          )
        })}
      </div>

      {/* Upload section */}
      {canManage && (
        <Card className="border-border/50">
          <CardContent className="pt-4">
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 space-y-1">
                <label className="text-sm font-medium text-foreground">Tipo de Documento</label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="bg-background/50"><SelectValue placeholder="Seleccione tipo" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(DOC_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" />
                <Button onClick={() => { if (!selectedType) { toast.error('Seleccione tipo primero'); return }; fileInputRef.current?.click() }} disabled={isUploading || !selectedType} className="gap-2">
                  <Upload className="h-4 w-4" />{isUploading ? 'Subiendo...' : 'Subir Documento'}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Formatos: Imágenes, PDF, Word, Excel. Máximo 10 MB.</p>
          </CardContent>
        </Card>
      )}

      {/* Documents list */}
      <div className="space-y-2">
        {documentos.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No hay documentos cargados</p>
        ) : documentos.map((doc: any) => (
          <div key={doc.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-card/50 p-3">
            <div className="flex items-center gap-3 min-w-0">
              {getFileIcon(doc.mime_type)}
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{doc.nombre_archivo}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-xs">{DOC_TYPES[doc.tipo_documento] || doc.tipo_documento}</Badge>
                  <span>{formatBytes(doc.tamano_bytes)}</span>
                  <span>{new Date(doc.created_at).toLocaleDateString('es-GT')}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" asChild><a href={doc.url} target="_blank" rel="noopener noreferrer">Ver</a></Button>
              {canManage && <Button variant="ghost" size="sm" onClick={() => setDeleteDialog({isOpen: true, docId: doc.id})} className="text-rose-500 hover:text-rose-600"><Trash2 className="h-4 w-4" /></Button>}
            </div>
          </div>
        ))}
      </div>

      {/* Delete Dialog Modal */}
      <Dialog open={deleteDialog.isOpen} onOpenChange={(open) => !open && setDeleteDialog({isOpen: false, docId: ''})}>
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-500">
              <AlertCircle className="h-5 w-5" /> Eliminar Documento
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Esta acción eliminará el archivo permanentemente y quedará un registro en el historial de la solicitud.
            </p>
            <div className="space-y-2">
              <Label className="text-foreground">Motivo de eliminación <span className="text-rose-500">*</span></Label>
              <Textarea 
                placeholder="Indique por qué se elimina este documento (ej. 'Documento ilegible', 'Archivo equivocado')" 
                value={deleteMotivo}
                onChange={(e) => setDeleteMotivo(e.target.value)}
                className="bg-background/50 resize-none"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialog({isOpen: false, docId: ''}); setDeleteMotivo(''); }} disabled={isDeleting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting || !deleteMotivo.trim()}>
              {isDeleting ? 'Eliminando...' : 'Eliminar Documento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
