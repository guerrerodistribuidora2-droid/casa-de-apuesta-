/**
 * Motor de recomendaciones del tablero.
 *
 * No hay ningún modelo de lenguaje ni llamada externa: es un sistema de reglas
 * determinista que puntúa cada lectura con las métricas que ya vivían en
 * `data/mockData.ts` (frecuencia, racha, muestra y divergencia con el modelo).
 * Para los mismos datos devuelve siempre el mismo resultado, así que puede
 * ejecutarse en el servidor durante el prerender sin sorpresas.
 */

import {
  cuotaJusta,
  disciplinas,
  divergencia,
  filtros,
  fuerza,
  partidos as partidosLocales,
  rachaActual,
  tasaDeAcierto,
  type DisciplinaId,
  type Lectura,
  type Partido,
} from "@/data/mockData";
import {
  efectosSobre,
  empujeNeto,
  valorDelContexto,
  type EfectoFactor,
} from "@/lib/factores";

export interface Factor {
  /** Nombre legible del factor, tal y como se muestra en la interfaz. */
  nombre: string;
  /** Cuánto pesa dentro del puntaje final. Los pesos suman 1. */
  peso: number;
  /** Valor normalizado entre 0 y 1. */
  valor: number;
  /** El dato crudo que produjo ese valor. */
  detalle: string;
}

export interface Recomendacion {
  partido: Partido;
  lectura: Lectura;
  /** Puntaje crudo de 0 a 100. Es el que ordena las recomendaciones. */
  puntaje: number;
  /** El puntaje llevado a la banda de presentación de 75 a 95. */
  confianza: number;
  factores: Factor[];
  /** Párrafo construido a partir de los datos del partido. */
  razonamiento: string;
  /** Cifras sueltas que sostienen el razonamiento. */
  senales: string[];
  /** Qué factores medidos mueven esta lectura y cuánto. */
  efectos: EfectoFactor[];
  /** Desplazamiento neto que aportan, en puntos de probabilidad. */
  empujeContexto: number;
}

/** Puntaje crudo mínimo para que una lectura pueda recomendarse. */
const UMBRAL = 55;

function acotar(valor: number, minimo: number, maximo: number): number {
  return Math.min(Math.max(valor, minimo), maximo);
}

/** Lleva un valor de su rango real a una escala de 0 a 1. */
function normalizar(valor: number, minimo: number, maximo: number): number {
  return acotar((valor - minimo) / (maximo - minimo), 0, 1);
}

function detalleDelContexto(partido: Partido, lectura: Lectura): string {
  const efectos = efectosSobre(partido, lectura);
  if (efectos.length === 0) return "Sin factores medidos";

  const neto = empujeNeto(partido, lectura);
  const signo = neto > 0 ? "+" : "";
  return `${efectos.length} ${efectos.length === 1 ? "factor" : "factores"}, ${signo}${neto} pts`;
}

/**
 * Descompone una lectura en los seis factores que definen su confiabilidad.
 * Mantener los pesos visibles permite explicar el puntaje en la interfaz en
 * lugar de presentarlo como una caja negra.
 */
export function factoresDe(partido: Partido, lectura: Lectura): Factor[] {
  const tasa = tasaDeAcierto(lectura);
  const brecha = Math.abs(divergencia(lectura));
  const racha = rachaActual(lectura.historial);

  // La racha se centra en 0.5: cumplirse seguido suma, fallar seguido resta.
  const inercia = racha.cumplida
    ? 0.5 + 0.5 * normalizar(racha.largo, 1, 5)
    : 0.5 - 0.5 * normalizar(racha.largo, 1, 4);

  return [
    {
      nombre: "Respaldo histórico",
      peso: 0.25,
      // Sin muestra propia (partido real recién incorporado) el factor queda
      // neutro: no hay frecuencia que lo respalde, pero tampoco que lo
      // contradiga. Puntuarlo en 0 castigaría al partido por no tener aún
      // historial, que no es lo mismo que tener un mal historial.
      valor: lectura.frecuencia.muestra === 0 ? 0.5 : normalizar(tasa, 45, 85),
      detalle:
        lectura.frecuencia.muestra === 0
          ? "Sin historial propio todavía"
          : `${lectura.frecuencia.exitos} de ${lectura.frecuencia.muestra} (${tasa.toFixed(0)}%)`,
    },
    {
      nombre: "Convicción del modelo",
      peso: 0.21,
      valor: normalizar(lectura.probabilidad, 45, 85),
      detalle: `${lectura.probabilidad}% estimado`,
    },
    {
      nombre: "Coherencia",
      peso: 0.18,
      valor: 1 - acotar(brecha / 18, 0, 1),
      detalle: `${brecha.toFixed(1)} pts de distancia`,
    },
    {
      nombre: "Contexto del partido",
      peso: 0.12,
      valor: valorDelContexto(partido, lectura),
      detalle: detalleDelContexto(partido, lectura),
    },
    {
      nombre: "Solidez de la muestra",
      peso: 0.12,
      valor: lectura.frecuencia.muestra === 0 ? 0.5 : normalizar(lectura.frecuencia.muestra, 14, 30),
      detalle:
        lectura.frecuencia.muestra === 0
          ? "Sin muestra todavía"
          : `${lectura.frecuencia.muestra} encuentros`,
    },
    {
      nombre: "Inercia reciente",
      peso: 0.12,
      valor: inercia,
      detalle: racha.cumplida
        ? `${racha.largo} seguidos cumpliéndose`
        : `${racha.largo} seguidos sin cumplirse`,
    },
  ];
}

