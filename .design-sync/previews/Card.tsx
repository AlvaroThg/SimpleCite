import * as React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  Button,
} from 'web';

export const Cita = () => (
  <Card style={{ maxWidth: 380 }}>
    <CardHeader>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <CardTitle>Consulta cardiológica</CardTitle>
        <Badge variant="success">Pagada</Badge>
      </div>
      <CardDescription>Dra. María Ruiz · Clínica San Rafael</CardDescription>
    </CardHeader>
    <CardContent>
      <p style={{ margin: 0, fontSize: 14, color: '#1f2d3d' }}>Martes 8 de julio · 10:30</p>
      <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
        Duración 30 min · Consultorio 4
      </p>
    </CardContent>
    <CardFooter style={{ gap: 8 }}>
      <Button size="sm">Confirmar asistencia</Button>
      <Button size="sm" variant="outline">
        Reprogramar
      </Button>
    </CardFooter>
  </Card>
);
