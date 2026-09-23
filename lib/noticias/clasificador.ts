/**
 * Convierte un titular en un factor contextual.
 *
 * El proceso tiene tres filtros encadenados, y un titular tiene que pasarlos los
 * tres para producir algo:
 *
 *   1. **¿Habla de algo que mueva una línea?** Bajas, sanciones, alineaciones,
 *      árbitros o carga de calendario. La inmensa mayoría de titulares de un
 *      feed deportivo son fichajes, rankings o crónicas: se descartan.
 *   2. **¿De qué equipo habla?** Tiene que coincidir con un equipo de algún
 *      encuentro del tablero.
 *   3. **¿Con qué magnitud?** Se infiere del rol del jugador y de lo rotundo
 *      que sea el titular ("confirmada" no es lo mismo que "duda").
 *
 * Los diccionarios son bilingües porque los feeds lo son.
 *
 * **Lo que sale de aquí es una inferencia, no una medición.** Por eso cada
 * contexto se marca con `origen: "noticia"` y `lib/factores.ts` le recorta la
 * solidez. Un titular mal leído no debe pesar como un perfil arbitral medido.
 */

import type {
  Contexto,
  DisciplinaId,
  FuenteNoticia,
  Lado,
  Partido,
  RolClave,
} from "@/data/mockData";
import type { ItemFeed } from "./rss";

/* Diccionarios --------------------------------------------------------------- */

type Categoria = "lesiones" | "sancion" | "rotacion" | "arbitro" | "calendario";

const DISPARADORES: Record<Categoria, string[]> = {
  lesiones: [
    "lesion", "lesionado", "lesionada", "baja", "bajas", "se pierde", "molestias",
    "duda", "rotura", "esguince", "injury", "injured", "ruled out", "sidelined",
    "out for", "doubt", "strain", "sprain", "hamstring", "knock",
  ],
  sancion: [
    "sancion", "sancionado", "suspendido", "suspension", "expulsado", "expulsion",
    "ciclo de amarillas", "roja directa", "suspended", "banned", "red card",
  ],
  rotacion: [
    "alineacion", "once", "rotacion", "rotara", "rotar", "descansa", "descansara",
    "suplente", "lineup", "line-up", "rotation", "rested", "will rest", "benched",
    "load management",
  ],
  arbitro: [
    "arbitro", "colegiado", "designacion arbitral", "referee", "officiating",
    "var ", "assistant referee",
  ],
  calendario: [
    "tres partidos en", "sin descanso", "congestion", "calendario apretado",
    "back-to-back", "back to back", "fixture congestion", "short rest",
    "third game in", "busy schedule",
  ],
};

/** Rol del protagonista. Decide el signo del efecto en `lib/factores.ts`. */
const ROLES: { rol: RolClave; claves: string[] }[] = [
  { rol: "portero", claves: ["portero", "arquero", "guardameta", "goalkeeper", "keeper"] },
  {
    rol: "defensa",
    claves: ["defensa", "central", "zaguero", "lateral", "defender", "centre-back", "center-back", "full-back"],
  },
  {
    rol: "creador",
    claves: ["creador", "mediocampista", "centrocampista", "mediapunta", "playmaker", "midfielder", "midfield"],
  },
  {
    rol: "finalizador",
    claves: ["delantero", "goleador", "ariete", "striker", "forward", "winger", "extremo"],
  },
  { rol: "base", claves: ["base", "armador", "point guard", "guard"] },
  { rol: "reboteador", claves: ["pivot", "reboteador", "center", "big man", "rebounder"] },
  { rol: "anotador", claves: ["anotador", "escolta", "scorer", "scoring leader", "all-star"] },
];

/** Cuán rotundo es el titular. Multiplica la magnitud del efecto. */
const CERTEZA: { certeza: number; claves: string[] }[] = [
  { certeza: 1, claves: ["confirmad", "definitiv", "sera baja", "ruled out", "confirmed", "will miss", "out for the season"] },
  { certeza: 0.55, claves: ["duda", "podria", "apunta", "evaluando", "doubt", "questionable", "could miss", "expected to"] },
];

/* Normalización y equipos ---------------------------------------------------- */

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Alias de equipos que la prensa escribe distinto a nuestros datos. */
const ALIAS: Record<string, string[]> = {
  "Manchester United": ["man utd", "man united"],
  "Tottenham": ["spurs", "tottenham hotspur"],
  "Bayern München": ["bayern munich", "bayern"],
  "Borussia Dortmund": ["dortmund", "bvb"],
  "Paris Saint-Germain": ["psg", "paris sg"],
  "Newcastle United": ["newcastle"],
  "Aston Villa": ["villa"],
  "Real Madrid": ["madrid"],
  "Minnesota Timberwolves": ["timberwolves", "wolves"],
  "Denver Nuggets": ["nuggets"],
  "Boston Celtics": ["celtics"],
  "Miami Heat": ["heat"],
  "Tigres UANL": ["tigres"],
  "Pumas UNAM": ["pumas"],
  "Guadalajara": ["chivas"],
  "Cruz Azul": ["cruz azul"],
};

