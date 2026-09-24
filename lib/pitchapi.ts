/**
 * Fuente de datos: contexto histórico real de PitchAPI (VAEP, PPDA y mapas de
 * calor) del último enfrentamiento ya jugado entre los dos equipos de un
 * partido del tablero.
 *
 * Dos límites reales de la API, no descuidos de esta integración:
 *
 * - **No hay id compartido con The Odds API.** Cada partido de PitchAPI tiene
 *   su propio id (`m_xxxxx`); aquí se resuelve por nombre de equipo contra el
 *   calendario ya jugado de la liga correspondiente, nunca por id.
 * - **Solo sirve para lo que ya pasó.** `/advanced` y `/heatmaps` dependen de
 *   que el partido ya haya sido calificado por el modelo de PitchAPI
 *   (`ANALYTICS_UNAVAILABLE` si no); un encuentro futuro nunca tiene heatmap
 *   todavía. Por eso esta función busca el ÚLTIMO enfrentamiento YA JUGADO
 *   entre los dos equipos, no el partido de hoy — es contexto histórico, no
 *   una proyección del encuentro actual.
 *
 * Mismo patrón que `apiConnector.ts`: nunca lanza hacia quien la llama, cae a
 * `null` cuando no hay datos (sin clave, sin coincidencia, partido sin
 * calificar) y cachea con `next.revalidate`. La diferencia es que aquí sí hay
 * reintentos en 429/5xx, porque PitchAPI los documenta y los honra con
 * `Retry-After` — pero capados corto: esto corre dentro del render de una
 * página real, no en un script de línea de comandos, y nunca debe sentirse
 * colgada por una API de terceros.
 */

import type { DisciplinaId, Partido } from "@/data/mockData";

/* Tipos públicos ---------------------------------------------------------- */

export interface EstadisticasEquipoHistorico {
  nombre: string;
  acciones: number;
  vaepTotal: number;
  ppda: number;
  /** Cuadrícula densa [x][y], ya expandida desde las celdas dispersas de la API. */
  heatmap: number[][];
}

export interface RendimientoHistorico {
  matchId: string;
  liga: string;
  /** ISO 8601 del partido histórico usado como contexto, no del de hoy. */
  fechaISO: string;
  marcador: { local: number; visitante: number };
  grid: { longitud: number; ancho: number };
  local: EstadisticasEquipoHistorico;
  visitante: EstadisticasEquipoHistorico;
}

export function hayClavePitchAPI(): boolean {
  return Boolean(process.env.PITCHAPI_API_KEY);
}

/**
 * Ligas de PitchAPI que corresponden a cada disciplina del tablero.
 *
 * Los ids están verificados a mano contra `/v1/leagues`, no adivinados: el
 * nombre solo no alcanza para identificar la liga. Solo en esa lista hay
 * CUATRO competiciones llamadas "Premier League" (Inglaterra, Canadá, Egipto
 * y Rusia) — sin el id exacto con su `country_code`, un cruce por nombre
 * habría mezclado, por ejemplo, un partido de la liga rusa con uno inglés.
 */
const LIGA_POR_DISCIPLINA: Partial<Record<DisciplinaId, { id: string; nombre: string }>> = {
  "liga-mx": { id: "l_3v84VE", nombre: "Liga MX" },
  premier: { id: "l_4WFCIZ", nombre: "Premier League" },
  champions: { id: "l_0bfbkO", nombre: "Champions League" },
};

/* Petición ------------------------------------------------------------------ */

const BASE = "https://api.pitchapi.dev/v1";
const TIEMPO_LIMITE_MS = 8000;
/** Cuánta espera como mucho entre reintentos, en segundos. Ver nota arriba. */
const MAX_ESPERA_S = 3;
const MAX_INTENTOS = 2;

/** Calendario ya jugado: no cambia. Se puede cachear mucho más que una cuota en vivo. */
const REVALIDAR_CALENDARIO_S = 21600; // 6 h
/** Un partido ya calificado por PitchAPI no vuelve a cambiar. */
const REVALIDAR_ANALITICA_S = 86400; // 24 h

class ErrorPitchAPI extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

