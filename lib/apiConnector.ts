/**
 * Fuente de datos: cartelera real desde The Odds API.
 *
 * Cambio de arquitectura respecto a versiones anteriores de este archivo: antes
 * la cartelera era la lista simulada de `data/mockData.ts` y la API solo le
 * "pegaba" una cuota real cuando por casualidad el par de equipos coincidía con
 * el calendario de verdad (en la práctica, 1 de cada ~19 partidos). Ahora la
 * cartelera **se construye directamente** a partir de los eventos reales de la
 * API para cada disciplina con cobertura. Los datos simulados quedan como lo
 * que su nombre indica: una reserva, usada solo cuando una disciplina concreta
 * no se puede obtener en vivo (sin clave, sin red, sin eventos, error de la
 * API), y siempre marcada como tal.
 *
 * ## Qué es real y qué no lo es en un partido construido así
 *
 * - **Equipos, fecha, hora, mercados y cuota: reales**, tal cual los da la API.
 * - **Probabilidad: derivada de la cuota real**, descontando el margen de la
 *   casa (`probabilidadImplicita`). No es una estimación propia.
 * - **Frecuencia histórica del mercado (`frecuencia`/`historial`): no existe.**
 *   The Odds API da encuentros y precios, no qué pasó en los últimos diez. Se
 *   guarda honestamente vacía (`{exitos:0, muestra:0}`, `[]`) en vez de
 *   rellenarla con algo inventado; `lib/analista.ts` y `data/mockData.ts` saben
 *   tratar una muestra vacía como neutra, no como una mala señal.
 * - **Forma de los competidores (últimos 5 resultados): no existe**, por la
 *   misma razón. Se deja `forma: []`.
 * - **Factores de contexto (árbitro, calendario, lesiones, táctica): no se
 *   inventan.** Fabricar "el árbitro promedia 5.8 tarjetas" sobre un partido
 *   real sería peor que un dato simulado: parecería verídico sin serlo. El
 *   único contexto que puede llevar un partido real es el que detecta
 *   `lib/noticias/` a partir de prensa genuina, marcado `origen: "noticia"`.
 *
 * ## Cobertura por disciplina
 *
 * Fútbol (Liga MX, Premier, Champions), NBA, UFC y tenis tienen cobertura en
 * The Odds API y se construyen en vivo. **LoL y Valorant no la tienen** — esta
 * API no cubre eSports, no es un hueco de esta integración — y siguen
 * sirviéndose desde `data/mockData.ts`, marcados como tales.
 *
 * ## Mercados disponibles
 *
 * El plan usado solo admite `h2h` (ganador) y `totals` (más/menos de una
 * línea). Mercados adicionales como "ambos anotan" (`btts`) no están
 * disponibles en este plan (`INVALID_MARKET` al pedirlos) — no se simulan.
 */

import {
  disciplinas,
  partidos as partidosLocales,
  type DisciplinaId,
  type FamiliaMercado,
  type Lectura,
  type Partido,
  type SentidoMercado,
} from "@/data/mockData";

export type Origen = "api" | "local";

export interface EstadoProveedor {
  nombre: string;
  estado: "ok" | "apagado" | "sin-datos" | "error";
  detalle?: string;
}

/** Cómo se resolvió cada disciplina, para poder mostrarlo partido a partido. */
export interface EstadoDisciplina {
  disciplina: DisciplinaId;
  fuente: "vivo" | "local" | "sin-cobertura";
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
  /** Cuántos partidos se construyeron en vivo, no desde la reserva local. */
  partidosEnVivo: number;
  proveedores: EstadoProveedor[];
  porDisciplina: EstadoDisciplina[];
}

const BASE = "https://api.the-odds-api.com/v4";
const TIEMPO_LIMITE_MS = 6000;

/**
 * Cuánto se cachea cada disciplina, en segundos.
 *
 * El cálculo que fija este número: se hace una petición por disciplina con
 * cobertura (6 ahora mismo) cada vez que el caché de Next expira y llega una
 * visita. Con tráfico continuo, eso es como mucho 86 400/REVALIDAR_S ciclos al
 * día. El plan gratuito da 500 peticiones **al mes**, no al día — a 600 s
 * (10 min) serían ~144 ciclos/día × 6 = 864 peticiones/día, la cuota mensual
 * entera en menos de una hora de tráfico continuo. Con 3600 s (1 h) baja a
 * ~144 peticiones/día, unas 4300/mes: sigue por encima del límite si hay
 * tráfico constante, pero deja margen real para un uso normal (visitas
 * intermitentes, no una visita nueva cada hora exacta del mes entero).
 *
 * Esto es una limitación real del plan gratuito, no un descuido: "en vivo" en
 * este proyecto significa "tan reciente como la última hora", no "al segundo".
 * Subir la frecuencia exige un plan de pago de The Odds API.
 */
const REVALIDAR_S = 3600;
/** Mercados soportados por el plan usado. "btts" y similares dan 422. */
const MERCADOS = "h2h,totals";

