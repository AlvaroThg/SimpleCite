# SimpleCite — design system

SimpleCite es un SaaS de agenda y cobros para clínicas en Bolivia. Personalidad:
**moderno, confiable, cálido**. Estos componentes son React + Tailwind v4 (shadcn/ui)
con la identidad de marca ya aplicada.

## Setup

- **No hace falta provider ni wrapper.** Los componentes leen tokens desde CSS
  (variables en `styles.css`). Importa la hoja una vez y compón directo.
- **Fondo siempre blanco** (`bg-background`), nunca crema. Tipografía **Inter**
  (la sirve la app por `next/font`; en estos previews se carga por CDN).
- Importa desde el paquete del DS, p.ej. `import { Button, Card } from '…'`.

## Idioma de estilo: utilidades Tailwind + tokens de marca

Estiliza con clases utilitarias Tailwind usando ESTE vocabulario (no inventes otro):

- **Azul de marca (lo accionable):** `brand-50 100 200 300 400 500 600 700 800 900`
  (p.ej. `bg-brand-600`, `text-brand-700`, `ring-brand-400`). `brand-500` (#0a70f8) es el
  azul "Cite"; `brand-600` es el primario de acción. Regla: **un solo azul para lo
  accionable**, ≤ ~15% de la pantalla.
- **Navy de títulos/ink:** `ink-700 800 900` (p.ej. `text-ink-900`).
- **Tokens semánticos shadcn:** `bg-primary`/`text-primary-foreground` (botón principal),
  `bg-secondary`/`text-secondary-foreground`, `bg-accent`/`text-accent-foreground`,
  `text-muted-foreground` (texto atenuado), `border-border`, `bg-card`, `bg-destructive`
  (rojo de peligro), `ring-ring`.
- **Radios:** `rounded-lg` (controles), `rounded-xl`/`rounded-2xl` (tarjetas).
- **Estados (badges):** verde = ok/pagado, ámbar = pendiente, rojo = cancelado, gris =
  tentativo/neutral, azul = completado. Mantén ese significado.

No uses grises crudos para lo accionable; el azul de marca es la única señal de acción.
Cuida el **contraste AA** sobre el color elegido.

## Componentes

Primitivos: `Button` (variant: default/secondary/outline/ghost/destructive/link · size:
sm/default/lg/icon), `Badge` (default/secondary/success/warning/destructive/outline),
`Card` + `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`, `Input`,
`Label`, `ToggleGroup` + `ToggleGroupItem`, `EmptyState` ({icon,title,description,action}),
`Spinner`, `Toaster` (sonner). De dominio: `StatusBadge` ({status} → estados de cita) y
`PaymentQRSelector` ({banks:[{id,name,qrUrl,accountInfo}]}) para el cobro por QR.

La verdad vive en `styles.css` (tokens + utilidades) y en el `<Name>.d.ts` /
`<Name>.prompt.md` de cada componente — léelos antes de estilizar.

## Ejemplo idiomático

```tsx
<Card className="max-w-sm">
  <CardHeader>
    <div className="flex items-center justify-between gap-2">
      <CardTitle>Consulta general</CardTitle>
      <StatusBadge status="CONFIRMED" />
    </div>
    <CardDescription>Dra. María Ruiz · Clínica San Rafael</CardDescription>
  </CardHeader>
  <CardContent className="text-sm text-muted-foreground">Martes 8 · 10:30</CardContent>
  <CardFooter className="gap-2">
    <Button size="sm">Confirmar</Button>
    <Button size="sm" variant="outline">
      Reprogramar
    </Button>
  </CardFooter>
</Card>
```
