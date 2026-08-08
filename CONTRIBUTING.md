# Contribuir a SimpleCite

SimpleCite maneja datos clínicos reales de pacientes de clínicas que pagan por
el servicio. Las reglas de abajo existen por eso, no por formalismo.

## Antes de escribir código

1. Leé [docs/architecture.md](docs/architecture.md) — sobre todo
   ["Doctor scoping"](docs/architecture.md#doctor-scoping).
2. Si tocás UI, leé [PRODUCT.md](PRODUCT.md) y [DESIGN.md](DESIGN.md). Son la
   fuente de verdad de diseño.
3. Buscá el patrón que ya existe en el repo antes de inventar uno. Si un módulo
   hace algo distinto a los demás, casi siempre es un olvido, no una decisión.

## Ramas

| Rama          | Qué es                                                   |
| ------------- | -------------------------------------------------------- |
| `main`        | Lo que está en producción. Protegida: solo entra por PR. |
| `develop`     | Integración del bot de reservas por WhatsApp.            |
| `feat/<algo>` | Una funcionalidad. Sale de `main`, vuelve a `main`.      |
| `fix/<algo>`  | Una corrección.                                          |

Ramas cortas. Si una lleva más de una semana abierta, probablemente había que
partirla en dos.

## Commits

Conventional Commits — lo valida `commitlint` en el hook de `commit-msg`:

```
<tipo>(<alcance>): <qué cambia, en minúscula y en presente>
```

Tipos: `feat` · `fix` · `refactor` · `docs` · `test` · `chore` · `perf` · `style`.
Alcance: el módulo o el área (`citas`, `panel`, `booking`, `seguridad`, `deps`).

```
feat(citas): tratamientos recurrentes con omisión de fechas ocupadas
fix(panel): el ojo de contraseña también al crear usuarios
test(seguridad): regresión del aislamiento entre especialistas
```

El asunto dice **qué cambia para quien usa el producto**, no qué archivo tocaste.
El cuerpo (opcional) explica el **por qué** — eso es lo que no se deduce del diff.

## Antes de abrir el PR

Corré lo mismo que corre CI:

```bash
pnpm lint
pnpm format:check
pnpm build
pnpm --filter api test
```

Y revisá:

- [ ] **Toda query nueva filtra por `tenantId`.** RLS está dormido: si te lo
      olvidás, una clínica ve datos de otra y nada te avisa.
- [ ] **Si el recurso tiene `doctorId`, el _service_ valida el `requester`.**
      Que el controller filtre no alcanza — ver
      [doctor-scoping.spec.ts](apps/api/src/modules/appointments/application/services/doctor-scoping.spec.ts).
- [ ] Todo `@Body()` y `@Query()` pasa por `ZodValidationPipe` con un schema de
      `packages/shared`. Nunca `class-validator`.
- [ ] Nada de contenido clínico, contraseñas, CI ni teléfonos en los logs
      (ver el `redact` de pino en `app.module.ts`).
- [ ] Si algo tiene que coincidir entre API y web, vive en `packages/shared`.
      Duplicarlo es cómo se desincronizan.
- [ ] Endpoint nuevo del panel: `@Roles(...)` explícito. Sin él, **cualquier**
      usuario autenticado entra.
- [ ] Endpoint nuevo público: `@Public()` + `@Throttle()` propio + lista blanca
      de campos en la respuesta.
- [ ] Migración de Prisma incluida y con nombre descriptivo si cambiaste el schema.

## Tests

No hace falta cubrir todo, pero **lo que se rompe en silencio sí**:

- Control de acceso (rol, tenant, doctor scoping) → siempre.
- Máquinas de estado y reglas de dinero → siempre.
- CRUD directo → si es trivial, no.

Un test bueno falla por una razón y su nombre la dice. Escribí el nombre en
español, describiendo la regla de negocio, no el método:

```ts
it('un DOCTOR no puede reprogramar citas de otro doctor', ...)   // ✅
it('reschedule throws when doctorId mismatch', ...)              // ❌
```

## Estilo

Prettier y ESLint deciden el formato — no lo discutas a mano, corré `pnpm format`.
Sobre lo que las herramientas no ven:

- **Comentarios**: explican el **por qué**, no el qué. Un comentario que
  parafrasea la línea de abajo sobra; uno que dice "esto quedó así porque el
  default de Express rechazaba fotos de celular con 413" vale oro. Es el estilo
  del repo — seguilo.
- **Español** en comentarios, nombres de tests y mensajes al usuario. Los
  identificadores de código en inglés, como ya están.
- Nombres que digan el concepto de negocio (`insuranceNameSnapshot`,
  `refundResolution`), no el tipo de dato.

## Lo que no se hace

- Commitear `.env*` con valores reales (están en `.gitignore`; que siga así).
- Saltarse los hooks (`--no-verify`). Si un hook falla, se arregla la causa.
- Subir dependencias mayores sin correr `pnpm audit --prod` y el build de las
  dos apps.
- Loguear o devolver el hash de una contraseña, un token o un OTP.
