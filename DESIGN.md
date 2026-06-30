---
name: SimpleCite
description: SaaS multi-tenant de agenda y cobros para clínicas en Bolivia — claridad confiable.
colors:
  brand-50: '#eff6ff'
  brand-100: '#dbeafe'
  brand-200: '#bfdbfe'
  brand-300: '#93c5fd'
  brand-400: '#60a5fa'
  brand-500: '#3b82f6'
  brand-600: '#2563eb'
  brand-700: '#1d4ed8'
  brand-800: '#1e40af'
  brand-900: '#1e3a8a'
  primary: '#2563eb'
  primary-foreground: '#ffffff'
  accent: '#eff6ff'
  accent-foreground: '#1d4ed8'
  ink-900: '#0f172a'
  ink-800: '#1e293b'
  ink-700: '#334155'
  background: '#f8fafc' # canvas de la app; las superficies/tarjetas son #ffffff (surface)
  foreground: '#0f172a'
  muted: '#f1f5f9'
  muted-foreground: '#475569'
  border: '#e2e8f0'
  ring: '#2563eb'
  destructive: '#dc2626'
  success: '#15803d'
  warning: '#b45309'
typography:
  display:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: 'clamp(2.25rem, 5vw, 3rem)'
    fontWeight: 800
    lineHeight: '1.1'
    letterSpacing: '-0.02em'
  headline:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.5rem'
    fontWeight: 700
    lineHeight: '1.2'
  title:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: '1.4'
  body:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: '1.5'
  label:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 500
    letterSpacing: '0'
rounded:
  md: '8px'
  lg: '10px'
  xl: '12px'
  2xl: '16px'
spacing:
  sm: '8px'
  md: '16px'
  lg: '24px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    rounded: '{rounded.md}'
    padding: '8px 16px'
  button-primary-hover:
    backgroundColor: '{colors.brand-700}'
    textColor: '{colors.primary-foreground}'
  button-outline:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: '8px 16px'
  input:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: '4px 12px'
    height: '36px'
  card:
    backgroundColor: '{colors.background}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.xl}'
    padding: '20px'
---

# Design System: SimpleCite

## 1. Overview

**Creative North Star: "Claridad confiable"**

SimpleCite es una herramienta de salud, y la confianza médica se gana cuando todo se entiende a la primera, no con solemnidad ni con azul corporativo. El sistema apuesta por jerarquía legible, blanco limpio y espacios respirados; el azul de marca (`#2563EB`) guía la atención hacia lo accionable, y la calidez vive en el copy humano (español boliviano) y en el acento, no en fondos tibios. Es moderno y ágil sin ser ruidoso: se siente actual, rápido y serio con los datos, pero cercano.

Una sola identidad sirve a tres densidades. El **panel** del staff prioriza eficiencia: denso, plano, pocos clics. El **booking/landing del tenant** prioriza la confianza del paciente: guiado, espacioso, móvil primero. La **landing de marca** persuade. La paleta y la voz no cambian entre ellas; cambia el ritmo. Cada clínica además trae su propio `primaryColor`/`secondaryColor`, así que el sistema debe verse impecable con cualquier hue y nunca caer en plantilla.

Rechaza explícitamente: el SaaS genérico de IA (crema, eyebrows en mayúsculas, grids de cards idénticas, gradientes de texto), lo corporativo frío de hospital, el exceso llamativo, y el software médico anticuado de tablas grises densas.

**Key Characteristics:**

- Canvas de app casi blanco (`#f8fafc`) con superficies/tarjetas blancas (`#ffffff`), tinta slate (`#0f172a`), un solo azul de marca como acento accionable.
- Plano por defecto; profundidad solo como respuesta a estado (hover/focus).
- Una familia tipográfica (Inter) en contraste de peso, no fuentes que compiten.
- Esquinas suaves generosas (`rounded-xl`/`2xl`), toques amplios, móvil primero.
- Personalizable por tenant sin romper coherencia ni contraste.

## 2. Colors

Paleta de un solo acento: navy + azul de marca sobre blanco, con neutros fríos. Sobrio por defecto (acento ≤ ~15% de la pantalla), expresivo solo en CTAs y estados.

### Primary

- **Azul de marca** (`#2563EB`, token `brand-600`/`primary`): identidad, foco y botón primario. Alineado al primario del rediseño importado de claude.ai/design (reemplaza al antiguo `#0a70f8`; los assets de logo/favicon deben re-exportarse a esta paleta).
- **Azul profundo** (`#1d4ed8`, `brand-700`): hover de primarios y texto de acento sobre tints claros (`accent-foreground`).

