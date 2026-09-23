/**
 * Lector de RSS mínimo.
 *
 * Se resuelve con expresiones regulares en vez de añadir un parser de XML: solo
 * hacen falta cuatro campos de cada `<item>`, los feeds de prensa deportiva son
 * previsibles y el proyecto sigue sin dependencias de runtime. Si algún día hay
 * que leer Atom o namespaces raros, tocará un parser de verdad.
 *
 * Como todo lo que sale a la red en este proyecto: **nunca lanza**.
 */

export interface ItemFeed {
  titulo: string;
  descripcion: string;
  url: string;
  fecha: string;
  medio: string;
}

/** Cuánto se cachea un feed. Los titulares no cambian cada segundo. */
const REVALIDAR_S = 900;
const TIEMPO_LIMITE_MS = 7000;

const ENTIDADES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

function limpiar(texto: string): string {
  return texto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;|&#\d+;/gi, (e) => ENTIDADES[e.toLowerCase()] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

function campo(item: string, etiqueta: string): string {
  const m = item.match(new RegExp(`<${etiqueta}[^>]*>([\\s\\S]*?)</${etiqueta}>`, "i"));
  return m ? limpiar(m[1]) : "";
}

/** Descarga y trocea un feed. Devuelve lista vacía ante cualquier problema. */
export async function leerFeed(url: string, medio: string): Promise<ItemFeed[]> {
  try {
    const respuesta = await fetch(url, {
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
      next: { revalidate: REVALIDAR_S },
      headers: {
        // Algunos portales rechazan peticiones sin agente identificable.
        "User-Agent": "CasaDeApuesta/1.0 (lector de feeds)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });

    if (!respuesta.ok) return [];

    const xml = await respuesta.text();
    const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];

    return items
      .map((item) => ({
        titulo: campo(item, "title"),
        descripcion: campo(item, "description"),
        url: campo(item, "link"),
        fecha: campo(item, "pubDate"),
        medio,
      }))
      .filter((i) => i.titulo.length > 0);
  } catch {
    return [];
  }
}
