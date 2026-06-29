import * as React from 'react';
import { Label, Input } from 'web';

export const ConCampo = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 320 }}>
    <Label htmlFor="phone">Teléfono de contacto</Label>
    <Input id="phone" placeholder="+591 7XX XX XXX" />
  </div>
);

export const Requerido = () => (
  <Label htmlFor="email">
    Correo electrónico <span style={{ color: '#dc2626' }}>*</span>
  </Label>
);
