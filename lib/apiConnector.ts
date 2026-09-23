/**
 * Adaptador de datos externos.
 *
 * Regla de oro: **esta capa nunca lanza**. Cualquier fallo (sin clave, sin red,
 * cuota agotada, respuesta rara) se resuelve devolviendo los datos locales junto
 * con el motivo. La página siempre recibe un `Partido[]` válido.
 *
 * ## Qué hace realmente cuando la API responde
 *
 * No sustituye los encuentros locales: los **enriquece**. The Odds API da
 * encuentros y precios, pero no el historial de cumplimiento de cada mercado, y
 * todo el análisis del tablero se apoya en frecuencias. Sustituir los partidos
 * dejaría al motor sin su materia prima.
 *
 * Lo que sí aporta, y es lo importante, es la **cuota real de mercado**. Con
 * ella el tablero puede calcular ventaja de verdad (nuestra probabilidad contra
 * el precio que paga la casa) en lugar de operar contra una cuota justa derivada
 * de nuestra propia estimación, que por construcción no deja margen.
 *
 * ## Proveedores
 *
 * 1. **The Odds API** (`ODDS_API_KEY`): el que funciona. La lista de deportes es
 *    gratuita, así que se usa para resolver las claves que rotan por torneo
 *    —las de tenis cambian con cada Grand Slam— en lugar de fijarlas a mano.
 * 2. **SharpAPI** (`SHARP_API_KEY`, `SHARP_API_HABILITADA`): hueco preparado y
 *    apagado. Ver la guía de despliegue.
 */

import {
  partidos as partidosLocales,
  type DisciplinaId,
  type Lectura,
  type Partido,
} from "@/data/mockData";

export type Origen = "api" | "hibrido" | "local";

export interface EstadoProveedor {
  nombre: string;
  estado: "ok" | "apagado" | "sin-datos" | "error";
  detalle?: string;
}

export interface ResultadoDatos {
  partidos: Partido[];
  origen: Origen;
  /** Por qué no se usaron cuotas externas. Ausente cuando todo fue bien. */
  motivo?: string;
  peticionesRestantes?: number;
  /** Lecturas que recibieron cuota real de mercado. */
  lecturasEnriquecidas: number;
  /** Encuentros locales emparejados con un evento de la API. */
  partidosEmparejados: number;
  proveedores: EstadoProveedor[];
}

const BASE = "https://api.the-odds-api.com/v4";
const TIEMPO_LIMITE_MS = 6000;
/** Cuánto se cachea una respuesta de cuotas. El plan gratuito son 500 al mes. */
const REVALIDAR_S = 600;

/**
 * Claves de deporte. Las de tenis rotan con el torneo en curso, así que no se
 * fijan: se descubren en la lista de deportes, que no consume cuota.
 */
const CLAVES_FIJAS: Partial<Record<DisciplinaId, string>> = {
  "liga-mx": "soccer_mexico_ligamx",
  premier: "soccer_epl",
  champions: "soccer_uefa_champs_league",
  nba: "basketball_nba",
  ufc: "mma_mixed_martial_arts",
};

/** Disciplinas cuya clave se resuelve buscando por grupo en la lista. */
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

/* Utilidades ----------------------------------------------------------------- */

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

/* Emparejado de nombres ------------------------------------------------------ */

const RUIDO = new Set([
  "fc", "cf", "afc", "club", "de", "the", "united", "city", "sc", "ac",
]);

function normalizar(nombre: string): string[] {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !RUIDO.has(t));
}

/** Cuánto se parecen dos nombres de equipo, de 0 a 1. */
function parecido(a: string, b: string): number {
  const ta = normalizar(a);
  const tb = normalizar(b);
  if (ta.length === 0 || tb.length === 0) return 0;

  const comunes = ta.filter((t) => tb.some((u) => u.startsWith(t) || t.startsWith(u)));
  return comunes.length / Math.min(ta.length, tb.length);
}

/**
 * Empareja un encuentro local con el evento de la API.
 *
 * Se puntúa la pareja entera y no cada equipo por su cuenta: "Manchester United"
 * y "Manchester City" comparten token, pero es improbable que los dos lados
 * coincidan por accidente. Se exige un 0.6 de media para aceptar.
 */
function emparejar(partido: Partido, eventos: EventoAPI[]): EventoAPI | null {
  let mejor: EventoAPI | null = null;
  let mejorPuntaje = 0.6;

  for (const evento of eventos) {
    const directo =
      (parecido(partido.local.nombre, evento.home_team) +
        parecido(partido.visitante.nombre, evento.away_team)) /
      2;
    const invertido =
      (parecido(partido.local.nombre, evento.away_team) +
        parecido(partido.visitante.nombre, evento.home_team)) /
      2;

    const puntaje = Math.max(directo, invertido);
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejor = evento;
    }
  }
  return mejor;
}

/* Extracción de cuotas ------------------------------------------------------- */

interface MejorPrecio {
  cuota: number;
  casa: string;
}

/**
 * Mejor precio disponible para una lectura entre todas las casas.
 *
 * Se toma el máximo y no la media: es la cuota que un apostador podría tomar de
 * verdad, y es la única que hace honesto el cálculo de ventaja.
 */
