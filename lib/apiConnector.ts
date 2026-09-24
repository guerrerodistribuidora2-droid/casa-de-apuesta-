/**
 * Fuente de datos: cartelera real desde The Odds API.
 *
 * A diferencia de versiones anteriores de este archivo, aquí **no existe
 * ninguna reserva local ni dato simulado**: si una disciplina no se puede
 * traer en vivo (sin clave, sin red, sin eventos, error de la API, o
 * simplemente sin cobertura en este proveedor), esa disciplina se queda
 * fuera de la cartelera — no se completa con nada inventado. `Tablero` ya
 * oculta cualquier sección sin partidos, así que el tablero puede quedarse
 * legítimamente vacío si la API no responde; eso se documenta en el pie de
 * página (`porDisciplina`), nunca se disimula con datos de relleno.
 *
 * ## Qué es real y qué no lo es en un partido construido así
 *
 * - **Equipos, fecha, hora, mercados y cuota: reales**, tal cual los da la API.
 * - **Probabilidad: derivada de la cuota real**, descontando el margen de la
 *   casa (`probabilidadImplicita`). No es una estimación propia.
 * - **Estado (no iniciado / en vivo / finalizado) y marcador real:**
 *   resueltos aparte, contra el endpoint `/scores` de la misma API — ver
 *   `obtenerEstados()`. Si esa petición falla, el partido se construye igual
 *   pero sin `estado`: no se asume "no iniciado" a ciegas.
 * - **Frecuencia histórica del mercado (`frecuencia`/`historial`): no existe.**
 *   The Odds API da encuentros y precios, no qué pasó en los últimos diez. Se
 *   guarda honestamente vacía (`{exitos:0, muestra:0}`, `[]`) en vez de
 *   rellenarla con algo inventado; `lib/analista.ts` sabe tratar una muestra
 *   vacía como neutra, no como una mala señal.
 * - **Forma de los competidores (últimos 5 resultados): no existe**, por la
 *   misma razón. Se deja `forma: []`.
 * - **Factores de contexto (árbitro, calendario, lesiones, táctica): no se
 *   inventan.** El único contexto que puede llevar un partido real es el que
 *   detecta `lib/noticias/` a partir de prensa genuina (`origen: "noticia"`)
 *   o el que resuelve `lib/pitchapi.ts` contra un enfrentamiento ya jugado
 *   (etiquetado como histórico, nunca como el partido de hoy).
 *
 * ## Cobertura por disciplina
 *
 * Fútbol (Liga MX, Premier, Champions), NBA, UFC y tenis tienen cobertura en
 * The Odds API. **LoL y Valorant no la tienen** — esta API no cubre eSports,
 * no es un hueco de esta integración — así que esas dos disciplinas nunca
 * aparecen en el tablero hasta que exista un proveedor real para ellas.
 *
 * ## Mercados disponibles
 *
 * El plan usado solo admite `h2h` (ganador) y `totals` (más/menos de una
 * línea). Mercados adicionales como "ambos anotan" (`btts`) no están
 * disponibles en este plan (`INVALID_MARKET` al pedirlos) — no se simulan.
 */

import {
  disciplinas,
  type DisciplinaId,
  type FamiliaMercado,
  type Lectura,
  type Partido,
  type SentidoMercado,
} from "@/data/mockData";

export type Origen = "api" | "sin-datos";

export interface EstadoProveedor {
  nombre: string;
  estado: "ok" | "apagado" | "sin-datos" | "error";
  detalle?: string;
}

/** Cómo se resolvió cada disciplina, para poder mostrarlo partido a partido. */
export interface EstadoDisciplina {
  disciplina: DisciplinaId;
  /** "sin-datos": tiene cobertura en principio, pero no se pudo traer nada esta vez. */
  fuente: "vivo" | "sin-datos" | "sin-cobertura";
  eventos?: number;
  motivo?: string;
}

