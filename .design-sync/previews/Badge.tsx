import * as React from 'react';
import { Badge } from 'web';

export const Variantes = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
    <Badge>Confirmada</Badge>
    <Badge variant="secondary">Tentativa</Badge>
    <Badge variant="success">Pagada</Badge>
    <Badge variant="warning">Pago pendiente</Badge>
    <Badge variant="destructive">Cancelada</Badge>
    <Badge variant="outline">Sin asignar</Badge>
  </div>
);
