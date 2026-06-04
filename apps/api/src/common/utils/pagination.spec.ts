import { clampLimit, cursorArgs, buildPage, DEFAULT_LIMIT, MAX_LIMIT } from './pagination';

describe('clampLimit', () => {
  it('usa el default cuando no hay limit o es inválido', () => {
    expect(clampLimit()).toBe(DEFAULT_LIMIT);
    expect(clampLimit(0)).toBe(DEFAULT_LIMIT);
    expect(clampLimit(-5)).toBe(DEFAULT_LIMIT);
  });

  it('recorta al máximo permitido', () => {
    expect(clampLimit(9999)).toBe(MAX_LIMIT);
  });

  it('respeta un limit válido', () => {
    expect(clampLimit(10)).toBe(10);
  });
});

describe('cursorArgs', () => {
  it('devuelve objeto vacío sin cursor', () => {
    expect(cursorArgs()).toEqual({});
  });

  it('arma cursor + skip:1 con cursor', () => {
    expect(cursorArgs('abc')).toEqual({ cursor: { id: 'abc' }, skip: 1 });
  });
});

describe('buildPage', () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: `id-${i}` }));

  it('detecta hasMore y recorta a limit cuando hay limit+1 filas', () => {
    const page = buildPage(rows, 4); // pedimos 4, vinieron 5
    expect(page.items).toHaveLength(4);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toBe('id-3');
  });

  it('sin más páginas cuando filas <= limit', () => {
    const page = buildPage(rows.slice(0, 3), 4);
    expect(page.items).toHaveLength(3);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});