export interface ResultadoDatos {
  partidos: Partido[];
  origen: Origen;
  motivo?: string;
  peticionesRestantes?: number;
  /** Cuántas lecturas llevan cuota real de mercado (todas las "vivo" la llevan). */
  lecturasEnriquecidas: number;
  /** Cuántos partidos se construyeron en vivo. Con esta arquitectura son todos los que hay. */
  partidosEnVivo: number;
  proveedores: EstadoProveedor[];
  porDisciplina: EstadoDisciplina[];
}

const BASE = "https://api.the-odds-api.com/v4";
const TIEMPO_LIMITE_MS = 6000;

/**
 * Cuánto se cachea cada disciplina, en segundos.
 *
 * El cálculo que fija este número: por cada disciplina con cobertura (6 ahora
 * mismo) se hace UNA petición de cuotas Y UNA petición de estado/marcador
 * (`/scores`) cada vez que el caché de Next expira y llega una visita — el
 * doble de peticiones que cuando este archivo solo traía cuotas. Con tráfico
 * continuo, eso es como mucho 86 400/REVALIDAR_S ciclos al día. El plan
 * gratuito da 500 peticiones **al mes**, no al día: a 3600 s (1 h) son
 * ~144 ciclos/día × 6 disciplinas × 2 peticiones ≈ 1728 peticiones/día, la
 * cuota mensual entera en menos de cuatro horas de tráfico continuo.
 *
 * Esto ya no es solo una limitación teórica: en la práctica esta cuenta
 * llegó a 0/500 peticiones restantes durante el desarrollo. Subir la
 * frecuencia, o mantenerla con tráfico constante, exige un plan de pago de
 * The Odds API — REVALIDAR_S por sí solo no alcanza para estirar 500
 * peticiones/mes con dos llamadas por disciplina y ciclo.
 */
const REVALIDAR_S = 3600;
/** Mercados soportados por el plan usado. "btts" y similares dan 422. */
const MERCADOS = "h2h,totals";

/** Disciplinas con cobertura real en The Odds API. El resto nunca se muestra. */
const DISCIPLINAS_CON_API: DisciplinaId[] = [
  "liga-mx",
  "premier",
  "champions",
  "nba",
  "ufc",
  "tenis",
];

/** Claves de deporte fijas. Fútbol y NBA no rotan de temporada a temporada. */
const CLAVES_FIJAS: Partial<Record<DisciplinaId, string>> = {
  "liga-mx": "soccer_mexico_ligamx",
  premier: "soccer_epl",
  champions: "soccer_uefa_champs_league",
  nba: "basketball_nba",
  ufc: "mma_mixed_martial_arts",
};

/**
 * Disciplinas cuya clave rota de torneo en torneo y se resuelve por grupo.
 * El tenis puede tener varios torneos activos a la vez (un ATP y un WTA en
 * paralelo, por ejemplo): se toman TODOS los del grupo, no solo el primero.
 */
const GRUPOS_DINAMICOS: Partial<Record<DisciplinaId, string>> = {
  tenis: "Tennis",
};

/* Forma de la respuesta ------------------------------------------------------ */

interface CuotaAPI {
  name: string;
  price: number;
  point?: number;
}
interface MercadoAPI {
  key: string;
  outcomes: CuotaAPI[];
}
interface CasaAPI {
  key: string;
  title: string;
  markets: MercadoAPI[];
}
export interface EventoAPI {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: CasaAPI[];
}
interface DeporteAPI {
  key: string;
  group: string;
  active: boolean;
}

/** Forma del endpoint /scores: mismo id de evento que /odds para el mismo partido. */
interface EstadoAPI {
  id: string;
  commence_time: string;
  completed: boolean;
  scores: { name: string; score: string }[] | null;
}

export interface EstadoPartidoReal {
  estado: "no_iniciado" | "en_vivo" | "finalizado";
  scores?: { name: string; score: string }[];
}

/* Utilidades ------------------------------------------------------------------ */

