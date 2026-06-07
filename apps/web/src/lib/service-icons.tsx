import {
  Stethoscope,
  HeartPulse,
  Activity,
  Baby,
  Bone,
  Eye,
  Pill,
  Brain,
  Syringe,
  Microscope,
  Ear,
  Scan,
  type LucideIcon,
} from 'lucide-react';

/**
 * Mapa de íconos de servicios (mirror del enum ServiceIcon en @simplecite/shared).
 * Compartido entre el selector del panel y la landing pública.
 */
export const SERVICE_ICONS: Record<string, LucideIcon> = {
  stethoscope: Stethoscope,
  heart: HeartPulse,
  activity: Activity,
  baby: Baby,
  bone: Bone,
  eye: Eye,
  pill: Pill,
  brain: Brain,
  syringe: Syringe,
  microscope: Microscope,
  ear: Ear,
  scan: Scan,
};

export const SERVICE_ICON_KEYS = Object.keys(SERVICE_ICONS);

const LABELS: Record<string, string> = {
  stethoscope: 'Consulta',
  heart: 'Cardiología',
  activity: 'Signos / monitoreo',
  baby: 'Pediatría',
  bone: 'Traumatología',
  eye: 'Oftalmología',
  pill: 'Farmacia / tratamiento',
  brain: 'Neurología',
  syringe: 'Inyectables / vacunas',
  microscope: 'Laboratorio',
  ear: 'Otorrino',
  scan: 'Imagenología',
};

export const SERVICE_ICON_OPTIONS = SERVICE_ICON_KEYS.map((key) => ({
  key,
  label: LABELS[key] ?? key,
  Icon: SERVICE_ICONS[key],
}));

/**
 * Devuelve el componente de ícono para una clave. Si no hay clave válida,
 * rota por `fallbackIndex` sobre el set para que cada tarjeta tenga variedad.
 */
export function getServiceIcon(key?: string | null, fallbackIndex = 0): LucideIcon {
  if (key && SERVICE_ICONS[key]) return SERVICE_ICONS[key];
  return SERVICE_ICONS[SERVICE_ICON_KEYS[fallbackIndex % SERVICE_ICON_KEYS.length]];
}
