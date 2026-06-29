import * as React from 'react';
import { Button } from 'web';

export const Variantes = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
    <Button>Reservar cita</Button>
    <Button variant="secondary">Ver agenda</Button>
    <Button variant="outline">Reprogramar</Button>
    <Button variant="ghost">Más tarde</Button>
    <Button variant="destructive">Cancelar cita</Button>
    <Button variant="link">Términos del servicio</Button>
  </div>
);

export const Tamanos = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
    <Button size="sm">Pequeño</Button>
    <Button>Mediano</Button>
    <Button size="lg">Grande</Button>
  </div>
);

export const Deshabilitado = () => <Button disabled>Procesando pago…</Button>;
