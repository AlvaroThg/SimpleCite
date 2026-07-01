'use client';

import * as React from 'react';
import { PhoneInput, defaultCountries, parseCountry } from 'react-international-phone';
import 'react-international-phone/style.css';

/**
 * Campo de teléfono con selector de país (bandera + código), búsqueda y salida
 * normalizada a E.164 SIN "+" (ej. 59170000000), que es el formato que espera el
 * backend (`normalizePhone`). El valor del estado son solo dígitos; internamente
 * se le antepone "+" para la librería. Por defecto Bolivia.
 *
 * Se tematiza con las CSS vars de react-international-phone mapeadas a nuestros
 * tokens, así respeta claro/oscuro automáticamente.
 */

// Países comunes primero (LATAM), luego el resto en el orden de la librería.
const PREFERRED = ['bo', 'ar', 'cl', 'br', 'pe', 'co'];
const orderedCountries = [
  ...PREFERRED.map((iso) => defaultCountries.find((c) => parseCountry(c).iso2 === iso)).filter(
    (c): c is (typeof defaultCountries)[number] => Boolean(c),
  ),
  ...defaultCountries.filter((c) => !PREFERRED.includes(parseCountry(c).iso2)),
];

const themeVars = {
  '--react-international-phone-height': '44px',
  '--react-international-phone-border-radius': '12px',
  '--react-international-phone-font-size': '14px',
  '--react-international-phone-border-color': 'var(--border-token)',
  '--react-international-phone-background-color': 'var(--surface)',
  '--react-international-phone-text-color': 'var(--text-primary)',
  '--react-international-phone-country-selector-background-color': 'var(--surface)',
  '--react-international-phone-country-selector-background-color-hover': 'var(--muted)',
  '--react-international-phone-dropdown-item-background-color': 'var(--surface)',
  '--react-international-phone-dropdown-item-text-color': 'var(--text-primary)',
  '--react-international-phone-selected-dropdown-item-background-color': 'var(--muted)',
  '--react-international-phone-dropdown-shadow': 'var(--shadow-card)',
} as React.CSSProperties;

export function PhoneField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (digits: string) => void;
  disabled?: boolean;
}) {
  return (
    <div style={themeVars} className="w-full">
      <PhoneInput
        defaultCountry="bo"
        value={value ? `+${value}` : ''}
        onChange={(phone) => onChange(phone.replace(/\D/g, ''))}
        countries={orderedCountries}
        disabled={disabled}
        inputClassName="!w-full"
        placeholder="70000000"
      />
    </div>
  );
}
