/**
 * Partidos en curso para el módulo In-Play.
 *
 * El estado de un partido NO se guarda: se deriva aplicando al marcador base
 * todos los eventos cuyo minuto ya pasó. Así el reloj puede avanzar y el motor
 * recalcula marcador, contadores y probabilidades sin que haya dos versiones de
 * la verdad. Los eventos posteriores al minuto inicial son un guion simulado.
 */

import type { DisciplinaId } from "./mockData";

export type TipoEventoVivo =
  | "gol"
  | "roja"
  | "amarilla"
  | "penal"
  | "lesion"
  | "parcial"
  | "corner";

export const etiquetasEvento: Record<TipoEventoVivo, string> = {
  gol: "Gol",
  roja: "Roja",
  amarilla: "Amarilla",
  penal: "Penal",
  lesion: "Lesión",
  parcial: "Parcial",
  corner: "Córners",
};

/** Cómo se nombra cada contador en la interfaz. Sin entrada, no se muestra. */
export const etiquetasContador: Record<string, string> = {
  goles: "Goles",
  tarjetas: "Tarjetas",
  corners: "Córners",
  puntos: "Puntos",
};

export interface EventoVivo {
  minuto: number;
  tipo: TipoEventoVivo;
  equipo: "local" | "visitante" | "ninguno";
  detalle: string;
  /** Cuánto suma al marcador del equipo indicado. */
  puntos?: number;
  /** Alternativa a `puntos` cuando el evento mueve el marcador de los dos. */
  marcador?: { local: number; visitante: number };
  /** Cuánto suma a cada contador del partido. */
  contadores?: Record<string, number>;
}

export interface MercadoVivo {
  mercado: string;
  /** Probabilidad con la que abrió el mercado antes del pitido inicial. */
  previa: number;
  /** Contador del partido que decide este mercado. */
  contador: string;
  linea: number;
  sentido: "mas" | "menos";
  /** Cuántas unidades del contador marcan una diferencia clara. Ajusta la curva. */
  escala: number;
  /** Puntos porcentuales que suma o resta cada evento de ese tipo ya ocurrido. */
  reaccion?: Partial<Record<TipoEventoVivo, number>>;
}

export interface PartidoVivo {
  id: string;
  disciplina: DisciplinaId;
  torneo: string;
  local: { nombre: string; clave: string };
  visitante: { nombre: string; clave: string };
  /** Minuto en el que arranca la ventana simulada. */
  minutoInicial: number;
  /** Duración reglamentaria en minutos. */
  duracion: number;
  formatoReloj: "futbol" | "cuartos";
  /**
   * Contadores que se acumulan de forma continua y no a saltos. Los puntos de
   * baloncesto caen sin parar, así que entre evento y evento se interpolan: sin
   * esto la proyección se desplomaría cada minuto sin anotación y volvería a
   * dispararse en el siguiente parcial.
   */
  continuos?: string[];
  /** Marcador y contadores acumulados hasta `minutoInicial`. */
  base: {
    local: number;
    visitante: number;
    contadores: Record<string, number>;
  };
  /** Guion de eventos a partir del minuto inicial. */
  eventos: EventoVivo[];
  mercados: MercadoVivo[];
}