/** Suma ponderada de los factores, de 0 a 100. */
export function puntajeDe(partido: Partido, lectura: Lectura): number {
  const bruto = factoresDe(partido, lectura).reduce(
    (total, factor) => total + factor.peso * factor.valor,
    0,
  );
  return bruto * 100;
}

/**
 * Traslada el puntaje crudo a la banda de confianza que se muestra al usuario.
 *
 * En la práctica las lecturas que superan el umbral puntúan entre 60 y 90, así
 * que la banda se ancla a ese tramo real: si se escalara sobre 0-100 todas las
 * finalistas saldrían en torno al 90 y el orden dejaría de leerse. Es una escala
 * de presentación para las seleccionadas, no una probabilidad.
 */
const PUNTAJE_MINIMO_VISIBLE = 60;
const PUNTAJE_MAXIMO_VISIBLE = 90;

export function confianzaDe(partido: Partido, lectura: Lectura): number {
  const posicion = normalizar(
    puntajeDe(partido, lectura),
    PUNTAJE_MINIMO_VISIBLE,
    PUNTAJE_MAXIMO_VISIBLE,
  );
  return Math.round(75 + posicion * 20);
}

function triunfos(competidor: Partido["local"]): number {
  return competidor.forma.filter((r) => r === "ganó").length;
}

/** Construye el párrafo de razonamiento a partir de los datos del partido. */
function razonar(partido: Partido, lectura: Lectura): string {
  const tasa = tasaDeAcierto(lectura);
  const brecha = divergencia(lectura);
  const racha = rachaActual(lectura.historial);
  const { exitos, muestra } = lectura.frecuencia;

  const frases: string[] = [];

  // 1. De dónde sale la frecuencia.
  const base = `${lectura.mercado} se cumplió en ${exitos} de ${muestra} encuentros (${tasa.toFixed(0)}%)`;
  if (tasa >= 75) {
    frases.push(`${base}, una base amplia para este mercado.`);
  } else if (tasa >= 65) {
    frases.push(`${base}, por encima de lo que exige la línea.`);
  } else {
    frases.push(`${base}, un respaldo ajustado pero sostenido.`);
  }

  // 2. Qué dice la racha vigente.
  if (racha.cumplida && racha.largo >= 3) {
    frases.push(`Encadena ${racha.largo} apariciones seguidas, la tendencia está viva.`);
  } else if (racha.cumplida) {
    frases.push(
      racha.largo === 1
        ? "Se cumplió en el encuentro más reciente."
        : "Se cumplió en los dos encuentros más recientes.",
    );
  } else {
    frases.push(
      `Lleva ${racha.largo} sin cumplirse, lo que suele abaratar la línea sin romper la tendencia de fondo.`,
    );
  }

  // 3. Con qué forma llegan los dos competidores.
  const gl = triunfos(partido.local);
  const gv = triunfos(partido.visitante);
  frases.push(
    `${partido.local.nombre} llega con ${gl} ${gl === 1 ? "triunfo" : "triunfos"} en sus últimos cinco y ${partido.visitante.nombre} con ${gv}.`,
  );

  // 4. Qué aportan los factores medidos sobre este mercado concreto. El texto
  //    cita la medición, no un adjetivo: es lo que permite auditar el puntaje.
  const efectos = efectosSobre(partido, lectura);
  const aFavor = efectos.filter((e) => e.puntos > 0);
  const enContra = efectos.filter((e) => e.puntos < 0);
  const neto = empujeNeto(partido, lectura);

  // Se cita el factor dominante y el saldo; el desglose completo, con su
  // solidez, lo enseña el panel de al lado. Repetirlo aquí sería decir dos
  // veces lo mismo en la misma pantalla.
  const dominante = efectos[0];
  if (dominante) {
    const resto = efectos.length - 1;
    const contrapeso =
      resto > 0 && enContra.length > 0 && aFavor.length > 0
        ? `, con ${resto === 1 ? "otro factor" : `otros ${resto} factores`} tirando en ambos sentidos`
        : resto > 0
          ? `, más ${resto === 1 ? "otro factor" : `otros ${resto} factores`} en la misma dirección`
          : "";
    frases.push(
      `Pesa sobre todo ${dominante.fuente.toLowerCase()}: ${dominante.detalle} (${dominante.puntos > 0 ? "+" : ""}${dominante.puntos} puntos)${contrapeso}. El saldo de los factores medidos es de ${neto > 0 ? "+" : ""}${neto} puntos sobre lo que dice la frecuencia sola.`,
    );
  }

  // 5. Dónde queda el modelo respecto al historial.
  if (brecha <= -4) {
    frases.push(
      `El modelo se queda ${Math.abs(brecha).toFixed(1)} puntos por debajo de la frecuencia observada, así que la cuota justa de ${cuotaJusta(lectura).toFixed(2)} aún deja margen.`,
    );
  } else if (brecha >= 4) {
    frases.push(
      `El modelo va ${brecha.toFixed(1)} puntos por encima de la frecuencia observada: la estimación es más optimista que el historial.`,
    );
  } else {
    frases.push(
      `Modelo e historial coinciden dentro de ${Math.abs(brecha).toFixed(1)} puntos, sin señales contradictorias.`,
    );
  }

  return frases.join(" ");
}

