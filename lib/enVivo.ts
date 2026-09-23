/**
 * Motor In-Play.
 *
 * A diferencia de `lib/analista.ts`, este sí corre en el navegador: tiene que
 * recalcularse cada vez que avanza el reloj. Sigue siendo determinista — el
 * mismo minuto produce siempre el mismo resultado —, así que el primer render
 * del cliente coincide con el del servidor y no hay desajuste de hidratación.
 *
 * Cómo se calcula una probabilidad en vivo:
 *   1. Si el contador ya superó la línea, el mercado está resuelto.
 *   2. Si no, se proyecta el ritmo actual al final del partido y se compara con
 *      la línea mediante una curva logística.
 *   3. Esa proyección se mezcla con la probabilidad previa en proporción a lo
 *      jugado: al minuto 5 manda la previa, al 85 manda lo que está pasando.
 *   4. Se suman los ajustes por eventos (una roja abre el partido, etc.).
 */

import {
  etiquetasEvento,
  type EventoVivo,
  type MercadoVivo,
  type PartidoVivo,
} from "@/data/enVivo";

export interface EstadoVivo {
  minuto: number;
  finalizado: boolean;
  /** Parte del partido ya jugada, de 0 a 1. */
  fraccion: number;
  marcador: { local: number; visitante: number };
  contadores: Record<string, number>;
  ocurridos: EventoVivo[];
  reloj: string;
}

/**
 * Nota táctica introducida a mano durante el partido desde el panel del módulo
 * In-Play. No sustituye al guion de eventos: se suma encima, con su intensidad,
 * para que quien está viendo el partido pueda corregir al motor en caliente.
 */
export interface NotaTactica {
  id: string;
  partidoId: string;
  texto: string;
  direccion: "a favor" | "en contra";
  /** Cuánto mueve la aguja, en puntos de probabilidad. */
  intensidad: number;
}

export interface AlertaVivo {
  partido: PartidoVivo;
  mercado: MercadoVivo;
  estado: EstadoVivo;
  /** Probabilidad ahora mismo, de 0 a 100. */
  probabilidad: number;
  /** Cuánto se movió respecto a la probabilidad previa, en puntos. */
  desplazamiento: number;
  /** Ritmo actual proyectado al final del partido. */
  proyeccion: number;
  /** Fiabilidad de la lectura en vivo, de 55 a 97. */
  confianza: number;
  resuelto: boolean;
  /**
   * La línea se rompió a favor: el contador ya superó el número y el mercado
   * queda ganado. Es el momento que el panel en vivo debe destacar.
   */
  lineaRota: boolean;
  /** Eventos ya ocurridos que empujan este mercado. */
  disparadores: string[];
  /** Notas tácticas introducidas a mano que tocan este mercado. */
  notas: NotaTactica[];
  razonamiento: string;
}

/** Movimiento mínimo, en puntos, para que un mercado merezca una alerta. */
export const UMBRAL_ALERTA = 8;

/** ¿Este mercado se movió lo suficiente como para ser una alerta de valor? */
export function esAlerta(a: AlertaVivo): boolean {
  return Math.abs(a.desplazamiento) >= UMBRAL_ALERTA;
}

