/**
 * Motor multifactorial.
 *
 * Convierte las mediciones de `Contexto` en un desplazamiento de probabilidad,
 * en puntos y con signo. Antes cada nota traía un `peso` escrito a mano; ahora
 * el peso se deriva de datos comparables (el árbitro contra la media de SU
 * liga, los días de descanso, la cuota de producción del lesionado).
 *
 * Dos ideas sostienen el módulo:
 *
 *   1. **Los factores apuntan a familias de mercado, no a nombres.** Un árbitro
 *      tarjetero mueve la familia `tarjetas` sea cual sea el texto del mercado.
 *   2. **El signo depende del deporte.** La fatiga abre un partido de fútbol
 *      (más goles) pero hunde la anotación en la NBA, donde un back-to-back baja
 *      el ritmo y el acierto. Tratar ambos casos igual sería el error fácil.
 *
 * Es matemática pura sobre los datos, sin dependencias: puede ejecutarse igual
 * en el servidor que en el navegador. La selección y el ranking siguen viviendo
 * en `lib/analista.ts`, que sí es solo de servidor.
 */

import type {
  BajaClave,
  CargaCalendario,
  Contexto,
  DinamicaTactica,
  FamiliaMercado,
  FaseJuego,
  Lectura,
  Partido,
  PerfilArbitro,
  RolClave,
  RotacionPlantel,
} from "@/data/mockData";

export interface EfectoFactor {
  /** Familia del factor, tal y como se muestra. */
  fuente: string;
  /** La medición concreta que lo produjo. */
  detalle: string;
  /** Desplazamiento en puntos de probabilidad, con signo ya orientado al mercado. */
  puntos: number;
  /** Cuánta confianza merece la relación, de 0 a 1. */
  solidez: number;
}

/** Puntos de contexto que saturan el factor en el motor de recomendaciones. */
export const SATURACION = 20;

/**
 * Cuánto pesa un factor acumulativo según la fase que cubra el mercado.
 *
 * La fatiga y las tarjetas no se reparten por igual a lo largo del partido: se
 * acumulan. Un mercado del primer cuarto apenas las nota; uno del último las
 * sufre enteras. Aplicar el mismo coeficiente a todas las fases era el error que
 * hacía que un back-to-back pareciera afectar al salto inicial.
 */
const PESO_POR_FASE: Record<FaseJuego, number> = {
  completo: 1,
  "primera-parte": 0.5,
  "segunda-parte": 1.45,
  "primer-cuarto": 0.45,
  "segundo-cuarto": 0.8,
  "ultimo-cuarto": 1.5,
};

function pesoFase(lectura: Lectura): number {
  return PESO_POR_FASE[lectura.fase ?? "completo"];
}