function mejorPrecioPara(lectura: Lectura, evento: EventoAPI): MejorPrecio | null {
  let mejor: MejorPrecio | null = null;

  for (const casa of evento.bookmakers) {
    for (const mercado of casa.markets) {
      let salida: CuotaAPI | undefined;

      if (mercado.key === "totals" && lectura.linea !== undefined) {
        const buscado = lectura.sentido === "mas" ? "Over" : "Under";
        salida = mercado.outcomes.find(
          (o) => o.name === buscado && o.point === lectura.linea,
        );
      } else if (mercado.key === "h2h" && lectura.familia === "resultado") {
        // Solo se resuelve el caso inequívoco: el mercado del equipo local.
        if (/local/i.test(lectura.mercado)) {
          salida = mercado.outcomes.find((o) => o.name === evento.home_team);
        } else if (/empate/i.test(lectura.mercado)) {
          salida = mercado.outcomes.find((o) => o.name === "Draw");
        }
      }

      if (salida && salida.price > 1 && (!mejor || salida.price > mejor.cuota)) {
        mejor = { cuota: salida.price, casa: casa.title };
      }
    }
  }
  return mejor;
}

/* Petición ------------------------------------------------------------------- */

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

/** Resuelve las claves de deporte, incluidas las que rotan por torneo. */
async function resolverClaves(): Promise<Partial<Record<DisciplinaId, string>>> {
  const claves = { ...CLAVES_FIJAS };
  try {
    // La lista de deportes no consume cuota.
    const { datos } = await pedir<DeporteAPI[]>("/sports/");
    for (const [disciplina, grupo] of Object.entries(GRUPOS_DINAMICOS)) {
      const encontrado = datos.find((d) => d.group === grupo && d.active);
      if (encontrado) claves[disciplina as DisciplinaId] = encontrado.key;
    }
  } catch {
    // Sin lista, se sigue con las claves fijas.
  }
  return claves;
}

/* Entrada pública ------------------------------------------------------------ */

function soloLocal(motivo: string, proveedores: EstadoProveedor[]): ResultadoDatos {
  return {
    partidos: partidosLocales,
    origen: "local",
    motivo,
    lecturasEnriquecidas: 0,
    partidosEmparejados: 0,
    proveedores,
  };
}

function estadoSharp(): EstadoProveedor {
  if (process.env.SHARP_API_HABILITADA !== "true") {
    return {
      nombre: "SharpAPI",
      estado: "apagado",
      detalle: "SHARP_API_HABILITADA no está en true",
    };
  }
  return {
    nombre: "SharpAPI",
    estado: "error",
    detalle: "No hay endpoint de cuotas configurado para este proveedor",
  };
}

/**
 * Devuelve los partidos con los que trabaja el tablero, con las cuotas de
 * mercado incorporadas si la API respondió.
 */
export async function obtenerPartidos(): Promise<ResultadoDatos> {
  const sharp = estadoSharp();

  if (!hayClaveOdds()) {
    return soloLocal("No hay ODDS_API_KEY configurada", [
      { nombre: "The Odds API", estado: "apagado", detalle: "Sin clave" },
      sharp,
    ]);
  }

  try {
    const claves = await resolverClaves();

    // Solo se consultan las disciplinas de las que hay encuentros locales.
    const necesarias = [...new Set(partidosLocales.map((p) => p.disciplina))].filter(
      (d) => claves[d],
    );

    const eventosPorDisciplina = new Map<DisciplinaId, EventoAPI[]>();
    let restantes: number | undefined;
    const fallos: string[] = [];

    for (const disciplina of necesarias) {
      try {
        const { datos, restantes: quedan } = await pedir<EventoAPI[]>(
          `/sports/${claves[disciplina]}/odds?regions=eu,uk&markets=h2h,totals&oddsFormat=decimal`,
        );
        if (quedan !== undefined) restantes = quedan;
        if (Array.isArray(datos)) eventosPorDisciplina.set(disciplina, datos);
      } catch (error) {
        fallos.push(`${disciplina}: ${error instanceof Error ? error.message : "fallo"}`);
      }
    }

    // Enriquecimiento: se copian los partidos y se añaden las cuotas halladas.
    let enriquecidas = 0;
    let emparejados = 0;

    const partidos = partidosLocales.map((partido) => {
      const eventos = eventosPorDisciplina.get(partido.disciplina);
      if (!eventos || eventos.length === 0) return partido;

      const evento = emparejar(partido, eventos);
      if (!evento) return partido;
      emparejados++;

      const lecturas = partido.lecturas.map((lectura) => {
        const precio = mejorPrecioPara(lectura, evento);
        if (!precio) return lectura;
        enriquecidas++;
        return { ...lectura, cuotaMercado: precio.cuota, casaMercado: precio.casa };
      });

      return { ...partido, lecturas };
    });

    const proveedores: EstadoProveedor[] = [
      {
        nombre: "The Odds API",
        estado: enriquecidas > 0 ? "ok" : "sin-datos",
        detalle:
          fallos.length > 0
            ? fallos.join("; ")
            : `${emparejados} encuentros emparejados, ${enriquecidas} cuotas`,
      },
      sharp,
    ];

    if (enriquecidas === 0) {
      return {
        partidos: partidosLocales,
        origen: "local",
        motivo:
          fallos.length > 0
            ? fallos.join("; ")
            : "La API respondió pero ningún encuentro local coincidió",
        peticionesRestantes: restantes,
        lecturasEnriquecidas: 0,
        partidosEmparejados: emparejados,
        proveedores,
      };
    }

    return {
      partidos,
      origen: "hibrido",
      peticionesRestantes: restantes,
      lecturasEnriquecidas: enriquecidas,
      partidosEmparejados: emparejados,
      proveedores,
    };
  } catch (error) {
    const motivo =
      error instanceof ErrorAPI
        ? error.message
        : error instanceof Error && error.name === "TimeoutError"
          ? "The Odds API tardó demasiado en responder"
          : "No se pudo contactar con The Odds API";

    return soloLocal(motivo, [
      { nombre: "The Odds API", estado: "error", detalle: motivo },
      sharp,
    ]);
  }
}