async function pedir<T>(ruta: string, revalidarS: number, intento = 1): Promise<T> {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
    headers: { "X-API-KEY": process.env.PITCHAPI_API_KEY ?? "" },
    next: { revalidate: revalidarS },
  });

  if ((respuesta.status === 429 || respuesta.status >= 500) && intento < MAX_INTENTOS) {
    const cabecera = Number(respuesta.headers.get("Retry-After"));
    const espera = Math.min(Number.isFinite(cabecera) && cabecera > 0 ? cabecera : 1, MAX_ESPERA_S);
    await new Promise((resolver) => setTimeout(resolver, espera * 1000));
    return pedir<T>(ruta, revalidarS, intento + 1);
  }

  const cuerpo = (await respuesta.json().catch(() => null)) as
    | { data?: T; error?: { code?: string; message?: string } }
    | null;

  if (!respuesta.ok) {
    const err = cuerpo?.error ?? {};
    throw new ErrorPitchAPI(err.message ?? `PitchAPI respondió ${respuesta.status}`, err.code);
  }
  return (cuerpo?.data ?? ({} as T)) as T;
}

/* Forma de las respuestas ---------------------------------------------------- */

interface EquipoAPI {
  id: string;
  name: string;
}
interface PartidoListaAPI {
  id: string;
  time_utc: string;
  status: string;
  home_team: EquipoAPI;
  away_team: EquipoAPI;
  score_home: number | null;
  score_away: number | null;
}
interface EquipoAdvancedAPI {
  team: EquipoAPI;
  actions: number;
  possession_value: { vaep_total: number };
  defending: { ppda: number };
}
interface AdvancedAPI {
  teams: EquipoAdvancedAPI[];
}
interface EquipoHeatmapAPI {
  team: EquipoAPI;
  cells: [number, number, number][];
}
interface HeatmapsAPI {
  grid: { length: number; width: number };
  teams: EquipoHeatmapAPI[];
}

/* Resolución por nombre de equipo -------------------------------------------- */

