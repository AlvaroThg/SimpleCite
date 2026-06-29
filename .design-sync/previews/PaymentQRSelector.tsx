import * as React from 'react';
import { PaymentQRSelector } from 'web';

// QR de marcador para el preview (patrón estable por banco, no escaneable).
// En producción el qrUrl es la imagen real subida por la clínica (R2).
function qrSvg(seed: string) {
  const N = 25;
  const finder = (x: number, y: number) => {
    const box = (bx: number, by: number) =>
      x >= bx &&
      x < bx + 7 &&
      y >= by &&
      y < by + 7 &&
      (x === bx ||
        x === bx + 6 ||
        y === by ||
        y === by + 6 ||
        (x >= bx + 2 && x <= bx + 4 && y >= by + 2 && y <= by + 4));
    return box(0, 0) || box(N - 7, 0) || box(0, N - 7);
  };
  let h = 2166136261;
  for (const c of seed) h = (h ^ c.charCodeAt(0)) * 16777619;
  let cells = '';
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const inFinderZone = (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
      let on: boolean;
      if (inFinderZone) on = finder(x, y);
      else {
        h = (h * 1103515245 + 12345) >>> 0;
        on = ((h >> 16) & 1) === 1;
      }
      if (on) cells += `<rect x='${x}' y='${y}' width='1' height='1'/>`;
    }
  }
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220' viewBox='0 0 ${N} ${N}' shape-rendering='crispEdges'>` +
    `<rect width='${N}' height='${N}' fill='#ffffff'/><g fill='#0c3f8f'>${cells}</g></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export const DosBancos = () => (
  <div style={{ width: 360 }}>
    <PaymentQRSelector
      banks={[
        {
          id: 'union',
          name: 'Banco Unión',
          qrUrl: qrSvg('banco-union'),
          accountInfo: 'Clínica San Rafael · Cta. 1-0023456',
        },
        {
          id: 'mercantil',
          name: 'Mercantil',
          qrUrl: qrSvg('mercantil-santa-cruz'),
          accountInfo: 'Clínica San Rafael · Cta. 6-0048219',
        },
      ]}
    />
  </div>
);

export const UnBanco = () => (
  <div style={{ width: 360 }}>
    <PaymentQRSelector
      banks={[{ id: 'bnb', name: 'BNB', qrUrl: qrSvg('bnb-pago'), accountInfo: 'Cta. 3-0091122' }]}
    />
  </div>
);
