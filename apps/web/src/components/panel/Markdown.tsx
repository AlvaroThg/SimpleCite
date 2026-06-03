'use client';

/**
 * Renderer Markdown minimalista y seguro (sin dependencias).
 *
 * Escapa HTML primero (anti-XSS — aunque el autor es staff de confianza),
 * luego aplica un subconjunto: headings (#, ##, ###), **negrita**, *itálica*,
 * `código`, listas (-, *), y saltos de línea.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded text-sm">$1</code>');
}

export function markdownToHtml(md: string): string {
  const lines = escapeHtml(md).split('\n');
  const out: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('### ')) {
      closeList();
      out.push(`<h3 class="font-semibold text-gray-900 mt-2">${renderInline(t.slice(4))}</h3>`);
    } else if (t.startsWith('## ')) {
      closeList();
      out.push(`<h2 class="font-bold text-gray-900 mt-2">${renderInline(t.slice(3))}</h2>`);
    } else if (t.startsWith('# ')) {
      closeList();
      out.push(`<h1 class="font-bold text-lg text-gray-900 mt-2">${renderInline(t.slice(2))}</h1>`);
    } else if (t.startsWith('- ') || t.startsWith('* ')) {
      if (!inList) {
        out.push('<ul class="list-disc pl-5 space-y-0.5">');
        inList = true;
      }
      out.push(`<li>${renderInline(t.slice(2))}</li>`);
    } else if (t === '') {
      closeList();
    } else {
      closeList();
      out.push(`<p>${renderInline(t)}</p>`);
    }
  }
  closeList();
  return out.join('');
}

export function Markdown({ content }: { content: string }) {
  return (
    <div
      className="text-sm text-gray-700 leading-relaxed space-y-1 [&_p]:my-0"
      dangerouslySetInnerHTML={{ __html: markdownToHtml(content) }}
    />
  );
}
