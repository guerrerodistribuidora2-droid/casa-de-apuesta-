/**
 * Servicio de noticias.
 *
 * Lee feeds públicos, clasifica los titulares y devuelve los contextos que
 * alimentan al motor, junto con un diagnóstico de lo que pasó. El diagnóstico
 * no es decorativo: con un filtro por palabras clave sobre prensa generalista lo
 * normal es descartar el 90% de los titulares, y sin verlo es imposible saber si
 * el módulo está funcionando o está roto.
 *
 * Como todo lo que sale a la red aquí: **nunca lanza**.
 */

import type { Contexto, DisciplinaId, Partido } from "@/data/mockData";
import { clasificar } from "./clasificador";
import { leerFeed, type ItemFeed } from "./rss";

export interface Feed {
  medio: string;
  url: string;
  /** Disciplinas que cubre. Vacío significa que cubre todas. */
  disciplinas: DisciplinaId[];
}

/**
 * Feeds públicos. Todos son RSS abiertos y sin clave.
 * Se mezclan medios en inglés y en español a propósito: los diccionarios del
 * clasificador son bilingües y así se cubren ligas de ambos ámbitos.
 */
export const FEEDS: Feed[] = [
  {
    medio: "BBC Sport",
    url: "https://feeds.bbci.co.uk/sport/football/rss.xml",
    disciplinas: ["premier", "champions"],
  },
  {
    medio: "ESPN Soccer",
    url: "https://www.espn.com/espn/rss/soccer/news",
    disciplinas: ["premier", "champions", "liga-mx"],
  },
  {
    medio: "ESPN NBA",
    url: "https://www.espn.com/espn/rss/nba/news",
    disciplinas: ["nba"],
  },
  {
    medio: "Marca",
    url: "https://e00-marca.uecdn.es/rss/futbol/primera-division.xml",
    disciplinas: ["champions", "liga-mx"],
  },
];

export interface DiagnosticoNoticias {
  /** Feeds que devolvieron algo. */
  feedsLeidos: number;
  feedsTotales: number;
  titularesLeidos: number;
  /** Titulares que mencionaban algo capaz de mover una línea. */
  titularesRelevantes: number;
  /** De esos, los que además se pudieron atribuir a un encuentro del tablero. */
  contextosGenerados: number;
  /** Medios que respondieron, para ver de un vistazo si uno se cayó. */
  medios: { medio: string; titulares: number }[];
}

export interface ResultadoNoticias {
  /** Contextos nuevos, agrupados por id de partido. */
  porPartido: Map<string, Contexto[]>;
  diagnostico: DiagnosticoNoticias;
}

const VACIO: DiagnosticoNoticias = {
  feedsLeidos: 0,
  feedsTotales: 0,
  titularesLeidos: 0,
  titularesRelevantes: 0,
  contextosGenerados: 0,
  medios: [],
};

/** Cuántos contextos automáticos se aceptan por partido. */
const MAX_POR_PARTIDO = 2;

export async function obtenerNoticias(partidos: Partido[]): Promise<ResultadoNoticias> {
  if (partidos.length === 0) {
    return { porPartido: new Map(), diagnostico: VACIO };
  }

  // Solo se consultan los feeds de disciplinas presentes en el tablero.
  const presentes = new Set(partidos.map((p) => p.disciplina));
  const utiles = FEEDS.filter(
    (f) => f.disciplinas.length === 0 || f.disciplinas.some((d) => presentes.has(d)),
  );

  const lotes = await Promise.all(
    utiles.map(async (feed) => ({
      feed,
      items: await leerFeed(feed.url, feed.medio),
    })),
  );

  const porPartido = new Map<string, Contexto[]>();
  const medios: { medio: string; titulares: number }[] = [];
  let titularesLeidos = 0;
  let titularesRelevantes = 0;
  let feedsLeidos = 0;
  const vistos = new Set<string>();

  for (const { feed, items } of lotes) {
    medios.push({ medio: feed.medio, titulares: items.length });
    if (items.length > 0) feedsLeidos++;
    titularesLeidos += items.length;

    // Solo se ofrecen al clasificador los partidos de las disciplinas del feed.
    const candidatos =
      feed.disciplinas.length === 0
        ? partidos
        : partidos.filter((p) => feed.disciplinas.includes(p.disciplina));

    for (const item of items) {
      const clasificado = clasificar(item as ItemFeed, candidatos);
      if (!clasificado) continue;
      titularesRelevantes++;

      // El mismo titular puede aparecer en varios feeds: se cuenta una vez.
      const huella = `${clasificado.partidoId}|${clasificado.contexto.nota}`;
      if (vistos.has(huella)) continue;
      vistos.add(huella);

      const lista = porPartido.get(clasificado.partidoId) ?? [];
      if (lista.length >= MAX_POR_PARTIDO) continue;
      lista.push(clasificado.contexto);
      porPartido.set(clasificado.partidoId, lista);
    }
  }

  let contextosGenerados = 0;
  for (const lista of porPartido.values()) contextosGenerados += lista.length;

  return {
    porPartido,
    diagnostico: {
      feedsLeidos,
      feedsTotales: utiles.length,
      titularesLeidos,
      titularesRelevantes,
      contextosGenerados,
      medios,
    },
  };
}

/** Pega los contextos detectados a sus partidos, detrás de los medidos a mano. */
export function fusionar(
  partidos: Partido[],
  porPartido: Map<string, Contexto[]>,
): Partido[] {
  if (porPartido.size === 0) return partidos;

  return partidos.map((partido) => {
    const nuevos = porPartido.get(partido.id);
    if (!nuevos || nuevos.length === 0) return partido;

    // Los medidos van primero: son los que de verdad sostienen el puntaje.
    return { ...partido, contexto: [...(partido.contexto ?? []), ...nuevos] };
  });
}
