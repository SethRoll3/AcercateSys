"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"
import { Plus, Trash2, Receipt, AlertTriangle, CheckCircle2, Search, Upload, Eye, X } from "lucide-react"
import type { Boleta } from "@/lib/types"
import { gtDateInputValue, formatYMDGT } from "@/lib/utils"
import { toast } from "sonner"

interface BoletasManagerProps {
  cuotaAmount: number
  onBoletasChange: (boletas: Boleta[], totalAmount: number) => void
  initialBoletas?: Boleta[]
  existingBoletas?: Boleta[]
}

interface NewBoletaForm {
  numeroBoleta: string
  formaPago: string
  fecha: string
  referencia: string
  banco: string
  monto: string
  observaciones: string
  imageFile: File | null
}

export function BoletasManager({ cuotaAmount, onBoletasChange, initialBoletas = [], existingBoletas = [] }: BoletasManagerProps) {
  const [boletas, setBoletas] = useState<Boleta[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Boleta[]>([])
  const [allSearchResults, setAllSearchResults] = useState<Boleta[]>([])
  const [selectedBoletas, setSelectedBoletas] = useState<Set<string>>(new Set())
  const [currentPage, setCurrentPage] = useState(1)
  const resultsPerPage = 10
  const [formData, setFormData] = useState<NewBoletaForm>({
    numeroBoleta: "",
    formaPago: "efectivo",
    fecha: gtDateInputValue(),
    referencia: "",
    banco: "",
    monto: "",
    observaciones: "",
    imageFile: null,
  })
  
  // Estados para manejo de imágenes
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isImageModalOpen, setIsImageModalOpen] = useState(false)
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)

  // Inicializar con boletas existentes
  useEffect(() => {
    if (initialBoletas.length > 0) {
      setBoletas(initialBoletas)
    }
  }, [initialBoletas])

  const totalBoletasAmount = Math.round(boletas.reduce((sum, boleta) => sum + boleta.monto, 0) * 100) / 100
  //const existingBoletasAmount = existingBoletas.reduce((sum, boleta) => sum + boleta.monto, 0)
  const totalAllBoletasAmount = totalBoletasAmount 
  const roundedCuotaAmount = Math.round(cuotaAmount * 100) / 100
  const isAmountMatch = Math.abs(totalAllBoletasAmount - roundedCuotaAmount) < 0.01
  const isPartialPayment = totalAllBoletasAmount > 0 && totalAllBoletasAmount < roundedCuotaAmount

  useEffect(() => {
    onBoletasChange(boletas, totalBoletasAmount)
  }, [boletas, totalBoletasAmount, onBoletasChange])

  // Funciones para manejo de imágenes
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validar tipo de archivo
      if (!file.type.startsWith('image/')) {
        toast.error("Por favor seleccione un archivo de imagen válido")
        return
      }
      
      // Validar tamaño (máximo 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("La imagen no puede ser mayor a 5MB")
        return
      }
      
      setFormData({ ...formData, imageFile: file })
      
      // Crear preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeImage = () => {
    setFormData({ ...formData, imageFile: null })
    setImagePreview(null)
  }

  const openImageModal = (imageUrl: string) => {
    setSelectedImageUrl(imageUrl)
    setIsImageModalOpen(true)
  }

  const uploadImageToSupabase = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await fetch('/api/upload-image', {
      method: 'POST',
      body: formData,
    })
    
    if (!response.ok) {
      throw new Error('Error al subir la imagen')
    }
    
    const { imageUrl } = await response.json()
    return imageUrl
  }

  const handleAddBoleta = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validar que se haya seleccionado una imagen
    if (!formData.imageFile) {
      toast.error("Debe seleccionar una imagen de la boleta")
      return
    }
    
    setIsLoading(true)

    try {
      // Primero subir la imagen
      const imageUrl = await uploadImageToSupabase(formData.imageFile)
      
      const response = await fetch("/api/boletas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroBoleta: formData.numeroBoleta,
          formaPago: formData.formaPago,
          fecha: formData.fecha,
          referencia: formData.referencia || null,
          banco: formData.banco || null,
          monto: parseFloat(formData.monto),
          observaciones: formData.observaciones || null,
          imageUrl: imageUrl,
        }),
      })

      if (response.ok) {
        const newBoleta = await response.json()
        setBoletas([...boletas, newBoleta])
        setFormData({
          numeroBoleta: "",
          formaPago: "efectivo",
          fecha: gtDateInputValue(),
          referencia: "",
          banco: "",
          monto: "",
          observaciones: "",
          imageFile: null,
        })
        setImagePreview(null)
        setIsDialogOpen(false)
        toast.success("Boleta agregada exitosamente")
      } else {
        const errorData = await response.json()
        toast.error(`Error al crear boleta: ${errorData.error}`)
      }
    } catch (error) {
      console.error("Error creating boleta:", error)
      toast.error("Error de red al crear la boleta")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemoveBoleta = (boletaId: string) => {
    setBoletas(boletas.filter(b => b.id !== boletaId))
    toast.success("Boleta removida")
  }

  const handleSearchBoletas = async (e: React.FormEvent | null) => {
    if (e) e.preventDefault()
    if (!searchQuery.trim()) {
      toast.error("Ingrese un número de boleta para buscar")
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(`/api/boletas/search?query=${encodeURIComponent(searchQuery.trim())}`)
      if (!response.ok) {
        throw new Error("Error al buscar boletas")
      }
      
      const data = await response.json()
      setAllSearchResults(data || [])
      setCurrentPage(1)
      
      if ((data || []).length === 0) {
        toast.info("No se encontraron boletas con ese número")
      } else {
        toast.success(`Se encontraron ${data.length} boleta(s)`)
      }
    } catch (error) {
      console.error("Error searching boletas:", error)
      toast.error("Error al buscar boletas")
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelectBoleta = (boletaId: string, checked: boolean) => {
    const newSelected = new Set(selectedBoletas)
    if (checked) {
      newSelected.add(boletaId)
    } else {
      newSelected.delete(boletaId)
    }
    setSelectedBoletas(newSelected)
  }

  const handleAddSelectedBoletas = () => {
    const boletasToAdd = searchResults.filter(boleta => selectedBoletas.has(boleta.id))
    
    if (boletasToAdd.length === 0) {
      toast.error("Seleccione al menos una boleta para agregar")
      return
    }

    // Verificar que las boletas no estén ya agregadas
    const existingIds = new Set(boletas.map(b => b.id))
    const newBoletas = boletasToAdd.filter(boleta => !existingIds.has(boleta.id))
    
    if (newBoletas.length === 0) {
      toast.error("Las boletas seleccionadas ya están agregadas")
      return
    }

    setBoletas([...boletas, ...newBoletas])
    toast.success(`${newBoletas.length} boleta(s) agregada(s)`)
    
    // Limpiar selección y cerrar diálogo
    setSelectedBoletas(new Set())
    setSearchResults([])
    setSearchQuery("")
    setIsSearchDialogOpen(false)
  }

  // Calcular resultados paginados localmente
  useEffect(() => {
    const startIndex = (currentPage - 1) * resultsPerPage
    const endIndex = startIndex + resultsPerPage
    setSearchResults(allSearchResults.slice(startIndex, endIndex))
  }, [allSearchResults, currentPage, resultsPerPage])

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const resetSearchForm = () => {
    setSearchQuery("")
    setSearchResults([])
    setAllSearchResults([])
    setSelectedBoletas(new Set())
    setCurrentPage(1)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-GT", {
      style: "currency",
      currency: "GTQ",
    }).format(amount)
  }

  const resetForm = () => {
    setFormData({
      numeroBoleta: "",
      formaPago: "efectivo",
      fecha: gtDateInputValue(),
      referencia: "",
      banco: "",
      monto: "",
      observaciones: "",
      imageFile: null,
    })
  }

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground">Boletas de Pago</CardTitle>
          </div>
          <div className="flex gap-2">
            <Dialog open={isSearchDialogOpen} onOpenChange={(open) => {
              setIsSearchDialogOpen(open)
              if (!open) resetSearchForm()
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                  <Search className="h-4 w-4" />
                  Buscar Boleta
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[95vw] max-h-[90vh] w-full sm:max-w-4xl">
                <DialogHeader>
                  <DialogTitle>Buscar Boletas Existentes</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 max-h-[calc(90vh-120px)] overflow-y-auto">
                  <form onSubmit={handleSearchBoletas} className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Ingrese número de boleta (ej: B-001, 78877, etc.)"
                      className="flex-1"
                    />
                    <Button type="submit" disabled={isSearching} className="w-full sm:w-auto">
                      {isSearching ? "Buscando..." : "Buscar"}
                    </Button>
                  </form>

                  {searchResults.length > 0 && (
                     <div className="space-y-4">
                       <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                         <div className="space-y-1">
                            <h3 className="text-lg font-semibold">Resultados de búsqueda</h3>
                            <p className="text-sm text-muted-foreground">
                              Mostrando {searchResults.length} de {allSearchResults.length} boletas
                              {allSearchResults.length > resultsPerPage && ` (Página ${currentPage} de ${Math.ceil(allSearchResults.length / resultsPerPage)})`}
                            </p>
                          </div>
                         <Button 
                           onClick={handleAddSelectedBoletas}
                           disabled={selectedBoletas.size === 0}
                           className="w-full sm:w-auto"
                         >
                           Agregar Seleccionadas ({selectedBoletas.size})
                         </Button>
                       </div>
                      
                      <div className="border rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-12">Sel.</TableHead>
                                <TableHead className="min-w-[100px]">Número</TableHead>
                                <TableHead className="hidden sm:table-cell min-w-[120px]">Forma de Pago</TableHead>
                                <TableHead className="min-w-[100px]">Fecha</TableHead>
                                <TableHead className="min-w-[100px]">Monto</TableHead>
                                <TableHead className="hidden md:table-cell min-w-[120px]">Referencia</TableHead>
                                <TableHead className="hidden lg:table-cell min-w-[100px]">Banco</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {searchResults.map((boleta) => (
                                <TableRow key={boleta.id}>
                                  <TableCell>
                                    <Checkbox
                                      checked={selectedBoletas.has(boleta.id)}
                                      onCheckedChange={(checked) => 
                                        handleSelectBoleta(boleta.id, checked as boolean)
                                      }
                                    />
                                  </TableCell>
                                  <TableCell className="font-medium">{boleta.numeroBoleta}</TableCell>
                                  <TableCell className="hidden sm:table-cell capitalize">{boleta.formaPago}</TableCell>
                                  <TableCell>{formatYMDGT(boleta.fecha)}</TableCell>
                                  <TableCell>{formatCurrency(boleta.monto)}</TableCell>
                                  <TableCell className="hidden md:table-cell">{boleta.referencia || "-"}</TableCell>
                                  <TableCell className="hidden lg:table-cell">{boleta.banco || "-"}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                         </div>
                       </div>
                       
                       {allSearchResults.length > resultsPerPage && (
                         <div className="flex justify-center mt-4">
                           <Pagination>
                             <PaginationContent>
                               <PaginationItem>
                                 <PaginationPrevious 
                                   onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                                   className={currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                 />
                               </PaginationItem>
                               
                               {Array.from({ length: Math.ceil(allSearchResults.length / resultsPerPage) }, (_, i) => i + 1)
                                 .filter(page => {
                                   const totalPages = Math.ceil(allSearchResults.length / resultsPerPage)
                                   if (totalPages <= 7) return true
                                   if (page === 1 || page === totalPages) return true
                                   if (page >= currentPage - 1 && page <= currentPage + 1) return true
                                   return false
                                 })
                                 .map((page, index, array) => {
                                   const prevPage = array[index - 1]
                                   const showEllipsis = prevPage && page - prevPage > 1
                                   
                                   return (
                                     <React.Fragment key={page}>
                                       {showEllipsis && (
                                         <PaginationItem>
                                           <PaginationEllipsis />
                                         </PaginationItem>
                                       )}
                                       <PaginationItem>
                                         <PaginationLink
                                           onClick={() => handlePageChange(page)}
                                           isActive={currentPage === page}
                                           className="cursor-pointer"
                                         >
                                           {page}
                                         </PaginationLink>
                                       </PaginationItem>
                                     </React.Fragment>
                                   )
                                 })}
                               
                               <PaginationItem>
                                 <PaginationNext 
                                   onClick={() => currentPage < Math.ceil(allSearchResults.length / resultsPerPage) && handlePageChange(currentPage + 1)}
                                   className={currentPage >= Math.ceil(allSearchResults.length / resultsPerPage) ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                 />
                               </PaginationItem>
                             </PaginationContent>
                           </Pagination>
                         </div>
                       )}
                     </div>
                   )}
                 </div>
               </DialogContent>
            </Dialog>

            <Dialog open={isDialogOpen} onOpenChange={(open) => {
              setIsDialogOpen(open)
              if (!open) resetForm()
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 bg-transparent">
                  <Plus className="h-4 w-4" />
                  Agregar Boleta
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Nueva Boleta</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddBoleta} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="numeroBoleta">Número de Boleta *</Label>
                  <Input
                    id="numeroBoleta"
                    value={formData.numeroBoleta}
                    onChange={(e) => setFormData({ ...formData, numeroBoleta: e.target.value })}
                    placeholder="B-001"
                    required
                    className="bg-background/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="formaPago">Forma de Pago *</Label>
                    <Select
                      value={formData.formaPago}
                      onValueChange={(value) => setFormData({ ...formData, formaPago: value })}
                    >
                      <SelectTrigger className="bg-background/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                        <SelectItem value="deposito">Depósito</SelectItem>
                        <SelectItem value="transferencia">Transferencia</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="tarjeta">Tarjeta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fecha">Fecha *</Label>
                    <Input
                      id="fecha"
                      type="date"
                      value={formData.fecha}
                      onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                      required
                      className="bg-background/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="monto">Monto *</Label>
                  <Input
                    id="monto"
                    type="number"
                    step="0.01"
                    value={formData.monto}
                    onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
                    placeholder="0.00"
                    required
                    className="bg-background/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="referencia">Referencia</Label>
                    <Input
                      id="referencia"
                      value={formData.referencia}
                      onChange={(e) => setFormData({ ...formData, referencia: e.target.value })}
                      placeholder="REF-123"
                      className="bg-background/50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="banco">Banco</Label>
                    <Input
                      id="banco"
                      value={formData.banco}
                      onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                      placeholder="Banco Industrial"
                      className="bg-background/50"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="observaciones">Observaciones</Label>
                  <Textarea
                    id="observaciones"
                    value={formData.observaciones}
                    onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                    placeholder="Notas adicionales..."
                    className="bg-background/50 min-h-[60px]"
                  />
                </div>

                {/* Campo de subida de imagen */}
                <div className="space-y-2">
                  <Label htmlFor="image">Imagen de la Boleta *</Label>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Input
                        id="image"
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="bg-background/50"
                        required
                      />
                      {imagePreview && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={removeImage}
                          className="px-2"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    
                    {imagePreview && (
                      <div className="relative">
                        <img
                          src={imagePreview}
                          alt="Preview de la boleta"
                          className="w-full max-w-xs h-32 object-cover rounded-md border"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => openImageModal(imagePreview)}
                          className="absolute top-2 right-2"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    
                    {!imagePreview && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Upload className="h-4 w-4" />
                        <span>Seleccione una imagen de la boleta (máximo 5MB)</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsDialogOpen(false)}
                    className="bg-transparent"
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? "Creando..." : "Crear Boleta"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Resumen de montos */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Monto Cuota</p>
            <p className="font-semibold text-foreground">{formatCurrency(cuotaAmount)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total Boletas</p>
            <p className="font-semibold text-foreground">{formatCurrency(totalBoletasAmount)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Diferencia</p>
            <p className={`font-semibold ${isAmountMatch ? 'text-green-600' : 'text-orange-600'}`}>
              {formatCurrency(totalBoletasAmount - cuotaAmount)}
            </p>
          </div>
        </div>

        {/* Alertas de estado */}
        {isAmountMatch && boletas.length > 0 && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              ✅ El monto total de las boletas coincide con el monto de la cuota. El pago se marcará como completo.
            </AlertDescription>
          </Alert>
        )}

        {isPartialPayment && (
          <Alert className="bg-orange-50 border-orange-200">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              ⚠️ El monto total de las boletas es menor al monto de la cuota. El pago se marcará como parcial.
            </AlertDescription>
          </Alert>
        )}

        {totalAllBoletasAmount > cuotaAmount && (
          <Alert className="bg-red-50 border-red-200">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              ❌ El monto total de las boletas excede el monto de la cuota. Exceso: Q {(totalAllBoletasAmount - cuotaAmount).toFixed(2)}
            </AlertDescription>
          </Alert>
        )}

        {/* Lista de boletas */}
        {boletas.length > 0 ? (
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="text-muted-foreground">Boleta</TableHead>
                  <TableHead className="text-muted-foreground">Forma Pago</TableHead>
                  <TableHead className="text-muted-foreground">Fecha</TableHead>
                  <TableHead className="text-muted-foreground">Monto</TableHead>
                  <TableHead className="text-muted-foreground">Imagen</TableHead>
                  <TableHead className="text-muted-foreground">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {boletas.map((boleta) => (
                  <TableRow key={boleta.id} className="border-border/50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Receipt className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{boleta.numeroBoleta}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{boleta.formaPago}</Badge>
                    </TableCell>
                    <TableCell>
                      {formatYMDGT(boleta.fecha)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(boleta.monto)}
                    </TableCell>
                    <TableCell>
                      {boleta.imageUrl ? (
                        <div className="flex items-center gap-2">
                          <img
                            src={boleta.imageUrl}
                            alt="Boleta"
                            className="w-8 h-8 object-cover rounded border"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openImageModal(boleta.imageUrl!)}
                            className="px-2"
                          >
                            <Eye className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Sin imagen</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveBoleta(boleta.id)}
                        className="bg-transparent text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Receipt className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No hay boletas agregadas</p>
            <p className="text-sm">Haz clic en "Agregar Boleta" para comenzar</p>
          </div>
        )}
      </CardContent>

      {/* Modal para visualizar imágenes */}
      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Imagen de la Boleta</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            {selectedImageUrl && (
              <img
                src={selectedImageUrl}
                alt="Imagen de la boleta"
                className="max-w-full max-h-[70vh] object-contain rounded-md"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}