/** Palabras demasiado genéricas para identificar un equipo por sí solas. */
const AMBIGUAS = new Set(["madrid", "wolves", "city", "united", "villa", "heat"]);

interface EquipoDetectado {
  partido: Partido;
  lado: Lado;
  termino: string;
}

/**
 * Busca a qué equipo del tablero se refiere el texto.
 *
 * Se exige coincidencia de palabra completa: sin eso, "Villa" dispararía con
 * "village" y "Heat" con "heated". Los términos ambiguos solo cuentan si vienen
 * del nombre completo, no de un alias corto.
 */
export function detectarEquipo(texto: string, partidos: Partido[]): EquipoDetectado | null {
  const normal = ` ${normalizar(texto)} `;

  let mejor: EquipoDetectado | null = null;
  let mejorLargo = 0;

  for (const partido of partidos) {
    for (const lado of ["local", "visitante"] as const) {
      const nombre = partido[lado].nombre;
      const candidatos = [nombre, ...(ALIAS[nombre] ?? [])];

      for (const candidato of candidatos) {
        const termino = normalizar(candidato);
        if (termino.length < 4) continue;
        if (AMBIGUAS.has(termino) && termino !== normalizar(nombre)) continue;
        if (!normal.includes(` ${termino} `)) continue;

        // Gana el término más largo: "manchester united" sobre "united".
        if (termino.length > mejorLargo) {
          mejorLargo = termino.length;
          mejor = { partido, lado, termino: candidato };
        }
      }
    }
  }
  return mejor;
}

/* Clasificación -------------------------------------------------------------- */

function coincidencias(texto: string, claves: string[]): string[] {
  const normal = normalizar(texto);
  return claves.filter((c) => normal.includes(normalizar(c)));
}

function categoriaDe(texto: string): { categoria: Categoria; palabras: string[] } | null {
  for (const categoria of Object.keys(DISPARADORES) as Categoria[]) {
    const palabras = coincidencias(texto, DISPARADORES[categoria]);
    if (palabras.length > 0) return { categoria, palabras };
  }
  return null;
}

function rolDe(texto: string, disciplina: DisciplinaId): RolClave {
  const normal = normalizar(texto);
  for (const { rol, claves } of ROLES) {
    if (claves.some((c) => normal.includes(normalizar(c)))) return rol;
  }
  // Sin pista de puesto, se asume el rol más común de cada deporte.
  return disciplina === "nba" ? "anotador" : "creador";
}

function certezaDe(texto: string): number {
  const normal = normalizar(texto);
  for (const { certeza, claves } of CERTEZA) {
    if (claves.some((c) => normal.includes(normalizar(c)))) return certeza;
  }
  return 0.75; // Afirmación neutra: ni confirmada ni en duda.
}

export interface Clasificacion {
  partidoId: string;
  contexto: Contexto;
}

/**
 * Intenta convertir un titular en un contexto. Devuelve null cuando el titular
 * no habla de nada que mueva una línea o no se puede atribuir a un equipo.
 */
export function clasificar(item: ItemFeed, partidos: Partido[]): Clasificacion | null {
  const texto = `${item.titulo}. ${item.descripcion}`;

  const hallazgo = categoriaDe(texto);
  if (!hallazgo) return null;

  const equipo = detectarEquipo(texto, partidos);
  if (!equipo) return null;

  const fuente: FuenteNoticia = {
    titular: item.titulo,
    medio: item.medio,
    url: item.url,
    fecha: item.fecha,
    coincidencias: hallazgo.palabras,
  };

  const nota = `${item.titulo} (${item.medio})`;
  const certeza = certezaDe(texto);
  const base = { nota, origen: "noticia" as const, fuente };

  switch (hallazgo.categoria) {
    case "lesiones":
    case "sancion": {
      const rol = rolDe(texto, equipo.partido.disciplina);
      return {
        partidoId: equipo.partido.id,
        contexto: {
          ...base,
          tipo: "lesiones",
          lado: equipo.lado,
          baja: {
            rol,
            // Sin dato de producción real, la certeza del titular es lo único
            // que tenemos para graduar la magnitud. Techo deliberadamente bajo.
            cuotaProduccion: Math.min(0.2 + certeza * 0.45, 0.65),
            titular: true,
          },
        },
      };
    }

    case "rotacion":
      return {
        partidoId: equipo.partido.id,
        contexto: {
          ...base,
          tipo: "plantel",
          lado: equipo.lado,
          rotacion: {
            titularesQueDescansan: certeza >= 0.75 ? 2 : 1,
            motivo: "Detectado en prensa",
          },
        },
      };

    case "calendario":
      return {
        partidoId: equipo.partido.id,
        contexto: {
          ...base,
          tipo: "calendario",
          lado: equipo.lado,
          carga: {
            diasDescanso: 2,
            partidosEn14Dias: 6,
            backToBack: normalizar(texto).includes("back to back"),
          },
        },
      };

    case "arbitro":
      // Un titular no trae las medias del colegiado. Se guarda como apunte
      // informativo: aparece en la ficha pero no mueve ninguna cifra.
      return {
        partidoId: equipo.partido.id,
        contexto: { ...base, tipo: "nota" },
      };
  }
}