function acotar(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function logistica(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function formatearReloj(partido: PartidoVivo, minuto: number, finalizado: boolean): string {
  if (finalizado) return "Final";
  if (partido.formatoReloj === "futbol") return `${minuto}'`;

  const porCuarto = partido.duracion / 4;
  const cuarto = Math.min(Math.ceil(minuto / porCuarto), 4);
  const restante = porCuarto - (minuto % porCuarto || porCuarto);
  return `${cuarto}C ${restante}:00`;
}

/**
 * Reparte el aporte de cada evento a lo largo del tramo que lo precede, en vez
 * de soltarlo de golpe en su minuto. Es lo que hace que la anotación de la NBA
 * suba de forma sostenida y la proyección no dé un diente de sierra.
 */
function acumularContinuo(partido: PartidoVivo, clave: string, minuto: number): number {
  let total = partido.base.contadores[clave] ?? 0;
  let anterior = partido.minutoInicial;

  for (const evento of partido.eventos) {
    const aporte = evento.contadores?.[clave];
    if (aporte === undefined) continue;

    const tramo = Math.max(evento.minuto - anterior, 1);
    total += aporte * acotar((minuto - anterior) / tramo, 0, 1);
    anterior = evento.minuto;
  }
  return total;
}

function marcadorContinuo(
  partido: PartidoVivo,
  lado: "local" | "visitante",
  minuto: number,
): number {
  let total = partido.base[lado];
  let anterior = partido.minutoInicial;

  for (const evento of partido.eventos) {
    const aporte =
      evento.marcador?.[lado] ?? (evento.equipo === lado ? (evento.puntos ?? 0) : 0);
    if (!aporte) continue;

    const tramo = Math.max(evento.minuto - anterior, 1);
    total += aporte * acotar((minuto - anterior) / tramo, 0, 1);
    anterior = evento.minuto;
  }
  return Math.round(total);
}

/** Aplica al marcador base todos los eventos cuyo minuto ya pasó. */
export function estadoEn(partido: PartidoVivo, minuto: number): EstadoVivo {
  const actual = Math.min(minuto, partido.duracion);
  const finalizado = actual >= partido.duracion;
  const continuo = (partido.continuos ?? []).length > 0;

  const marcador = { local: partido.base.local, visitante: partido.base.visitante };
  const contadores: Record<string, number> = { ...partido.base.contadores };
  const ocurridos: EventoVivo[] = [];

  for (const evento of partido.eventos) {
    if (evento.minuto > actual) continue;
    ocurridos.push(evento);

    if (evento.marcador) {
      marcador.local += evento.marcador.local;
      marcador.visitante += evento.marcador.visitante;
    } else if (evento.puntos && evento.equipo !== "ninguno") {
      marcador[evento.equipo] += evento.puntos;
    }
    for (const [clave, suma] of Object.entries(evento.contadores ?? {})) {
      contadores[clave] = (contadores[clave] ?? 0) + suma;
    }
  }

  // Los contadores continuos se recalculan interpolando, no a saltos.
  for (const clave of partido.continuos ?? []) {
    contadores[clave] = acumularContinuo(partido, clave, actual);
  }
  if (continuo && !finalizado) {
    marcador.local = marcadorContinuo(partido, "local", actual);
    marcador.visitante = marcadorContinuo(partido, "visitante", actual);
  }

  return {
    minuto: actual,
    finalizado,
    fraccion: acotar(actual / partido.duracion, 0.05, 1),
    marcador: { local: marcador.local, visitante: marcador.visitante },
    contadores,
    ocurridos,
    reloj: formatearReloj(partido, actual, finalizado),
  };
}

function ajustePorEventos(mercado: MercadoVivo, estado: EstadoVivo): number {
  if (!mercado.reaccion) return 0;
  return estado.ocurridos.reduce(
    (total, evento) => total + (mercado.reaccion?.[evento.tipo] ?? 0),
    0,
  );
}

function disparadoresDe(mercado: MercadoVivo, estado: EstadoVivo): string[] {
  if (!mercado.reaccion) return [];
  const vistos = new Set<string>();
  for (const evento of estado.ocurridos) {
    const peso = mercado.reaccion[evento.tipo];
    if (peso) vistos.add(`${etiquetasEvento[evento.tipo]} ${peso > 0 ? "+" : ""}${peso}`);
  }
  return [...vistos];
}

export function evaluarMercado(
  partido: PartidoVivo,
  mercado: MercadoVivo,
  minuto: number = partido.minutoInicial,
  notas: NotaTactica[] = [],
): AlertaVivo {
  const estado = estadoEn(partido, minuto);
  const suyas = notas.filter((n) => n.partidoId === partido.id);
  const acumulado = estado.contadores[mercado.contador] ?? 0;
  const proyeccion = acumulado / estado.fraccion;

  const superada = acumulado > mercado.linea;
  const resuelto = superada || estado.finalizado;

  let probabilidad: number;
  if (superada) {
    // El contador ya pasó la línea: el "más" está hecho y el "menos" perdido.
    probabilidad = mercado.sentido === "mas" ? 97 : 3;
  } else if (estado.finalizado) {
    probabilidad = mercado.sentido === "mas" ? 3 : 97;
  } else {
    const desdeProyeccion = logistica((proyeccion - mercado.linea) / mercado.escala);
    const orientada = mercado.sentido === "mas" ? desdeProyeccion : 1 - desdeProyeccion;
    // Lo jugado decide cuánto pesa lo que está pasando frente a la previa.
    const mezcla =
      (mercado.previa / 100) * (1 - estado.fraccion) + orientada * estado.fraccion;
    const ajusteNotas = suyas.reduce(
      (t, n) => t + (n.direccion === "a favor" ? n.intensidad : -n.intensidad),
      0,
    );
    probabilidad = acotar(
      mezcla * 100 + ajustePorEventos(mercado, estado) + ajusteNotas,
      3,
      97,
    );
  }

  const margen = Math.abs(probabilidad / 100 - 0.5) * 2;
  const confianza = resuelto
    ? 97
    : Math.round(55 + (estado.fraccion * 0.6 + margen * 0.4) * 42);

  return {
    partido,
    mercado,
    estado,
    probabilidad: Math.round(probabilidad),
    desplazamiento: Math.round(probabilidad - mercado.previa),
    proyeccion,
    confianza,
    resuelto,
    // "Más" con el contador por encima de la línea: ganado en firme.
    lineaRota: superada && mercado.sentido === "mas",
    disparadores: disparadoresDe(mercado, estado),
    notas: suyas,
    razonamiento: razonarEnVivo(mercado, estado, proyeccion, resuelto, superada),
  };
}

function razonarEnVivo(
  mercado: MercadoVivo,
  estado: EstadoVivo,
  proyeccion: number,
  resuelto: boolean,
  superada: boolean,
): string {
  // Los contadores continuos son fraccionarios por dentro; se enseñan enteros.
  const acumulado = Math.round(estado.contadores[mercado.contador] ?? 0);
  const unidad = mercado.contador === "puntos" || mercado.contador === "puntosLocal"
    ? "puntos"
    : mercado.contador;

  if (superada) {
    return `Ya van ${acumulado} ${unidad} y la línea estaba en ${mercado.linea}: el mercado está resuelto.`;
  }
  if (resuelto) {
    return `El partido terminó con ${acumulado} ${unidad} frente a una línea de ${mercado.linea}.`;
  }

  const frases: string[] = [];
  frases.push(
    `Van ${acumulado} ${unidad} en el minuto ${estado.minuto}; a este ritmo el partido cierra en ${proyeccion.toFixed(1)}, frente a una línea de ${mercado.linea}.`,
  );

  const distancia = proyeccion - mercado.linea;
  if (mercado.sentido === "mas") {
    frases.push(
      distancia > 0
        ? `La proyección va ${distancia.toFixed(1)} por encima de la línea.`
        : `La proyección se queda ${Math.abs(distancia).toFixed(1)} por debajo y quedan ${100 - Math.round(estado.fraccion * 100)}% del partido para recuperarlo.`,
    );
  } else {
    frases.push(
      distancia < 0
        ? `La proyección se queda ${Math.abs(distancia).toFixed(1)} por debajo de la línea, que es lo que pide el mercado.`
        : `La proyección ya supera la línea en ${distancia.toFixed(1)}: el mercado está en riesgo.`,
    );
  }

  const claves = estado.ocurridos.filter((e) => mercado.reaccion?.[e.tipo]);
  if (claves.length > 0) {
    frases.push(claves.map((e) => e.detalle).join(". ") + ".");
  }

  return frases.join(" ");
}

/** Todos los mercados de un partido, evaluados al minuto indicado. */
export function mercadosDe(
  partido: PartidoVivo,
  avance: number,
  notas: NotaTactica[] = [],
): AlertaVivo[] {
  return partido.mercados.map((mercado) =>
    evaluarMercado(partido, mercado, partido.minutoInicial + avance, notas),
  );
}

/**
 * Las alertas de valor: mercados que se han movido lo suficiente respecto a su
 * probabilidad previa como para que la línea de la casa pueda ir por detrás.
 */
export function alertasDe(
  partido: PartidoVivo,
  avance: number,
  notas: NotaTactica[] = [],
): AlertaVivo[] {
  return porRelevancia(partido, avance, notas).filter(esAlerta);
}

/**
 * Todos los mercados ordenados por cuánto se han movido. La tarjeta pinta
 * siempre los mismos dos huecos y solo cambia si están marcados como alerta:
 * si añadiera y quitara bloques, la tarjeta cambiaría de alto y empujaría la
 * página mientras alguien hace scroll.
 */
export function porRelevancia(
  partido: PartidoVivo,
  avance: number,
  notas: NotaTactica[] = [],
): AlertaVivo[] {
  return mercadosDe(partido, avance, notas).sort(
    (a, b) => Math.abs(b.desplazamiento) - Math.abs(a.desplazamiento),
  );
}

export function totalDeAlertas(
  partidos: PartidoVivo[],
  avance: number,
  notas: NotaTactica[] = [],
): number {
  return partidos.reduce((suma, p) => suma + alertasDe(p, avance, notas).length, 0);
}

/** Cuántas líneas se han roto a favor ahora mismo. */
export function lineasRotas(
  partidos: PartidoVivo[],
  avance: number,
  notas: NotaTactica[] = [],
): number {
  return partidos.reduce(
    (suma, p) => suma + mercadosDe(p, avance, notas).filter((a) => a.lineaRota).length,
    0,
  );
}
