import { normalizePhone, isValidE164, normalizeCi } from './phone';

describe('normalizePhone', () => {
  it('elimina espacios, guiones, paréntesis y el +', () => {
    expect(normalizePhone('+591 700-00000')).toBe('59170000000');
    expect(normalizePhone('(591) 7000 0000')).toBe('59170000000');
  });

  it('antepone código Bolivia a números locales de 8 dígitos', () => {
    expect(normalizePhone('70000000')).toBe('59170000000');
  });

  it('quita el prefijo internacional 00', () => {
    expect(normalizePhone('0059170000000')).toBe('59170000000');
  });

  it('deja intacto un E.164 ya normalizado', () => {
    expect(normalizePhone('59170000000')).toBe('59170000000');
  });

  it('respeta otros códigos de país (no fuerza Bolivia si ya hay código)', () => {
    expect(normalizePhone('+1 415 555 1234')).toBe('14155551234');
  });
});

describe('isValidE164', () => {
  it('acepta 8-15 dígitos sin cero inicial', () => {
    expect(isValidE164('59170000000')).toBe(true);
    expect(isValidE164('14155551234')).toBe(true);
  });

  it('rechaza vacío, muy corto, o con cero inicial', () => {
    expect(isValidE164('')).toBe(false);
    expect(isValidE164('123')).toBe(false);
    expect(isValidE164('0591700')).toBe(false);
  });
});

describe('normalizeCi', () => {
  it('normaliza a mayúsculas sin espacios', () => {
    expect(normalizeCi(' 1234567-1a ')).toBe('1234567-1A');
    expect(normalizeCi('12 34 567')).toBe('1234567');
  });
});