export const partidosEnVivo: PartidoVivo[] = [
  {
    id: "vivo-ucl-atm-ars",
    disciplina: "champions",
    torneo: "Champions League, fase liga",
    local: { nombre: "Atlético de Madrid", clave: "ATM" },
    visitante: { nombre: "Arsenal", clave: "ARS" },
    minutoInicial: 58,
    duracion: 90,
    formatoReloj: "futbol",
    base: { local: 1, visitante: 1, contadores: { goles: 2, tarjetas: 4, corners: 6 } },
    eventos: [
      {
        minuto: 61,
        tipo: "amarilla",
        equipo: "visitante",
        detalle: "Amarilla al pivote del Arsenal por cortar una contra",
        contadores: { tarjetas: 1 },
      },
      {
        minuto: 64,
        tipo: "roja",
        equipo: "local",
        detalle: "Segunda amarilla al lateral izquierdo: el Atlético se queda con diez",
        contadores: { tarjetas: 1 },
      },
      {
        minuto: 69,
        tipo: "gol",
        equipo: "visitante",
        detalle: "Arsenal aprovecha la superioridad y se pone por delante",
        puntos: 1,
        contadores: { goles: 1 },
      },
      {
        minuto: 73,
        tipo: "corner",
        equipo: "visitante",
        detalle: "Tres córners seguidos del Arsenal con el Atlético encerrado",
        contadores: { corners: 3 },
      },
      {
        minuto: 79,
        tipo: "amarilla",
        equipo: "local",
        detalle: "Amarilla al central por protestar",
        contadores: { tarjetas: 1 },
      },
      {
        minuto: 86,
        tipo: "gol",
        equipo: "local",
        detalle: "Cabezazo en el segundo palo: empate con uno menos",
        puntos: 1,
        contadores: { goles: 1 },
      },
    ],
    mercados: [
      {
        mercado: "Más de 2.5 goles",
        previa: 62,
        contador: "goles",
        linea: 2.5,
        sentido: "mas",
        escala: 1,
        reaccion: { roja: 7, penal: 8 },
      },
      {
        mercado: "Más de 5.5 tarjetas",
        previa: 55,
        contador: "tarjetas",
        linea: 5.5,
        sentido: "mas",
        escala: 1.3,
        reaccion: { roja: 10 },
      },
      {
        mercado: "Más de 9.5 córners",
        previa: 58,
        contador: "corners",
        linea: 9.5,
        sentido: "mas",
        escala: 2,
        reaccion: { roja: 5 },
      },
    ],
  },
  {
    id: "vivo-pl-tot-mun",
    disciplina: "premier",
    torneo: "Premier League, jornada 12",
    local: { nombre: "Tottenham", clave: "TOT" },
    visitante: { nombre: "Manchester United", clave: "MUN" },
    minutoInicial: 34,
    duracion: 90,
    formatoReloj: "futbol",
    base: { local: 0, visitante: 1, contadores: { goles: 1, tarjetas: 2, corners: 4 } },
    eventos: [
      {
        minuto: 38,
        tipo: "amarilla",
        equipo: "local",
        detalle: "Amarilla al mediocentro del Tottenham tras una entrada tardía",
        contadores: { tarjetas: 1 },
      },
      {
        minuto: 45,
        tipo: "gol",
        equipo: "local",
        detalle: "Empate del Tottenham al filo del descanso",
        puntos: 1,
        contadores: { goles: 1 },
      },
      {
        minuto: 52,
        tipo: "corner",
        equipo: "local",
        detalle: "Dos córners consecutivos tras el saque de centro",
        contadores: { corners: 2 },
      },
      {
        minuto: 58,
        tipo: "penal",
        equipo: "visitante",
        detalle: "El VAR señala penal a favor del United",
        contadores: {},
      },
      {
        minuto: 59,
        tipo: "gol",
        equipo: "visitante",
        detalle: "Gol desde los once metros",
        puntos: 1,
        contadores: { goles: 1 },
      },
      {
        minuto: 67,
        tipo: "lesion",
        equipo: "local",
        detalle: "Se retira lesionado el central del Tottenham sin cambios disponibles en defensa",
        contadores: {},
      },
      {
        minuto: 77,
        tipo: "amarilla",
        equipo: "visitante",
        detalle: "Amarilla por perder tiempo",
        contadores: { tarjetas: 1 },
      },
    ],
    mercados: [
      {
        mercado: "Más de 2.5 goles",
        previa: 58,
        contador: "goles",
        linea: 2.5,
        sentido: "mas",
        escala: 1,
        reaccion: { penal: 7, lesion: 4 },
      },
      {
        mercado: "Menos de 3.5 tarjetas",
        previa: 60,
        contador: "tarjetas",
        linea: 3.5,
        sentido: "menos",
        escala: 1.2,
      },
      {
        mercado: "Más de 8.5 córners",
        previa: 56,
        contador: "corners",
        linea: 8.5,
        sentido: "mas",
        escala: 2,
      },
    ],
  },
  {
    id: "vivo-nba-phx-sac",
    disciplina: "nba",
    torneo: "NBA, temporada regular",
    local: { nombre: "Phoenix Suns", clave: "PHX" },
    visitante: { nombre: "Sacramento Kings", clave: "SAC" },
    minutoInicial: 26,
    duracion: 48,
    formatoReloj: "cuartos",
    base: {
      local: 68,
      visitante: 64,
      contadores: { puntos: 132, puntosLocal: 68 },
    },
    eventos: [
      {
        minuto: 29,
        tipo: "parcial",
        equipo: "local",
        detalle: "Parcial de 11-6 de Phoenix con cuatro triples seguidos",
        marcador: { local: 11, visitante: 6 },
        contadores: { puntos: 17, puntosLocal: 11 },
      },
      {
        minuto: 33,
        tipo: "parcial",
        equipo: "visitante",
        detalle: "Sacramento responde con un 11-9 corriendo la cancha",
        marcador: { local: 9, visitante: 11 },
        contadores: { puntos: 20, puntosLocal: 9 },
      },
      {
        minuto: 37,
        tipo: "parcial",
        equipo: "local",
        detalle: "11-8 de Phoenix para abrir el último cuarto",
        marcador: { local: 11, visitante: 8 },
        contadores: { puntos: 19, puntosLocal: 11 },
      },
      {
        minuto: 41,
        tipo: "parcial",
        equipo: "visitante",
        detalle: "Intercambio de golpes sin defensa: 12-10 en cuatro minutos",
        marcador: { local: 12, visitante: 10 },
        contadores: { puntos: 22, puntosLocal: 12 },
      },
      {
        minuto: 45,
        tipo: "parcial",
        equipo: "local",
        detalle: "10-8 y el partido ya va camino de superar el total previsto",
        marcador: { local: 10, visitante: 8 },
        contadores: { puntos: 18, puntosLocal: 10 },
      },
      {
        minuto: 48,
        tipo: "parcial",
        equipo: "visitante",
        detalle: "7-5 en el tramo final con los banquillos ya en pista",
        marcador: { local: 7, visitante: 5 },
        contadores: { puntos: 12, puntosLocal: 7 },
      },
    ],
    continuos: ["puntos", "puntosLocal"],
    mercados: [
      {
        mercado: "Más de 229.5 puntos",
        previa: 64,
        contador: "puntos",
        linea: 229.5,
        sentido: "mas",
        escala: 9,
      },
      {
        mercado: "Más de 118.5 puntos de Phoenix",
        previa: 57,
        contador: "puntosLocal",
        linea: 118.5,
        sentido: "mas",
        escala: 6,
      },
    ],
  },
  {
    id: "vivo-lmx-tol-san",
    disciplina: "liga-mx",
    torneo: "Liga MX, jornada 10",
    local: { nombre: "Toluca", clave: "TOL" },
    visitante: { nombre: "Santos Laguna", clave: "SAN" },
    minutoInicial: 71,
    duracion: 90,
    formatoReloj: "futbol",
    base: { local: 2, visitante: 0, contadores: { goles: 2, tarjetas: 5, corners: 8 } },
    eventos: [
      {
        minuto: 74,
        tipo: "amarilla",
        equipo: "visitante",
        detalle: "Amarilla al lateral de Santos tras una falta en el mediocampo",
        contadores: { tarjetas: 1 },
      },
      {
        minuto: 79,
        tipo: "roja",
        equipo: "visitante",
        detalle: "Roja directa por plancha: Santos termina con diez",
        contadores: { tarjetas: 1 },
      },
      {
        minuto: 84,
        tipo: "gol",
        equipo: "local",
        detalle: "Tercer gol del Toluca con el rival desarmado",
        puntos: 1,
        contadores: { goles: 1 },
      },
      {
        minuto: 88,
        tipo: "corner",
        equipo: "local",
        detalle: "Córner del Toluca buscando el cuarto",
        contadores: { corners: 1 },
      },
    ],
    mercados: [
      {
        mercado: "Menos de 3.5 goles",
        previa: 61,
        contador: "goles",
        linea: 3.5,
        sentido: "menos",
        escala: 1,
        reaccion: { roja: -6 },
      },
      {
        mercado: "Más de 6.5 tarjetas",
        previa: 52,
        contador: "tarjetas",
        linea: 6.5,
        sentido: "mas",
        escala: 1.3,
        reaccion: { roja: 9 },
      },
    ],
  },
];

/** El avance máximo que necesita la simulación para que todos los partidos acaben. */
export const CICLO_SIMULACION = Math.max(
  ...partidosEnVivo.map((p) => p.duracion - p.minutoInicial),
);
