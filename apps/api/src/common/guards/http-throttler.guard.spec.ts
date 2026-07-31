import express from 'express';
import type { Server } from 'http';

/**
 * El rate limit cuenta por IP. Detrás del reverse proxy (Traefik/Dokploy) todas
 * las requests llegan con la IP del proxy, así que sin 'trust proxy' el cupo se
 * vuelve único para toda la plataforma: el staff de una clínica, los pacientes
 * de la landing y el bot compartían los mismos req/min y saltaba el 429 con uso
 * normal. Este spec fija que req.ip sea la IP real del cliente.
 */

/** Levanta la app en un puerto efímero y devuelve el ip visto por Express. */
async function ipSeenBy(trustProxy: boolean, forwardedFor: string): Promise<string> {
  const app = express();
  if (trustProxy) app.set('trust proxy', 1);
  app.get('/ip', (req, res) => {
    res.json({ ip: req.ip });
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  try {
    const { port } = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${port}/ip`, {
      headers: { 'X-Forwarded-For': forwardedFor },
    });
    const body = (await res.json()) as { ip: string };
    return body.ip;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("Express 'trust proxy' — el rate limit debe contar por cliente real", () => {
  it('sin trust proxy: dos clientes distintos comparten la clave del rate limit', async () => {
    const a = await ipSeenBy(false, '181.10.10.1');
    const b = await ipSeenBy(false, '181.20.20.2');
    // Ambos caen en la IP de la conexión (el proxy): ese era el bug.
    expect(a).toBe(b);
  });

  it('con trust proxy: cada cliente conserva su IP y su propio cupo', async () => {
    const a = await ipSeenBy(true, '181.10.10.1');
    const b = await ipSeenBy(true, '181.20.20.2');
    expect(a).toBe('181.10.10.1');
    expect(b).toBe('181.20.20.2');
    expect(a).not.toBe(b);
  });
});
