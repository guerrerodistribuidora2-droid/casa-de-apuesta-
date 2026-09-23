/**
 * Gestión de banca.
 *
 * Aviso que conviene tener delante al leer este archivo: la cuota con la que se
 * liquidan las apuestas es la **cuota justa**, que sale de nuestra propia
 * probabilidad estimada. Apostar a cuota justa tiene valor esperado cero por
 * construcción, así que el balance que produce este módulo es una **simulación
 * de gestión de banca**, no una expectativa de beneficio. Para eso harían falta
 * las cuotas reales del mercado, que hoy no entran (ver `lib/apiConnector.ts`).
 *
 * El importe sugerido tampoco es un cálculo de Kelly: Kelly necesita una ventaja
 * medible contra el precio del mercado. Lo que hay aquí es un plan de stakes
 * proporcional a la confianza, que es lo honesto con los datos disponibles.
 */

export type EstadoApuesta = "pendiente" | "ganada" | "perdida";

export interface Apuesta {
  /** partidoId + mercado: estable entre recargas y filtros. */
  id: string;
  partido: string;
  mercado: string;
  confianza: number;
  cuota: number;
  importe: number;
  estado: EstadoApuesta;
}

export interface CicloCerrado {
  numero: number;
  inicial: number;
  final: number;
  apuestas: number;
}

export interface EstadoBanca {
  bancaInicial: number;
  /** Porcentaje de la banca que arriesga una apuesta de confianza media. */
  riesgoBase: number;
  apuestas: Apuesta[];
  ciclo: number;
  historial: CicloCerrado[];
}

export const BANCA_INICIAL: EstadoBanca = {
  bancaInicial: 1000,
  riesgoBase: 3,
  apuestas: [],
  ciclo: 1,
  historial: [],
};

/** Banda de confianza que produce el analista. */
const CONFIANZA_MINIMA = 75;
const CONFIANZA_MAXIMA = 95;

/**
 * Escala el stake según la confianza: la lectura más floja arriesga un 60% del
 * riesgo base y la más firme un 140%. Lineal a propósito, para que se pueda
 * seguir a mano.
 */
export function escalaPorConfianza(confianza: number): number {
  const posicion = Math.min(
    Math.max((confianza - CONFIANZA_MINIMA) / (CONFIANZA_MAXIMA - CONFIANZA_MINIMA), 0),
    1,
  );
  return 0.6 + posicion * 0.8;
}

/** Importe sugerido para una recomendación, redondeado a dos decimales. */
export function importeSugerido(
  banca: number,
  riesgoBase: number,
  confianza: number,
): number {
  const bruto = banca * (riesgoBase / 100) * escalaPorConfianza(confianza);
  return Math.round(bruto * 100) / 100;
}

/** Lo que aporta una apuesta al balance: 0 mientras siga pendiente. */
export function resultadoDe(apuesta: Apuesta): number {
  if (apuesta.estado === "ganada") return apuesta.importe * (apuesta.cuota - 1);
  if (apuesta.estado === "perdida") return -apuesta.importe;
  return 0;
}

export interface ResumenBanca {
  balance: number;
  ganado: number;
  perdido: number;
  expuesto: number;
  ganadas: number;
  perdidas: number;
  pendientes: number;
  /** Diferencia con la banca inicial del ciclo. */
  variacion: number;
  variacionPorcentual: number;
}

export function resumir(estado: EstadoBanca): ResumenBanca {
  let ganado = 0;
  let perdido = 0;
  let expuesto = 0;
  let ganadas = 0;
  let perdidas = 0;
  let pendientes = 0;

  for (const apuesta of estado.apuestas) {
    if (apuesta.estado === "ganada") {
      ganado += resultadoDe(apuesta);
      ganadas++;
    } else if (apuesta.estado === "perdida") {
      perdido += apuesta.importe;
      perdidas++;
    } else {
      expuesto += apuesta.importe;
      pendientes++;
    }
  }

  const variacion = ganado - perdido;
  return {
    balance: estado.bancaInicial + variacion,
    ganado,
    perdido,
    expuesto,
    ganadas,
    perdidas,
    pendientes,
    variacion,
    variacionPorcentual:
      estado.bancaInicial > 0 ? (variacion / estado.bancaInicial) * 100 : 0,
  };
}

/**
 * Cierra el ciclo: archiva lo hecho, arranca el siguiente con el balance como
 * nueva banca base y deja la mesa limpia. Las apuestas pendientes se pierden de
 * vista, así que la interfaz debe avisar antes de llamar aquí.
 */
export function cerrarCiclo(estado: EstadoBanca): EstadoBanca {
  const { balance } = resumir(estado);
  return {
    bancaInicial: Math.round(balance * 100) / 100,
    riesgoBase: estado.riesgoBase,
    apuestas: [],
    ciclo: estado.ciclo + 1,
    historial: [
      ...estado.historial,
      {
        numero: estado.ciclo,
        inicial: estado.bancaInicial,
        final: Math.round(balance * 100) / 100,
        apuestas: estado.apuestas.length,
      },
    ],
  };
}

/** Dinero con dos decimales fijos: evita depender del locale del navegador. */
export function dinero(n: number): string {
  const signo = n < 0 ? "-" : "";
  return `${signo}${Math.abs(n).toFixed(2)}`;
}