function senalesDe(partido: Partido, lectura: Lectura): string[] {
  const racha = rachaActual(lectura.historial);
  return [
    `${tasaDeAcierto(lectura).toFixed(0)}% histórico`,
    racha.cumplida ? `Racha de ${racha.largo}` : `${racha.largo} en contra`,
    `Muestra de ${lectura.frecuencia.muestra}`,
    `Cuota justa ${cuotaJusta(lectura).toFixed(2)}`,
    // Un distintivo por cada factor medido que toca este mercado.
    ...efectosSobre(partido, lectura).map(
      (e) => `${e.fuente} ${e.puntos > 0 ? "+" : ""}${e.puntos}`,
    ),
  ];
}

function evaluar(partido: Partido, lectura: Lectura): Recomendacion {
  return {
    partido,
    lectura,
    puntaje: puntajeDe(partido, lectura),
    confianza: confianzaDe(partido, lectura),
    factores: factoresDe(partido, lectura),
    razonamiento: razonar(partido, lectura),
    senales: senalesDe(partido, lectura),
    efectos: efectosSobre(partido, lectura),
    empujeContexto: empujeNeto(partido, lectura),
  };
}

/**
 * Recorre todas las lecturas del día, descarta las débiles y devuelve las que
 * superan el umbral ordenadas por puntaje. Como mucho una lectura por partido,
 * para no llenar la lista con tres mercados del mismo encuentro.
 *
 * Devuelve la lista completa a propósito: el tablero la filtra por disciplina
 * en el navegador sin necesidad de volver a puntuar nada.
 */
export function recomendaciones(
  partidos: Partido[] = partidosLocales,
): Recomendacion[] {
  const candidatas = partidos.flatMap((partido) =>
    partido.lecturas
      .filter((lectura) => fuerza(lectura) !== "débil")
      .map((lectura) => evaluar(partido, lectura)),
  );

  const mejorPorPartido = new Map<string, Recomendacion>();
  for (const candidata of candidatas) {
    if (candidata.puntaje < UMBRAL) continue;
    const previa = mejorPorPartido.get(candidata.partido.id);
    if (!previa || candidata.puntaje > previa.puntaje) {
      mejorPorPartido.set(candidata.partido.id, candidata);
    }
  }

  return [...mejorPorPartido.values()].sort((a, b) => b.puntaje - a.puntaje);
}

export function mejoresApuestas(
  cantidad = 3,
  partidos: Partido[] = partidosLocales,
): Recomendacion[] {
  return recomendaciones(partidos).slice(0, cantidad);
}

export interface Alcance {
  total: number;
  evaluadas: number;
  partidos: number;
}

/** Cuántas lecturas se revisaron, dentro de las disciplinas indicadas. */
export function alcanceDelAnalisis(
  ids: DisciplinaId[] = disciplinas.map((d) => d.id),
  partidos: Partido[] = partidosLocales,
): Alcance {
  const enAlcance = partidos.filter((p) => ids.includes(p.disciplina));
  const total = enAlcance.reduce((suma, p) => suma + p.lecturas.length, 0);
  const descartadas = enAlcance.reduce(
    (suma, p) => suma + p.lecturas.filter((l) => fuerza(l) === "débil").length,
    0,
  );
  return { total, evaluadas: total - descartadas, partidos: enAlcance.length };
}

/**
 * El alcance precalculado para cada pestaña del filtro. Se resuelve en el
 * servidor y viaja como un puñado de números, de forma que el cliente no
 * necesita importar el motor para cambiar de disciplina.
 */
export function alcancePorFiltro(
  partidos: Partido[] = partidosLocales,
): Record<string, Alcance> {
  return Object.fromEntries(
    filtros.map((filtro) => [
      filtro.id,
      alcanceDelAnalisis(
        filtro.disciplinas.length > 0 ? filtro.disciplinas : undefined,
        partidos,
      ),
    ]),
  );
}
