/**
 * Color estable por especialista para la vista calendario del ADMIN/STAFF:
 * el mismo doctor siempre recibe el mismo color (hash de su id sobre una
 * paleta fija), sin configuración. El texto del bloque se calcula AA con
 * `readableOn`, así que la paleta solo debe ser saturada y distinguible.
 *
 * (El rol DOCTOR no usa esto: ve SUS citas con los colores de sus servicios.)
 */
const DOCTOR_PALETTE = [
  '#2563eb', // azul
  '#7c3aed', // violeta
  '#db2777', // rosa
  '#0d9488', // teal
  '#ea580c', // naranja
  '#0891b2', // cian
  '#4f46e5', // índigo
  '#c026d3', // magenta
  '#65a30d', // lima oscuro
  '#b45309', // ámbar oscuro
];

export function doctorColor(doctorId: string): string {
  let hash = 0;
  for (let i = 0; i < doctorId.length; i++) {
    hash = (hash * 31 + doctorId.charCodeAt(i)) >>> 0;
  }
  return DOCTOR_PALETTE[hash % DOCTOR_PALETTE.length];
}