export function hayClaveOdds(): boolean {
  return Boolean(process.env.ODDS_API_KEY);
}

/** Probabilidad implícita de una cuota, descontando el margen de la casa. */
export function probabilidadImplicita(cuota: number, cuotasDelMercado: number[]): number {
  if (cuota <= 1) return 0;
  const suma = cuotasDelMercado.reduce((t, c) => t + (c > 1 ? 1 / c : 0), 0);
  if (suma <= 0) return 0;
  return Math.round((1 / cuota / suma) * 100);
}

/**
 * Ventaja esperada de una lectura contra el precio real, en tanto por uno.
 * Sin cuota de mercado no hay ventaja que calcular: devuelve null en vez de
 * fingir un número.
 */
export function valorEsperado(lectura: Lectura): number | null {
  if (!lectura.cuotaMercado) return null;
  return (lectura.probabilidad / 100) * lectura.cuotaMercado - 1;
}

function claveCorta(nombre: string): string {
  return nombre
    .split(/\s+/)
    .map((p) => p[0] ?? "")
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

/**
 * "Hoy" / "Mañana" / el día de la semana si es esta misma semana / la fecha
 * si es más adelante. Con partidos reales, un torneo puede tener su siguiente
 * encuentro dentro de dos semanas; "Hoy"/"Mañana" a secas no alcanza.
 */
function formatearFecha(iso: string): { cuando: string; hora: string } {
  const fecha = new Date(iso);
  const hora = fecha.toISOString().slice(11, 16);

  const hoy = new Date();
  const diaUtc = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dias = Math.round((diaUtc(fecha) - diaUtc(hoy)) / 86_400_000);

  let cuando: string;
  if (dias === 0) cuando = "Hoy";
  else if (dias === 1) cuando = "Mañana";
  else if (dias > 1 && dias <= 6) {
    cuando = fecha.toLocaleDateString("es-MX", { weekday: "long", timeZone: "UTC" });
    cuando = cuando.charAt(0).toUpperCase() + cuando.slice(1);
  } else {
    cuando = fecha.toLocaleDateString("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
  }
  return { cuando, hora };
}

/* Clasificación de mercados ---------------------------------------------------
 * Qué familia y unidad usa el mercado de totales según la disciplina. Sin
 * entrada aquí, esa disciplina no tiene un total con sentido (UFC y tenis, en
 * este plan, de hecho solo ofrecen h2h) y el mercado se ignora si apareciera.
 */
const TOTAL_POR_DISCIPLINA: Partial<Record<DisciplinaId, { familia: FamiliaMercado; unidad: string }>> = {
  "liga-mx": { familia: "goles", unidad: "goles" },
  premier: { familia: "goles", unidad: "goles" },
  champions: { familia: "goles", unidad: "goles" },
  nba: { familia: "puntos", unidad: "puntos" },
};

interface MercadoClasificado {
  mercado: string;
  familia: FamiliaMercado;
  sentido: SentidoMercado;
}

function nombrarMercado(
  claveMercado: string,
  salida: CuotaAPI,
  disciplina: DisciplinaId,
): MercadoClasificado | null {
  if (claveMercado === "totals" && salida.point !== undefined) {
    const cfg = TOTAL_POR_DISCIPLINA[disciplina];
    if (!cfg) return null;
    const mas = salida.name === "Over";
    return {
      mercado: `${mas ? "Más" : "Menos"} de ${salida.point} ${cfg.unidad}`,
      familia: cfg.familia,
      sentido: mas ? "mas" : "menos",
    };
  }
  if (claveMercado === "h2h") {
    if (salida.name === "Draw") return { mercado: "Empate", familia: "resultado", sentido: "evento" };
    return { mercado: `Gana ${salida.name}`, familia: "resultado", sentido: "evento" };
  }
  return null;
}

/**
 * Construye un Partido real a partir de un evento de la API. Recorre TODAS
 * las casas para quedarse con el mejor precio de cada mercado — la cuota que
 * un apostador podría tomar de verdad — y deriva la probabilidad de esa misma
 * casa, para no mezclar el precio de una con la probabilidad de otra.
 */
export function aPartido(
  evento: EventoAPI,
  disciplina: DisciplinaId,
  estadoReal?: EstadoPartidoReal,
): Partido | null {
  const { cuando, hora } = formatearFecha(evento.commence_time);
  const porMercado = new Map<string, Lectura>();

  for (const casa of evento.bookmakers) {
    for (const mercado of casa.markets) {
      const precios = mercado.outcomes.map((o) => o.price);

      for (const salida of mercado.outcomes) {
        if (salida.price <= 1) continue;
        const clasificado = nombrarMercado(mercado.key, salida, disciplina);
        if (!clasificado) continue;

        const existente = porMercado.get(clasificado.mercado);
        if (existente && (existente.cuotaMercado ?? 0) >= salida.price) continue;

        porMercado.set(clasificado.mercado, {
          mercado: clasificado.mercado,
          familia: clasificado.familia,
          sentido: clasificado.sentido,
          linea: salida.point,
          probabilidad: probabilidadImplicita(salida.price, precios),
          // Sin historial propio: `divergencia`/`fuerza`/los factores del
          // motor tratan muestra=0 como neutro, no como una mala señal.
          frecuencia: { exitos: 0, muestra: 0 },
          historial: [],
          nota: "Probabilidad derivada de cuotas reales de mercado.",
          cuotaMercado: salida.price,
          casaMercado: casa.title,
        });
      }
    }
  }

  if (porMercado.size === 0) return null;

  let marcadorReal: { local: number; visitante: number } | undefined;
  if (estadoReal?.scores) {
    const local = estadoReal.scores.find((s) => s.name === evento.home_team);
    const visitante = estadoReal.scores.find((s) => s.name === evento.away_team);
    if (local && visitante) {
      marcadorReal = { local: Number(local.score), visitante: Number(visitante.score) };
    }
  }

  return {
    id: evento.id,
    disciplina,
    torneo: evento.sport_title,
    cuando,
    hora,
    estado: estadoReal?.estado,
    marcadorReal,
    local: { nombre: evento.home_team, clave: claveCorta(evento.home_team), forma: [] },
    visitante: { nombre: evento.away_team, clave: claveCorta(evento.away_team), forma: [] },
    lecturas: [...porMercado.values()],
  };
}

/* Petición ---------------------------------------------------------------------- */

class ErrorAPI extends Error {}

async function pedir<T>(ruta: string): Promise<{ datos: T; restantes?: number }> {
  const separador = ruta.includes("?") ? "&" : "?";
  const url = `${BASE}${ruta}${separador}apiKey=${process.env.ODDS_API_KEY}`;

  const respuesta = await fetch(url, {
    signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
    next: { revalidate: REVALIDAR_S },
  });

  if (respuesta.status === 401) {
    // The Odds API también usa 401 para "se acabó la cuota del plan"
    // (error_code OUT_OF_USAGE_CREDITS), no solo para una clave inválida —
    // se distingue leyendo el cuerpo en vez de asumir lo primero que se nos
    // ocurra, porque decir "clave inválida" cuando en realidad es cuota
    // agotada llevaría a rotar una clave que no tiene nada malo.
    const cuerpo = await respuesta.json().catch(() => null);
    if (cuerpo?.error_code === "OUT_OF_USAGE_CREDITS") {
      throw new ErrorAPI("Se agotó la cuota mensual del plan de The Odds API");
    }
    throw new ErrorAPI("La clave de The Odds API no es válida");
  }
  if (respuesta.status === 429) throw new ErrorAPI("Se agotaron las peticiones del plan");
  if (!respuesta.ok) throw new ErrorAPI(`The Odds API respondió ${respuesta.status}`);

  const restantes = Number(respuesta.headers.get("x-requests-remaining"));
  const datos = (await respuesta.json()) as T;
  return { datos, restantes: Number.isFinite(restantes) ? restantes : undefined };
}

/**
 * Estado real (no iniciado / en vivo / finalizado) y marcador de cada evento
 * de una clave de deporte, vía `/scores` — un endpoint aparte del de cuotas.
 * Es deliberadamente best-effort: si falla, los partidos de esa clave se
 * construyen igual mediante `/odds`, solo que sin `estado` ni `marcadorReal`
 * (nunca se asume "no iniciado" sin haberlo confirmado).
 */
async function obtenerEstados(clavesDeporte: string[]): Promise<Map<string, EstadoPartidoReal>> {
  const mapa = new Map<string, EstadoPartidoReal>();
  for (const clave of clavesDeporte) {
    try {
      const { datos } = await pedir<EstadoAPI[]>(`/sports/${clave}/scores/?daysFrom=1`);
      for (const evento of datos) {
        const yaEmpezo = new Date(evento.commence_time).getTime() <= Date.now();
        mapa.set(evento.id, {
          estado: evento.completed ? "finalizado" : yaEmpezo ? "en_vivo" : "no_iniciado",
          scores: evento.scores ?? undefined,
        });
      }
    } catch {
      // Sin estado real para esta clave — ver comentario de la función.
    }
  }
  return mapa;
}

/**
 * Resuelve a qué clave o claves de deporte corresponde cada disciplina. Las
 * fijas no cuestan una petición aparte; las dinámicas (tenis) se resuelven
 * contra la lista de deportes, que tampoco consume cuota, y pueden ser varias
 * a la vez si hay más de un torneo activo.
 */
async function resolverClaves(): Promise<Map<DisciplinaId, string[]>> {
  const mapa = new Map<DisciplinaId, string[]>();
  for (const [disciplina, clave] of Object.entries(CLAVES_FIJAS)) {
    mapa.set(disciplina as DisciplinaId, [clave]);
  }

  const necesitaDinamicas = Object.keys(GRUPOS_DINAMICOS).length > 0;
  if (!necesitaDinamicas) return mapa;

  try {
    const { datos } = await pedir<DeporteAPI[]>("/sports/");
    for (const [disciplina, grupo] of Object.entries(GRUPOS_DINAMICOS)) {
      const activos = datos.filter((d) => d.group === grupo && d.active).map((d) => d.key);
      if (activos.length > 0) mapa.set(disciplina as DisciplinaId, activos);
    }
  } catch {
    // Sin lista de deportes, las disciplinas dinámicas quedan sin clave: ese
    // hueco se resuelve más abajo dejando esa disciplina sin partidos.
  }
  return mapa;
}

/* Entrada pública --------------------------------------------------------------- */

function estadoSharp(): EstadoProveedor {
  if (process.env.SHARP_API_HABILITADA !== "true") {
    return { nombre: "SharpAPI", estado: "apagado", detalle: "SHARP_API_HABILITADA no está en true" };
  }
  return {
    nombre: "SharpAPI",
    estado: "error",
    detalle: "No hay endpoint de cuotas configurado para este proveedor",
  };
}

/**
 * Construye la cartelera. Cada disciplina con cobertura se intenta en vivo por
 * separado: si una falla (sin clave resuelta, error de red, cero eventos), esa
 * disciplina concreta se queda sin partidos, sin arrastrar a las demás. Las
 * disciplinas sin cobertura en la API (eSports) tampoco muestran nada — no
 * hay reserva local en ningún caso.
 */
export async function obtenerPartidos(): Promise<ResultadoDatos> {
  const sharp = estadoSharp();
  const sinApiCobertura = disciplinas
    .map((d) => d.id)
    .filter((id) => !DISCIPLINAS_CON_API.includes(id));

  if (!hayClaveOdds()) {
    return {
      partidos: [],
      origen: "sin-datos",
      motivo: "No hay ODDS_API_KEY configurada",
      lecturasEnriquecidas: 0,
      partidosEnVivo: 0,
      proveedores: [
        { nombre: "The Odds API", estado: "apagado", detalle: "Sin clave" },
        sharp,
      ],
      porDisciplina: [
        ...DISCIPLINAS_CON_API.map((d) => ({ disciplina: d, fuente: "sin-datos" as const, motivo: "Sin clave" })),
        ...sinApiCobertura.map((d) => ({ disciplina: d, fuente: "sin-cobertura" as const })),
      ],
    };
  }

  const claves = await resolverClaves();
  const porDisciplina: EstadoDisciplina[] = [];
  const partidos: Partido[] = [];
  let restantes: number | undefined;
  const fallosGlobales: string[] = [];

  for (const disciplina of DISCIPLINAS_CON_API) {
    const clavesDeporte = claves.get(disciplina);
    if (!clavesDeporte || clavesDeporte.length === 0) {
      porDisciplina.push({ disciplina, fuente: "sin-datos", motivo: "No se resolvió la clave del torneo" });
      continue;
    }

    try {
      const eventos: EventoAPI[] = [];
      for (const clave of clavesDeporte) {
        const { datos, restantes: quedan } = await pedir<EventoAPI[]>(
          `/sports/${clave}/odds?regions=eu,uk&markets=${MERCADOS}&oddsFormat=decimal`,
        );
        if (quedan !== undefined) restantes = quedan;
        if (Array.isArray(datos)) eventos.push(...datos);
      }

      // Best-effort: si esta llamada falla, los partidos de abajo se
      // construyen igual, solo que sin estado/marcador real.
      const estadosReales = await obtenerEstados(clavesDeporte);

      // Se ordena por el instante real del evento, no por la hora ya
      // formateada como texto: comparar "09:00" contra "23:00" perdería la
      // fecha y mezclaría partidos de días distintos.
      const construidos = eventos
        .slice()
        .sort((a, b) => a.commence_time.localeCompare(b.commence_time))
        .map((e) => aPartido(e, disciplina, estadosReales.get(e.id)))
        .filter((p): p is Partido => p !== null);

      if (construidos.length === 0) {
        porDisciplina.push({ disciplina, fuente: "sin-datos", eventos: 0, motivo: "La API no devolvió eventos" });
      } else {
        porDisciplina.push({ disciplina, fuente: "vivo", eventos: construidos.length });
        partidos.push(...construidos);
      }
    } catch (error) {
      const motivo = error instanceof ErrorAPI ? error.message : "No se pudo contactar con la API";
      fallosGlobales.push(`${disciplina}: ${motivo}`);
      porDisciplina.push({ disciplina, fuente: "sin-datos", motivo });
    }
  }

  for (const disciplina of sinApiCobertura) {
    porDisciplina.push({ disciplina, fuente: "sin-cobertura" });
  }

  const enVivo = porDisciplina.filter((d) => d.fuente === "vivo");
  const lecturasEnriquecidas = partidos.reduce(
    (suma, p) => suma + p.lecturas.filter((l) => l.cuotaMercado).length,
    0,
  );

  return {
    partidos,
    // "api" en cuanto al menos una disciplina se construyó en vivo; si TODAS
    // se quedaron sin datos, se refleja como tal en vez de como "local".
    origen: enVivo.length > 0 ? "api" : "sin-datos",
    motivo: fallosGlobales.length > 0 ? fallosGlobales.join("; ") : undefined,
    peticionesRestantes: restantes,
    lecturasEnriquecidas,
    partidosEnVivo: partidos.length,
    proveedores: [
      {
        nombre: "The Odds API",
        estado: enVivo.length > 0 ? "ok" : fallosGlobales.length > 0 ? "error" : "sin-datos",
        detalle: `${enVivo.length}/${DISCIPLINAS_CON_API.length} disciplinas en vivo, ${partidos.length} partidos`,
      },
      sharp,
    ],
    porDisciplina,
  };
}