### Secondary

- **Tinte de marca** (`#eff6ff`, `brand-50`/`accent`): fondos suaves de chips activos, badges de rol, hovers (`hover:bg-accent`). La calidez/atención sin saturar.

### Neutral

- **Slate tinta** (`#0f172a`, `ink-900`/`foreground`): cuerpo y títulos. La tinta principal, nunca negro puro.
- **Slate secundario** (`#1e293b` `ink-800`, `#334155` `ink-700`): títulos/énfasis alternos.
- **Gris apagado** (`#475569`, `muted-foreground`): texto secundario.
- **Borde** (`#e2e8f0`, `border`/`input`): líneas y campos.
- **Superficie** (`#ffffff`, `surface`/`card`) sobre **canvas** (`#f8fafc`, `background`): tarjetas blancas sobre un lienzo casi blanco frío. Nunca crema.
- **Anillo de foco** (`#2563eb`, `ring`/`primary`).

### Tertiary (estados semánticos)

- **Éxito** (`#15803d` sobre `#dcfce7`), **Aviso** (`#b45309` sobre `#fef3c7`), **Destructivo** (`#dc2626`). Para badges de pago, toasts y errores.

### Named Rules

**La Regla del Único Azul.** El acento azul aparece en lo accionable (CTAs, enlaces, estado activo, foco) y ocupa ≤ ~15% de cualquier pantalla. Su escasez es lo que lo hace legible como "esto se toca".

**La Regla del Tenant.** Cada clínica inyecta su `primaryColor`/`secondaryColor`. Toda superficie de tenant debe verse bien con cualquier hue y **mantener AA**: nunca texto claro sobre su propio tint; verificar contraste contra el color recibido, no asumir azul.

**La Regla Anti-Crema.** El fondo del cuerpo es blanco puro (`#ffffff`) o un neutro frío. Prohibido el crema/sand/beige y los tokens `--paper`/`--cream`/`--linen`.

## 3. Typography

**Display Font:** Inter (con `ui-sans-serif, system-ui, sans-serif`)
**Body Font:** Inter (misma familia)
**Label/Mono Font:** no hay mono dedicada; código/IDs usan `font-mono` del sistema en `text-xs`.

**Character:** una sola familia (Inter) que carga toda la jerarquía por contraste de peso (400 → 600 → 700 → 800). Neutra, legible y moderna; sin una segunda fuente que compita.

### Hierarchy

- **Display** (800, `clamp(2.25rem, 5vw, 3rem)`, lh 1.1, tracking `-0.02em`): hero de landings y `h1` de marca. Techo ~3rem: la página no grita.
- **Headline** (700, `1.5rem`–`1.875rem`, lh 1.2): títulos de sección y de página de panel.
- **Title** (600, `1.125rem`): títulos de Card, encabezados de bloque.
- **Body** (400, `0.875rem` en panel / `1rem` en marketing, lh 1.5): texto general. Prosa larga ≤ 65–75ch.
- **Label** (500, `0.75rem`): badges, metadatos, ayudas de campo.

### Named Rules

**La Regla de Una Familia.** Inter resuelve todo. Si hace falta más jerarquía, sube peso o tamaño; no agregues otra tipografía.
**La Regla Sin Mayúsculas.** Nada de cuerpos ni eyebrows en ALL-CAPS tracked sobre cada sección. La jerarquía es por escala y peso, no por un kicker en mayúsculas.

## 4. Elevation

Plano por defecto, con capas tonales (blanco sobre `#f8fafc`/`#f9fafb`) y bordes `#e5e7eb` para separar. La sombra es sutil y casi siempre una **respuesta a estado**: las Cards descansan con `shadow-sm` (o sin sombra) y elevan a `shadow-md` en hover. No hay sombras dramáticas ni glassmorphism decorativo.

### Shadow Vocabulary

