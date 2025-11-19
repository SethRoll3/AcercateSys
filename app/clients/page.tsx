'use client';

import { CreateClientForm } from '@/components/create-client-form';
import { EditClientForm } from '@/components/edit-client-form';
import { useEffect, useState } from 'react';

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  address: string;
  phone: string;
  emergency_phone: string;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const fetchClients = async () => {
    const res = await fetch('/api/clients');
    const data = await res.json();
    setClients(data);
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleEditClick = (client: Client) => {
    setSelectedClient(client);
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = async (clientId: string) => {
    await fetch('/api/clients', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: clientId }),
    });
    fetchClients();
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <button onClick={() => setIsCreateModalOpen(true)} className="px-4 py-2 text-white bg-blue-500 rounded-md hover:bg-blue-700">Añadir Cliente</button>
      </div>

      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
          <div className="bg-gray-800 p-8 rounded-lg w-1/2">
            <h2 className="text-xl font-bold mb-4">Añadir Nuevo Cliente</h2>
            <CreateClientForm onClientAdded={fetchClients} />
            <button onClick={() => setIsCreateModalOpen(false)} className="mt-4 px-4 py-2 text-white bg-red-500 rounded-md hover:bg-red-700">Cerrar</button>
          </div>
        </div>
      )}

      {isEditModalOpen && selectedClient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
          <div className="bg-gray-800 p-8 rounded-lg w-1/2">
            <h2 className="text-xl font-bold mb-4">Editar Cliente</h2>
            <EditClientForm client={selectedClient} onClose={() => setIsEditModalOpen(false)} />
            <button onClick={() => setIsEditModalOpen(false)} className="mt-4 px-4 py-2 text-white bg-red-500 rounded-md hover:bg-red-700">Cerrar</button>
          </div>
        </div>
      )}

      <div className="bg-gray-800 p-4 rounded-lg">
        <div className="grid grid-cols-6 gap-4 mb-4 font-bold">
          <div>Nombre</div>
          <div>Apellidos</div>
          <div>Dirección</div>
          <div>Teléfono</div>
          <div>Teléfono de Emergencia</div>
          <div>Acciones</div>
        </div>
        {clients.map((client) => (
          <div key={client.id} className="grid grid-cols-6 gap-4 py-2 border-b border-gray-700">
            <div>{client.first_name}</div>
            <div>{client.last_name}</div>
            <div>{client.address}</div>
            <div>{client.phone}</div>
            <div>{client.emergency_phone}</div>
            <div className="flex space-x-2">
              <button onClick={() => handleEditClick(client)} className="px-2 py-1 text-white bg-green-500 rounded-md hover:bg-green-700">Editar</button>
              <button onClick={() => handleDeleteClick(client.id)} className="px-2 py-1 text-white bg-red-500 rounded-md hover:bg-red-700">Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}