/** Disciplinas con cobertura real en The Odds API. El resto va por local. */
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
export function aPartido(evento: EventoAPI, disciplina: DisciplinaId): Partido | null {
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

  return {
    id: evento.id,
    disciplina,
    torneo: evento.sport_title,
    cuando,
    hora,
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

  if (respuesta.status === 401) throw new ErrorAPI("La clave de The Odds API no es válida");
  if (respuesta.status === 429) throw new ErrorAPI("Se agotaron las peticiones del plan");
  if (!respuesta.ok) throw new ErrorAPI(`The Odds API respondió ${respuesta.status}`);

  const restantes = Number(respuesta.headers.get("x-requests-remaining"));
  const datos = (await respuesta.json()) as T;
  return { datos, restantes: Number.isFinite(restantes) ? restantes : undefined };
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
    // hueco se resuelve más abajo cayendo a los datos locales.
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

function partidosLocalesDe(disciplina: DisciplinaId): Partido[] {
  return partidosLocales.filter((p) => p.disciplina === disciplina);
}

/**
 * Construye la cartelera. Cada disciplina con cobertura se intenta en vivo por
 * separado: si una falla (sin clave resuelta, error de red, cero eventos), esa
 * disciplina concreta cae a su reserva local sin arrastrar a las demás. Las
 * disciplinas sin cobertura en la API (eSports) van siempre por local.
 */
export async function obtenerPartidos(): Promise<ResultadoDatos> {
  const sharp = estadoSharp();
  const sinApiCobertura = disciplinas
    .map((d) => d.id)
    .filter((id) => !DISCIPLINAS_CON_API.includes(id));

  if (!hayClaveOdds()) {
    return {
      partidos: partidosLocales,
      origen: "local",
      motivo: "No hay ODDS_API_KEY configurada",
      lecturasEnriquecidas: 0,
      partidosEnVivo: 0,
      proveedores: [
        { nombre: "The Odds API", estado: "apagado", detalle: "Sin clave" },
        sharp,
      ],
      porDisciplina: [
        ...DISCIPLINAS_CON_API.map((d) => ({ disciplina: d, fuente: "local" as const, motivo: "Sin clave" })),
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
      porDisciplina.push({ disciplina, fuente: "local", motivo: "No se resolvió la clave del torneo" });
      partidos.push(...partidosLocalesDe(disciplina));
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

      // Se ordena por el instante real del evento, no por la hora ya
      // formateada como texto: comparar "09:00" contra "23:00" perdería la
      // fecha y mezclaría partidos de días distintos.
      const construidos = eventos
        .slice()
        .sort((a, b) => a.commence_time.localeCompare(b.commence_time))
        .map((e) => aPartido(e, disciplina))
        .filter((p): p is Partido => p !== null);

      if (construidos.length === 0) {
        porDisciplina.push({ disciplina, fuente: "local", eventos: 0, motivo: "La API no devolvió eventos" });
        partidos.push(...partidosLocalesDe(disciplina));
      } else {
        porDisciplina.push({ disciplina, fuente: "vivo", eventos: construidos.length });
        partidos.push(...construidos);
      }
    } catch (error) {
      const motivo = error instanceof ErrorAPI ? error.message : "No se pudo contactar con la API";
      fallosGlobales.push(`${disciplina}: ${motivo}`);
      porDisciplina.push({ disciplina, fuente: "local", motivo });
      partidos.push(...partidosLocalesDe(disciplina));
    }
  }

  for (const disciplina of sinApiCobertura) {
    porDisciplina.push({ disciplina, fuente: "sin-cobertura" });
    partidos.push(...partidosLocalesDe(disciplina));
  }

  const enVivo = porDisciplina.filter((d) => d.fuente === "vivo");
  const lecturasEnriquecidas = partidos
    .filter((p) => porDisciplina.find((d) => d.disciplina === p.disciplina)?.fuente === "vivo")
    .reduce((suma, p) => suma + p.lecturas.filter((l) => l.cuotaMercado).length, 0);
  const partidosEnVivo = partidos.filter(
    (p) => porDisciplina.find((d) => d.disciplina === p.disciplina)?.fuente === "vivo",
  ).length;

  return {
    partidos,
    // "api" en cuanto al menos una disciplina se construyó en vivo; si TODAS
    // cayeron a local (incluida cada una con su propio motivo), es "local".
    origen: enVivo.length > 0 ? "api" : "local",
    motivo: fallosGlobales.length > 0 ? fallosGlobales.join("; ") : undefined,
    peticionesRestantes: restantes,
    lecturasEnriquecidas,
    partidosEnVivo,
    proveedores: [
      {
        nombre: "The Odds API",
        estado: enVivo.length > 0 ? "ok" : fallosGlobales.length > 0 ? "error" : "sin-datos",
        detalle: `${enVivo.length}/${DISCIPLINAS_CON_API.length} disciplinas en vivo, ${partidosEnVivo} partidos`,
      },
      sharp,
    ],
    porDisciplina,
  };
}
