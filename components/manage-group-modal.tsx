"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Client } from "@/lib/types";
import { toast } from "sonner";
import { CreateClientForm } from "@/components/create-client-form";

interface Group {
  id: string;
  name: string;
  clients: Client[];
}

interface ManageGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupSaved: () => void;
  group?: Group; // Optional group object for editing
}

export function ManageGroupModal({ isOpen, onClose, onGroupSaved, group }: ManageGroupModalProps) {
  const [groupName, setGroupName] = useState("");
  const [selectedClients, setSelectedClients] = useState<Client[]>([]);
  const [availableClients, setAvailableClients] = useState<Client[]>([]);
  const [isCreateClientModalOpen, setIsCreateClientModalOpen] = useState(false); // State to control CreateClientForm modal
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchAvailableClients();
      if (group) {
        setGroupName((group as any).nombre ?? group.name ?? "");
        setSelectedClients(group.clients || []);
      } else {
        setGroupName("");
        setSelectedClients([]);
      }
    }
  }, [isOpen, group]);

  const fetchAvailableClients = async () => {
    const response = await fetch("/api/clients?in_group=false");
    const data = await response.json();
    setAvailableClients(data);
  };

  const handleSaveGroup = async () => {
    if (!groupName.trim()) {
      toast.error("El nombre del grupo no puede estar vacío.");
      return;
    }
    if (selectedClients.length < 3 || selectedClients.length > 5) {
      toast.error("El grupo debe tener entre 3 y 5 clientes.");
      return;
    }

    const method = group ? "PUT" : "POST";
    const url = group ? `/api/grupos/${group.id}` : "/api/grupos";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: groupName, clients: selectedClients.map(c => c.id) }),
    });

    if (response.ok) {
      toast.success(`Grupo ${group ? "actualizado" : "creado"} con éxito`);
      onGroupSaved();
      onClose();
    } else {
      const errorData = await response.json();
      toast.error(`Error al ${group ? "actualizar" : "crear"} el grupo: ${errorData.error}`);
    }
  };

  const handleClientAdded = () => {
    fetchAvailableClients(); // Refresh available clients after a new one is added
    setIsCreateClientModalOpen(false); // Close the CreateClientForm modal
  };

  const selectedIds = new Set(selectedClients.map(c => c.id));
  const filteredAvailableClients = availableClients
    .filter(c => !selectedIds.has(c.id))
    .filter(client => `${client.first_name} ${client.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()));

  const addClient = (client: Client) => {
    if (selectedIds.has(client.id)) return;
    setSelectedClients(prev => [...prev, client]);
    setAvailableClients(prev => prev.filter(c => c.id !== client.id));
  };

  const removeClient = (client: Client) => {
    setSelectedClients(prev => prev.filter(c => c.id !== client.id));
    setAvailableClients(prev => {
      const exists = prev.some(c => c.id === client.id);
      return exists ? prev : [...prev, client];
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{group ? "Editar Grupo" : "Crear Nuevo Grupo"}</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <div className="mb-4">
            <Label htmlFor="group-name">Nombre del Grupo</Label>
            <Input id="group-name" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Clientes</h3>
              <Button variant="outline" onClick={() => setIsCreateClientModalOpen(true)}>Crear Nuevo Cliente</Button>
            </div>

            <div className="mb-4">
              <Label>Clientes Seleccionados ({selectedClients.length})</Label>
              <div className="border rounded-md p-3 min-h-[72px] flex flex-wrap gap-2">
                {selectedClients.map(client => (
                  <span key={client.id} className="inline-flex items-center gap-2 rounded-md bg-secondary text-secondary-foreground px-3 py-1 text-sm">
                    {client.first_name} {client.last_name}
                    <Button aria-label="Quitar" variant="ghost" size="sm" onClick={() => removeClient(client)}>Quitar</Button>
                  </span>
                ))}
                {selectedClients.length === 0 && (
                  <span className="text-muted-foreground text-sm">Aún no has seleccionado clientes</span>
                )}
              </div>
            </div>

            <div>
              <Label>Clientes Disponibles</Label>
              <div className="border rounded-md">
                <div className="flex items-center gap-2 px-3 py-2 border-b">
                  <Input
                    placeholder="Buscar cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-background/50"
                  />
                  <span className="text-xs text-muted-foreground">{filteredAvailableClients.length} resultados</span>
                </div>
                <div className="max-h-[240px] overflow-y-auto">
                  {filteredAvailableClients.map(client => (
                    <div key={client.id} className="flex justify-between items-center px-3 py-2 hover:bg-accent hover:text-accent-foreground transition-colors">
                      <span>{client.first_name} {client.last_name}</span>
                      <Button variant="outline" size="sm" onClick={() => addClient(client)}>Agregar</Button>
                    </div>
                  ))}
                  {filteredAvailableClients.length === 0 && (
                    <div className="text-sm text-muted-foreground px-3 py-4">No hay clientes disponibles sin grupo</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSaveGroup}>
            {group ? "Guardar Cambios" : "Crear Grupo"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* CreateClientForm as a separate modal */}
      <CreateClientForm
        isOpen={isCreateClientModalOpen}
        onClose={() => setIsCreateClientModalOpen(false)}
        onClientAdded={handleClientAdded}
      />
    </Dialog>
  );
}
