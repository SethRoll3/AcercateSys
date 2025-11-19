"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Client, User } from "@/lib/types";

interface CreateClientFormProps {
  onClientCreated: (client: Client) => void;
  onCancel: () => void;
}

export function CreateClientForm({ onClientCreated, onCancel }: CreateClientFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [advisors, setAdvisors] = useState<User[]>([]);
  const [selectedAdvisor, setSelectedAdvisor] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetchAdvisors();
  }, []);

  const fetchAdvisors = async () => {
    const response = await fetch("/api/advisors");
    const data = await response.json();
    setAdvisors(data);
  };

  const handleCreateClient = async () => {
    const response = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ first_name: firstName, last_name: lastName, email, phone, advisor_id: selectedAdvisor }),
    });

    if (response.ok) {
      const newClient = await response.json();
      onClientCreated(newClient);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="first-name">Nombres</Label>
          <Input id="first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last-name">Apellidos</Label>
          <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Teléfono</Label>
        <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="advisor">Asesor</Label>
        <Select onValueChange={setSelectedAdvisor} value={selectedAdvisor}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar asesor" />
          </SelectTrigger>
          <SelectContent>
            {advisors.map((advisor) => (
              <SelectItem key={advisor.id} value={advisor.id}>
                {advisor.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleCreateClient}>Crear Cliente</Button>
      </div>
    </div>
  );
}