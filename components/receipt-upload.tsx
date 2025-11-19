'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, X, FileImage, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface ReceiptUploadProps {
  onUploadComplete: (imageUrl: string) => void
  onUploadError?: (error: string) => void
  maxSizeMB?: number
  acceptedTypes?: string[]
  disabled?: boolean
}

export function ReceiptUpload({
  onUploadComplete,
  onUploadError,
  maxSizeMB = 5,
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'],
  disabled = false
}: ReceiptUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validar tipo de archivo
    if (!acceptedTypes.includes(file.type)) {
      toast.error(`Tipo de archivo no válido. Solo se permiten: ${acceptedTypes.join(', ')}`)
      return
    }

    // Validar tamaño
    const fileSizeMB = file.size / (1024 * 1024)
    if (fileSizeMB > maxSizeMB) {
      toast.error(`El archivo es muy grande. Tamaño máximo: ${maxSizeMB}MB`)
      return
    }

    setSelectedFile(file)

    // Crear preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const uploadFile = async () => {
    if (!selectedFile) return

    setUploading(true)
    try {
      // Generar nombre único para el archivo
      const fileExt = selectedFile.name.split('.').pop()
      const fileName = `receipt_${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `receipts/${fileName}`

      // Subir archivo a Supabase Storage
      const { data, error } = await supabase.storage
        .from('receipts')
        .upload(filePath, selectedFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) {
        throw error
      }

      // Obtener URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('receipts')
        .getPublicUrl(filePath)

      onUploadComplete(publicUrl)
      toast.success('Boleta subida exitosamente')
      
      // Limpiar estado
      setSelectedFile(null)
      setPreview(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }

    } catch (error) {
      console.error('Error uploading file:', error)
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
      toast.error(`Error al subir la boleta: ${errorMessage}`)
      onUploadError?.(errorMessage)
    } finally {
      setUploading(false)
    }
  }

  const clearSelection = () => {
    setSelectedFile(null)
    setPreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileImage className="h-5 w-5" />
          Subir Boleta de Pago
        </CardTitle>
        <CardDescription>
          Sube una foto de tu boleta de pago para confirmar la transacción
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="receipt-upload">Seleccionar archivo</Label>
          <Input
            id="receipt-upload"
            ref={fileInputRef}
            type="file"
            accept={acceptedTypes.join(',')}
            onChange={handleFileSelect}
            disabled={disabled || uploading}
            className="cursor-pointer"
          />
          <p className="text-sm text-muted-foreground">
            Formatos permitidos: JPG, PNG, WebP. Tamaño máximo: {maxSizeMB}MB
          </p>
        </div>

        {preview && (
          <div className="space-y-3">
            <div className="relative">
              <img
                src={preview}
                alt="Vista previa de la boleta"
                className="w-full max-w-md h-48 object-cover rounded-lg border"
              />
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute top-2 right-2"
                onClick={clearSelection}
                disabled={uploading}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={uploadFile}
                disabled={uploading || disabled}
                className="flex-1"
              >
                {uploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Subiendo...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Subir Boleta
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={clearSelection}
                disabled={uploading}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}