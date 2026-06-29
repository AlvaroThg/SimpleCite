import * as React from 'react';
import { Input, Label } from 'web';

export const ConEtiqueta = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 320 }}>
    <Label htmlFor="ci">Cédula de identidad</Label>
    <Input id="ci" placeholder="Ej. 1234567 SC" />
  </div>
);

export const Estados = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
    <Input placeholder="Nombre del paciente" />
    <Input defaultValue="María Ruiz Vargas" />
    <Input placeholder="No editable" disabled />
  </div>
);