function redondear(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Orienta un empuje "hacia arriba" según el sentido del mercado. Un factor que
 * sube los goles ayuda a "Más de 2.5" y perjudica a "Menos de 2.5".
 */
function orientar(empuje: number, lectura: Lectura): number {
  if (lectura.sentido === "menos") return -empuje;
  return empuje;
}

/* Árbitro ------------------------------------------------------------------- */

function efectoArbitro(a: PerfilArbitro, lectura: Lectura): EfectoFactor | null {
  const excesoTarjetas = a.tarjetasPorPartido - a.tarjetasMediaLiga;
  const excesoFaltas = a.faltasPorPartido - a.faltasMediaLiga;

  if (lectura.familia === "tarjetas") {
    // Cada amonestación de exceso sobre la media de su liga vale ~7 puntos.
    // Las tarjetas se acumulan: pesan más en la segunda parte que en la primera.
    const empuje = (excesoTarjetas * 7 + a.expulsionesUltimos10 * 1.4) * pesoFase(lectura);
    return {
      fuente: "Árbitro",
      detalle: `${a.tarjetasPorPartido} tarjetas por partido frente a ${a.tarjetasMediaLiga} de media de la liga`,
      puntos: redondear(orientar(empuje, lectura)),
      solidez: 0.85,
    };
  }

  // Un colegiado que deja jugar corta menos: partido más continuo y más abierto.
  if (lectura.familia === "goles" || lectura.familia === "corners") {
    const empuje = (-excesoFaltas / 10) * (lectura.familia === "goles" ? 3 : 2);
    if (Math.abs(empuje) < 0.5) return null;
    return {
      fuente: "Árbitro",
      detalle: `${a.faltasPorPartido} faltas señaladas por partido frente a ${a.faltasMediaLiga} de media`,
      puntos: redondear(orientar(empuje, lectura)),
      solidez: 0.4,
    };
  }

  return null;
}

/* Calendario y fatiga -------------------------------------------------------- */

/** Días de descanso que se consideran normales en cada deporte. */
const DESCANSO_NORMAL: Partial<Record<FamiliaMercado, number>> = {
  puntos: 2,
  goles: 4,
  tarjetas: 4,
  corners: 4,
  juegos: 2,
  asaltos: 4,
  mapas: 2,
};

function cargaAcumulada(c: CargaCalendario, familia: FamiliaMercado): number {
  const normal = DESCANSO_NORMAL[familia] ?? 3;
  const deficit = Math.max(0, normal - c.diasDescanso);
  const congestion = Math.max(0, c.partidosEn14Dias - 5);

  let carga = deficit * 2.2 + congestion * 1.8;
  if (c.backToBack) carga += 4;
  if (c.dobleCompetencia) carga += 2;
  if (c.viaje === "largo") carga += 1.5;
  return carga;
}

function efectoCalendario(
  c: CargaCalendario,
  lado: string,
  lectura: Lectura,
): EfectoFactor | null {
  const carga = cargaAcumulada(c, lectura.familia);
  if (carga <= 0) return null;

  // Si la carga la arrastran los dos, el efecto no se reparte: se suma.
  const escala = lado === "ambos" ? 1.6 : 1;

  // El signo es lo que distingue un deporte de otro.
  const direccion: Partial<Record<FamiliaMercado, number>> = {
    goles: 0.9, // piernas cansadas abren el partido en el tramo final
    tarjetas: 0.5, // se llega tarde y se corta con falta
    corners: 0.3,
    puntos: -1, // NBA: el back-to-back hunde ritmo y porcentajes
    juegos: -0.8, // el cansado no alarga el partido
    asaltos: -0.7,
    mapas: 0.3,
  };

  const coeficiente = direccion[lectura.familia];
  if (coeficiente === undefined) return null;

  // La fatiga se manifiesta al final, no en el arranque.
  const empuje = carga * coeficiente * escala * pesoFase(lectura);
  if (Math.abs(empuje) < 0.5) return null;

  const piezas = [`${c.diasDescanso} días de descanso`, `${c.partidosEn14Dias} partidos en 14 días`];
  if (c.backToBack) piezas.push("back-to-back");
  if (c.dobleCompetencia) piezas.push("doble competencia");
  if (c.viaje === "largo") piezas.push("viaje largo");

  return {
    fuente: "Calendario",
    detalle: piezas.join(", "),
    puntos: redondear(orientar(empuje, lectura)),
    solidez: 0.6,
  };
}

/* Lesiones ------------------------------------------------------------------- */

/**
 * Cuánto mueve cada rol a cada familia, en puntos por unidad de magnitud.
 * Perder al creador baja los goles del equipo; perder al central los sube.
 */
const EFECTO_ROL: Record<RolClave, Partial<Record<FamiliaMercado, number>>> = {
  creador: { goles: -12, corners: -4 },
  finalizador: { goles: -10 },
  defensa: { goles: 13, tarjetas: 3.5, corners: 2 },
  portero: { goles: 9 },
  base: { puntos: -8 },
  reboteador: { puntos: 9 },
  anotador: { puntos: -11 },
};

const NOMBRE_ROL: Record<RolClave, string> = {
  creador: "creador de juego",
  finalizador: "finalizador",
  defensa: "defensa titular",
  portero: "portero titular",
  base: "base titular",
  reboteador: "reboteador principal",
  anotador: "principal anotador",
};

function efectoLesion(b: BajaClave, lectura: Lectura): EfectoFactor | null {
  const base = EFECTO_ROL[b.rol]?.[lectura.familia];
  if (base === undefined) return null;

  const magnitud =
    b.cuotaProduccion * (b.titular ? 1 : 0.55) * (b.reemplazoDebil ? 1.25 : 1);
  const empuje = base * magnitud;
  if (Math.abs(empuje) < 0.5) return null;

  return {
    fuente: "Bajas",
    detalle: `Sin su ${NOMBRE_ROL[b.rol]}, que aporta el ${Math.round(b.cuotaProduccion * 100)}% de su faceta${b.reemplazoDebil ? ", con relevo por debajo" : ""}`,
    puntos: redondear(orientar(empuje, lectura)),
    solidez: 0.7,
  };
}

/* Rotación ------------------------------------------------------------------- */

function efectoRotacion(r: RotacionPlantel, lectura: Lectura): EfectoFactor | null {
  // Rotar debilita al equipo: más goles en contra y partidos más descosidos.
  const direccion: Partial<Record<FamiliaMercado, number>> = {
    goles: 3.2,
    puntos: 2.4,
    tarjetas: 1.2,
    mapas: 2.5,
    asaltos: 1.5,
  };
  const coeficiente = direccion[lectura.familia];
  if (coeficiente === undefined) return null;

  const empuje = r.titularesQueDescansan * coeficiente;
  if (Math.abs(empuje) < 0.5) return null;

  return {
    fuente: "Rotación",
    detalle: `${r.titularesQueDescansan} ${r.titularesQueDescansan === 1 ? "titular" : "titulares"} fuera del once: ${r.motivo.toLowerCase()}`,
    puntos: redondear(orientar(empuje, lectura)),
    solidez: 0.5,
  };
}

/* Táctica por fases ---------------------------------------------------------- */

/** Cuánto traduce un desvío de reparto por fases a puntos, según la familia. */
const SENSIBILIDAD_FASE: Partial<Record<FamiliaMercado, number>> = {
  goles: 90,
  tarjetas: 70,
  corners: 60,
  puntos: 80,
  resultado: 55,
};

/**
 * Compara cómo reparte el equipo su producción entre fases frente a la media de
 * su liga. Solo actúa sobre mercados de esa misma fase: un desvío en la segunda
 * parte no dice nada del primer cuarto.
 */
function efectoTactica(d: DinamicaTactica, lectura: Lectura): EfectoFactor | null {
  const fase = lectura.fase ?? "completo";
  if (fase !== d.fase) return null;

  const coeficiente = SENSIBILIDAD_FASE[lectura.familia];
  if (coeficiente === undefined) return null;

  const desvio = d.cuotaFase - d.cuotaFaseMediaLiga;
  let empuje = desvio * coeficiente;

  const piezas = [
    `${Math.round(d.cuotaFase * 100)}% de su producción en esta fase frente al ${Math.round(d.cuotaFaseMediaLiga * 100)}% de media`,
  ];

  // Remontar exige cambiar el planteamiento: se suma sobre el reparto base.
  if (d.remontadas && d.remontadas.intentos > 0) {
    const tasa = d.remontadas.logradas / d.remontadas.intentos;
    empuje += (tasa - 0.25) * 22;
    piezas.push(
      `remontó ${d.remontadas.logradas} de ${d.remontadas.intentos} veces yendo por detrás al descanso`,
    );
  }
  if (d.cambiosDeEsquema && d.cambiosDeEsquema > 0) {
    empuje += d.cambiosDeEsquema * 1.1;
    piezas.push(`${d.cambiosDeEsquema} cambios de esquema al descanso en la muestra`);
  }

  if (Math.abs(empuje) < 0.5) return null;

  return {
    fuente: "Táctica",
    detalle: piezas.join(", "),
    puntos: redondear(orientar(empuje, lectura)),
    solidez: 0.65,
  };
}

/* Agregación ----------------------------------------------------------------- */

/**
 * Cuánto se recorta la solidez de un factor deducido de un titular.
 *
 * Un perfil arbitral medido y una baja inferida de una cabecera de periódico no
 * merecen el mismo crédito: lo segundo puede estar mal leído, exagerado o
 * referirse a otro partido. Se le deja algo menos de la mitad del peso, y la
 * interfaz marca su procedencia para que se pueda comprobar la fuente.
 */
const DESCUENTO_POR_NOTICIA = 0.45;

function efectoDe(contexto: Contexto, lectura: Lectura): EfectoFactor | null {
  const bruto = efectoCrudo(contexto, lectura);
  if (!bruto) return null;
  if (contexto.origen !== "noticia") return bruto;

  return {
    ...bruto,
    solidez: bruto.solidez * DESCUENTO_POR_NOTICIA,
    detalle: `${bruto.detalle} · deducido de prensa${contexto.fuente ? ` (${contexto.fuente.medio})` : ""}`,
  };
}

function efectoCrudo(contexto: Contexto, lectura: Lectura): EfectoFactor | null {
  switch (contexto.tipo) {
    case "arbitro":
      return efectoArbitro(contexto.arbitro, lectura);
    case "calendario":
      return efectoCalendario(contexto.carga, contexto.lado, lectura);
    case "lesiones":
      return efectoLesion(contexto.baja, lectura);
    case "plantel":
      return efectoRotacion(contexto.rotacion, lectura);
    case "tactica":
      return efectoTactica(contexto.dinamica, lectura);
    case "nota":
      return null;
  }
}

/** Todos los factores medibles que empujan esta lectura, de mayor a menor. */
export function efectosSobre(partido: Partido, lectura: Lectura): EfectoFactor[] {
  return (partido.contexto ?? [])
    .map((c) => efectoDe(c, lectura))
    .filter((e): e is EfectoFactor => e !== null)
    .sort((a, b) => Math.abs(b.puntos) - Math.abs(a.puntos));
}

/** Desplazamiento neto en puntos, ya descontado por la solidez de cada factor. */
export function empujeNeto(partido: Partido, lectura: Lectura): number {
  return redondear(
    efectosSobre(partido, lectura).reduce((t, e) => t + e.puntos * e.solidez, 0),
  );
}

/**
 * El empuje neto llevado a la escala de 0 a 1 que consume el motor de
 * recomendaciones. Sin factores registrados queda neutro en 0.5: una lectura
 * sin noticia detrás no se premia ni se castiga.
 */
export function valorDelContexto(partido: Partido, lectura: Lectura): number {
  const neto = empujeNeto(partido, lectura);
  return Math.min(Math.max(0.5 + neto / (SATURACION * 2), 0), 1);
}

/** Los contextos del partido que realmente mueven esta lectura. */
export function contextosQueAfectan(partido: Partido, lectura: Lectura): Contexto[] {
  return (partido.contexto ?? []).filter((c) => efectoDe(c, lectura) !== null);
}
