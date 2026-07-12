# SimpleCite

SaaS multi-tenant de agenda y cobros para clínicas en Bolivia (NestJS + Next.js 15 + Prisma + Tailwind v4 + shadcn/ui, monorepo pnpm/Turborepo).

## Design Context

Antes de tocar la UI, lee estos dos archivos en la raíz — son la fuente de verdad de diseño:

- **[PRODUCT.md](PRODUCT.md)** — estrategia: registro (`product`), usuarios (staff de clínica, pacientes, compradores SaaS), propósito, personalidad de marca (moderno · confiable · cálido), anti-referencias y principios de diseño.
- **[DESIGN.md](DESIGN.md)** — sistema visual: North Star "Claridad confiable", paleta (tokens `brand-*`/`ink-*` + shadcn en `apps/web/src/app/globals.css`), tipografía (Inter), elevación, componentes (`apps/web/src/components/ui/*`) y do's/don'ts. Tokens renderizables en `.impeccable/design.json`.

Reglas no negociables: fondo blanco (nunca crema), un solo azul de marca para lo accionable (≤~15% de pantalla), plano por defecto, **contraste AA** (verificado contra el color de cada tenant), y **móvil primero** en superficies de paciente. Sin slop de IA (eyebrows en mayúsculas, grids de cards idénticas, gradientes de texto, side-stripes).

Para diseñar/iterar UI usa el skill **`/impeccable`** (`craft`, `critique`, `audit`, `polish`, etc.), que lee PRODUCT.md y DESIGN.md.

## Git Restrictions
Never run 'git commit' or 'git push'. 
Only modify local files and let the user handle all version control. Let the user make the commmits and pushes, but give the commit name ideas so the user can create them later.