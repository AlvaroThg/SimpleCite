import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

/**
 * Revalidación on-demand de la landing/booking de un tenant.
 *
 * El panel la llama al guardar branding para que el cambio se vea al instante
 * en vez de esperar la ventana de ISR (60s). Regenerar una página es barato,
 * así que no requiere auth: lo peor que puede hacer un abuso es forzar
 * regeneraciones (equivalente a expirar el caché).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { slug?: string };
  const slug = body.slug;
  if (!slug || !/^[a-z0-9-]{3,50}$/.test(slug)) {
    return NextResponse.json({ ok: false, error: 'slug inválido' }, { status: 400 });
  }
  revalidatePath(`/${slug}`, 'layout'); // landing + booking + header/footer
  return NextResponse.json({ ok: true });
}