- **Reposo** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)` — `shadow-sm`): Cards, inputs, barras.
- **Hover/elevado** (`box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1)` — `shadow-md`): tarjetas clickeables, especialistas, servicios.
- **Flotante** (`shadow-lg`/`shadow-xl`): solo modales, toasts y CTAs sobre color.

### Named Rules

**La Regla Plana-por-Defecto.** Las superficies son planas en reposo; la sombra aparece como feedback (hover, foco, elevación de modal), no como decoración. Si parece app de 2014, la sombra es muy oscura.

## 5. Components

### Buttons

- **Shape:** esquinas suaves (`rounded-md` 8px en botones shadcn; `rounded-xl` 12px / `rounded-2xl` 16px en CTAs grandes de marca).
- **Primary:** fondo `#0860dd` (`primary`), texto blanco, `padding 8px 16px` (h-9), `shadow-sm`. Verbo + objeto en el label ("Guardar cambios", no "OK").
- **Hover / Focus:** `hover:bg-primary/90` (≈ `#084fb8`), `active:scale-95`, foco `ring-2 ring-ring/50`. **`cursor: pointer` obligatorio** (Tailwind v4 lo resetea — se restaura en base).
- **Secondary / Outline / Ghost:** `secondary` gris `#f1f5f9`; `outline` borde `#e5e7eb` con `hover:bg-accent`; `ghost` solo `hover:bg-accent`. `destructive` rojo `#dc2626`.

### Chips / Badges

- **Style:** pill (`rounded-full`), `text-xs font-medium`, fondo tonal + texto del mismo hue oscuro. Roles: `success` (verde), `warning` (ámbar), `destructive` (rojo), `secondary` (gris), default (azul de marca).
- **State:** chips de servicio activos usan `bg-accent text-accent-foreground`.

### Cards / Containers

- **Corner Style:** `rounded-xl` (12px) estándar; `rounded-2xl` (16px) en bloques destacados.
- **Background:** blanco (`#ffffff`) sobre lienzo `#f9fafb`.
- **Shadow Strategy:** `shadow-sm` en reposo → `shadow-md` en hover (ver Elevation).
- **Border:** `1px` `#f3f4f6`/`#e5e7eb`. Borde completo, nunca un side-stripe coloreado.
- **Internal Padding:** `20px` (`p-5`) / `24px` (`p-6`).

### Inputs / Fields

- **Style:** `h-9`, `rounded-md` (8px), borde `#e5e7eb`, fondo transparente/blanco, `text-sm`. Placeholder con contraste AA (no gris claro).
- **Focus:** `ring-2 ring-ring/50` (azul de marca `#2563eb`), sin glow.
- **Error / Disabled:** error vía toast descriptivo (sonner) + texto; disabled `opacity-50 cursor-not-allowed`.

### Navigation

- **Panel:** topbar blanca sticky con logo + badge de rol; nav lateral con item activo en `bg-brand-50 text-brand-700`, resto `text-gray-600 hover:bg-gray-100`. En móvil, tab bar inferior.
- **Tenant:** header con `backgroundColor` = `primaryColor` del tenant, logo + nombre.

### Signature Component — EmptyState

Estado vacío reutilizable: contenedor `rounded-2xl` con borde **punteado** `#e5e7eb`, ícono en círculo `bg-brand-50 text-brand-600`, título, descripción y acción opcional. Es la respuesta a "no hay datos", nunca un espacio en blanco.

### Toaster (sonner)

Notificaciones arriba a la derecha, `richColors`, esquinas `rounded-xl`. Éxito/error/info con color semántico; reemplaza los banners inline.

## 6. Do's and Don'ts

### Do:

- **Do** usar blanco `#ffffff` como fondo del cuerpo y navy `#182838` como tinta.
- **Do** reservar el azul para lo accionable (≤ ~15% de la pantalla) y verificar **contraste AA** (cuerpo ≥4.5:1), incluido el placeholder.
- **Do** verificar el contraste contra el `primaryColor`/`secondaryColor` del tenant: el sistema debe verse bien con cualquier color de marca.
- **Do** mantener todo plano en reposo; elevar con `shadow-md` solo en hover/estado.
- **Do** diseñar el booking y la landing del tenant **móvil primero** (los pacientes llegan del celular): toques generosos, texto legible.
- **Do** etiquetar botones con verbo + objeto ("Aprobar pago", no "OK") y respetar `prefers-reduced-motion`.

### Don't:

- **Don't** caer en el **SaaS genérico de IA**: nada de fondos crema, eyebrows en mayúsculas tracked sobre cada sección, grids de cards idénticas, ni **gradientes de texto** (`background-clip: text`).
- **Don't** verse **corporativo frío / de hospital**: azul corporativo aburrido, densidad burocrática, sensación de trámite.
- **Don't** recargar: exceso de color o animaciones que compiten con la tarea.
- **Don't** parecer **software médico anticuado**: tablas grises densas estilo sistema hospitalario de los 2000.
- **Don't** usar `border-left`/`border-right` > 1px como franja de color en cards, listas o alertas. Usa borde completo o tinte de fondo.
- **Don't** poner texto gris claro (`muted-foreground`) como cuerpo sobre tints; baja de AA. Súbelo hacia la tinta.
