# Product

## Register

product

## Users

Tres públicos, una sola identidad:

- **Staff de clínica** (admin, doctor, recepción) — usan el **panel** a diario para gestionar citas, pacientes, historia clínica (EHR), horarios, servicios, suscripción y WhatsApp. Trabajan desde escritorio, a menudo con prisa entre pacientes; no son usuarios técnicos.
- **Pacientes** — reservan su cita por la **web pública del tenant** (`/[slug]`, `/[slug]/booking`) o por el **bot de WhatsApp**. Casi siempre desde el **celular**, sin instrucciones; muchos mayores o poco técnicos. Pagan en efectivo (en clínica) o por QR bancario (comprobante por WhatsApp).
- **Compradores SaaS** — dueños/administradores de clínicas en Bolivia evaluando SimpleCite en la **landing de marketing** (`/`).

Contexto de mercado: clínicas, consultorios y hospitales pequeños/medianos de Bolivia. Pagos en Bs, canal principal WhatsApp.

## Product Purpose

SimpleCite digitaliza la operación de una clínica sin agregar complejidad: agenda online (web + WhatsApp), mini-EHR, cobros híbridos (efectivo / QR bancario con comprobante por WhatsApp) y recordatorios automáticos. Es un SaaS multi-tenant donde cada clínica tiene su propia página pública de reservas con su marca (logo, paleta, textos, redes).

El éxito se ve cuando: una recepcionista agenda y cobra sin fricción, un paciente reserva desde el celular en menos de un minuto y confía en el proceso, y la clínica llena su agenda sola y reduce inasistencias.

## Brand Personality

**Moderno, confiable, cálido.** Voz directa y humana en español boliviano, sin jerga técnica ni de marketing. Una herramienta actual y rápida que se siente seria con los datos médicos pero cercana, no hospitalaria ni burocrática. La confianza se gana con claridad, no con solemnidad.

## Anti-references

- **SaaS genérico de IA**: fondos crema, eyebrows en mayúsculas sobre cada sección, grids de cards idénticas, gradientes de texto, métricas-hero decorativas.
- **Corporativo frío / hospital**: azul corporativo aburrido, densidad burocrática, sensación de trámite.
- **Recargado / llamativo**: exceso de color, animaciones por todos lados, ruido visual que compite con la tarea.
- **Software médico anticuado**: tablas grises densas estilo sistema hospitalario de los 2000.

## Design Principles

1. **Confianza por claridad, no por solemnidad.** La seriedad médica se transmite con jerarquía legible, espacios respirados y estados claros; nunca con azul corporativo o densidad. Si algo no se entiende a la primera, falló.
2. **Una identidad, tres densidades.** El panel prioriza eficiencia para el staff (denso, pocos clics); el booking/landing del tenant prioriza confianza del paciente (guiado, espacioso); la marca prioriza convicción. La paleta y la voz son las mismas; cambia el ritmo, no la identidad.
3. **El paciente reserva en el celular.** El camino de reserva (web y WhatsApp) debe ser impecable y rápido en pantallas chicas y para usuarios mayores: toques generosos, texto legible, mínimo a leer.
4. **Cálido, no clínico.** La calidez se carga en tipografía, color de acento y copy humano, no en fondos crema ni en frialdad hospitalaria. Trato local, cercano.
5. **Personalizable sin perder coherencia.** Cada clínica trae su logo, paleta y textos; el sistema debe verse bien con cualquier color de marca y nunca caer en plantilla de IA.

## Accessibility & Inclusion

- **Contraste WCAG AA**: cuerpo ≥4.5:1, texto grande ≥3:1. Evitar gris claro sobre fondos tintados (incluido placeholder). Verificar contraste con cualquier `primaryColor`/`secondaryColor` de tenant.
- **Móvil primero en superficies de paciente**: la landing del tenant y el wizard de booking deben ir perfectos en pantallas chicas (los pacientes llegan desde el celular).
- **Reduced motion**: respetar `prefers-reduced-motion` en toda animación (crossfade o instantáneo como alternativa).
- Toques y tipografías generosos pensando en staff y pacientes no técnicos o mayores.