function normalizar(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Igualdad flexible de nombre de club: exacta tras normalizar, o uno
 * contenido en el otro ("Manchester United" / "Man United"). Es una
 * heurística, no una identidad garantizada — el filial de un club puede
 * colarse por contención ("Real Madrid" ⊂ "Real Madrid Castilla"). El riesgo
 * que sí se evita es el más común: si hay más de un candidato razonable, se
 * prefiere no elegir a adivinar (ver `buscarEnfrentamiento`).
 */
function mismoEquipo(a: string, b: string): boolean {
  const na = normalizar(a);
  const nb = normalizar(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

function buscarEnfrentamiento(
  partidos: PartidoListaAPI[],
  nombreLocal: string,
  nombreVisitante: string,
): PartidoListaAPI | null {
  const candidatos = partidos.filter(
    (p) =>
      p.status === "finished" &&
      ((mismoEquipo(p.home_team.name, nombreLocal) && mismoEquipo(p.away_team.name, nombreVisitante)) ||
        (mismoEquipo(p.home_team.name, nombreVisitante) && mismoEquipo(p.away_team.name, nombreLocal))),
  );
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => b.time_utc.localeCompare(a.time_utc));
  return candidatos[0];
}

function temporadaActual(): string {
  const ahora = new Date();
  const anio = ahora.getUTCFullYear();
  // Las temporadas de estas ligas arrancan a mitad de año (agosto/julio).
  const inicio = ahora.getUTCMonth() + 1 >= 7 ? anio : anio - 1;
  return `${inicio}/${inicio + 1}`;
}

function temporadaAnterior(temporada: string): string {
  const inicio = Number(temporada.split("/")[0]);
  return `${inicio - 1}/${inicio}`;
}

async function partidosDeLiga(ligaId: string, temporada: string): Promise<PartidoListaAPI[]> {
  const datos = await pedir<{ matches: PartidoListaAPI[] }>(
    `/leagues/${ligaId}/matches?season=${encodeURIComponent(temporada)}&status=played`,
    REVALIDAR_CALENDARIO_S,
  );
  return datos.matches ?? [];
}

/** Celda ausente = sin actividad, no cero explícito. Se expande a matriz densa. */
function expandirCeldas(celdas: [number, number, number][], longitud: number, ancho: number): number[][] {
  const densa = Array.from({ length: longitud }, () => new Array<number>(ancho).fill(0));
  for (const [x, y, acciones] of celdas) {
    if (densa[x]) densa[x][y] = acciones;
  }
  return densa;
}

async function construirRendimiento(
  partido: PartidoListaAPI,
  liga: string,
): Promise<RendimientoHistorico | null> {
  const [avanzado, heatmaps] = await Promise.allSettled([
    pedir<AdvancedAPI>(`/matches/${partido.id}/advanced`, REVALIDAR_ANALITICA_S),
    pedir<HeatmapsAPI>(`/matches/${partido.id}/heatmaps`, REVALIDAR_ANALITICA_S),
  ]);

  // ANALYTICS_UNAVAILABLE (partido sin calificar por el modelo) es la causa
  // más probable de un fallo aquí. Sin ambas piezas no hay panel completo:
  // mostrar VAEP sin heatmap, o al revés, sería un contexto a medias.
  if (avanzado.status !== "fulfilled" || heatmaps.status !== "fulfilled") return null;

  const datosAvanzados = avanzado.value;
  const datosHeatmap = heatmaps.value;

  const armar = (equipo: EquipoAPI): EstadisticasEquipoHistorico | null => {
    const stats = datosAvanzados.teams.find((t) => t.team.id === equipo.id);
    const heat = datosHeatmap.teams.find((t) => t.team.id === equipo.id);
    if (!stats || !heat) return null;
    return {
      nombre: equipo.name,
      acciones: stats.actions,
      vaepTotal: stats.possession_value.vaep_total,
      ppda: stats.defending.ppda,
      heatmap: expandirCeldas(heat.cells, datosHeatmap.grid.length, datosHeatmap.grid.width),
    };
  };

  const local = armar(partido.home_team);
  const visitante = armar(partido.away_team);
  if (!local || !visitante) return null;

  return {
    matchId: partido.id,
    liga,
    fechaISO: partido.time_utc,
    marcador: { local: partido.score_home ?? 0, visitante: partido.score_away ?? 0 },
    grid: { longitud: datosHeatmap.grid.length, ancho: datosHeatmap.grid.width },
    local,
    visitante,
  };
}

/* Entrada pública ------------------------------------------------------------- */

/** Busca el último enfrentamiento ya jugado entre dos equipos, con sus métricas avanzadas y heatmap reales. */
export async function buscarUltimoEnfrentamiento(
  disciplina: DisciplinaId,
  nombreLocal: string,
  nombreVisitante: string,
): Promise<RendimientoHistorico | null> {
  if (!hayClavePitchAPI()) return null;
  const liga = LIGA_POR_DISCIPLINA[disciplina];
  if (!liga) return null;

  try {
    const actual = temporadaActual();
    let lista = await partidosDeLiga(liga.id, actual);
    let encontrado = buscarEnfrentamiento(lista, nombreLocal, nombreVisitante);

    if (!encontrado) {
      lista = await partidosDeLiga(liga.id, temporadaAnterior(actual));
      encontrado = buscarEnfrentamiento(lista, nombreLocal, nombreVisitante);
    }
    if (!encontrado) return null;

    return await construirRendimiento(encontrado, liga.nombre);
  } catch {
    // Nunca se propaga: sin contexto histórico, la tarjeta se ve igual que
    // hoy, solo sin el panel adicional.
    return null;
  }
}

/**
 * Resuelve el contexto histórico de todos los partidos elegibles a la vez.
 * Las llamadas al calendario de una misma liga comparten una única petición
 * de red por temporada gracias a la memoización de `fetch` de Next dentro de
 * un mismo render — no hace falta deduplicar aquí a mano.
 */
export async function obtenerRendimientoHistorico(
  partidos: Partido[],
): Promise<Map<string, RendimientoHistorico>> {
  const resultado = new Map<string, RendimientoHistorico>();
  if (!hayClavePitchAPI()) return resultado;

  const candidatos = partidos.filter((p) => LIGA_POR_DISCIPLINA[p.disciplina]);
  await Promise.all(
    candidatos.map(async (partido) => {
      const rendimiento = await buscarUltimoEnfrentamiento(
        partido.disciplina,
        partido.local.nombre,
        partido.visitante.nombre,
      );
      if (rendimiento) resultado.set(partido.id, rendimiento);
    }),
  );
  return resultado;
}
