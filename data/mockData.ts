/**
 * Datos simulados para maquetar la interfaz.
 *
 * Ninguna cifra corresponde a un registro real: son valores inventados para
 * probar el diseño mientras se conecta Supabase. Los clubes y organizaciones
 * usan nombres reales por familiaridad visual; los competidores individuales
 * (tenis y UFC) son ficticios a propósito.
 */

export type DisciplinaId =
  | "liga-mx"
  | "premier"
  | "champions"
  | "nba"
  | "tenis"
  | "ufc"
  | "lol"
  | "valorant";

export type Resultado = "ganó" | "perdió" | "empató";

export interface Disciplina {
  id: DisciplinaId;
  nombre: string;
  categoria: "Deporte" | "eSport";
  /** Color del canto de la tarjeta. Es el único uso de color por disciplina. */
  acento: string;
}

export interface Competidor {
  nombre: string;
  /** Clave corta para espacios reducidos. */
  clave: string;
  /** Últimos cinco resultados, del más antiguo al más reciente. */
  forma: Resultado[];
}

export type TipoContexto =
  | "lesiones"
  | "arbitro"
  | "plantel"
  | "calendario"
  | "tactica"
  | "nota";

export const etiquetasContexto: Record<TipoContexto, string> = {
  lesiones: "Bajas",
  arbitro: "Árbitro",
  plantel: "Plantel",
  calendario: "Calendario",
  tactica: "Táctica",
  nota: "Apunte",
};

/** Familia del mercado. Los factores apuntan a familias, no a nombres. */
export type FamiliaMercado =
  | "goles"
  | "tarjetas"
  | "corners"
  | "puntos"
  | "juegos"
  | "asaltos"
  | "mapas"
  | "resultado";

/** Hacia dónde empuja el mercado: "evento" es un sí/no sin línea. */
export type SentidoMercado = "mas" | "menos" | "evento";

/**
 * Tramo del partido que cubre el mercado. Importa porque los factores no pesan
 * igual en todas las fases: la fatiga se nota al final, no en el minuto diez, y
 * las tarjetas se acumulan en la segunda parte.
 */
export type FaseJuego =
  | "completo"
  | "primera-parte"
  | "segunda-parte"
  | "primer-cuarto"
  | "segundo-cuarto"
  | "ultimo-cuarto";

export const etiquetasFase: Record<FaseJuego, string> = {
  completo: "Partido completo",
  "primera-parte": "Primera parte",
  "segunda-parte": "Segunda parte",
  "primer-cuarto": "Primer cuarto",
  "segundo-cuarto": "Segundo cuarto",
  "ultimo-cuarto": "Último cuarto",
};

/**
 * Cómo se reparte la producción de un equipo entre fases, siempre contra la
 * media de su liga. Es lo que permite leer el planteamiento táctico: un equipo
 * que produce el 62% de sus goles tras el descanso cuando la media es el 50%
 * está cambiando algo en el vestuario.
 */
export interface DinamicaTactica {
  fase: FaseJuego;
  /** Parte de su producción que genera en esa fase, de 0 a 1. */
  cuotaFase: number;
  /** La misma cuota, promediada en su competición. */
  cuotaFaseMediaLiga: number;
  /** Cuántas veces remontó yendo por detrás al descanso. */
  remontadas?: { logradas: number; intentos: number };
  /** Cambios de esquema al descanso en la muestra analizada. */
  cambiosDeEsquema?: number;
}

export type Lado = "local" | "visitante" | "ambos";

/**
 * Perfil medido del colegiado designado, siempre contra la media de SU
 * competición: 4.8 tarjetas por partido significan cosas distintas en la
 * Premier y en la Liga MX.
 */
export interface PerfilArbitro {
  tarjetasPorPartido: number;
  tarjetasMediaLiga: number;
  faltasPorPartido: number;
  faltasMediaLiga: number;
  expulsionesUltimos10: number;
}

/** Carga de calendario de un equipo, en datos y no en adjetivos. */
export interface CargaCalendario {
  diasDescanso: number;
  partidosEn14Dias: number;
  /** NBA: segundo partido en noches consecutivas. */
  backToBack?: boolean;
  /** Europa: compagina liga y competición continental. */
  dobleCompetencia?: boolean;
  viaje?: "local" | "corto" | "largo";
}

export type RolClave =
  | "creador"
  | "finalizador"
  | "defensa"
  | "portero"
  | "base"
  | "reboteador"
  | "anotador";

/** Baja con peso medible: el rol decide el signo y la cuota, la magnitud. */
export interface BajaClave {
  rol: RolClave;
  /** Parte de la producción del equipo en su faceta, de 0 a 1. */
  cuotaProduccion: number;
  titular: boolean;
  /** El sustituto está claramente por debajo. */
  reemplazoDebil?: boolean;
}

export interface RotacionPlantel {
  titularesQueDescansan: number;
  motivo: string;
}

/** De dónde salió un contexto y con qué respaldo. */
export interface FuenteNoticia {
  titular: string;
  medio: string;
  url: string;
  /** ISO 8601. */
  fecha: string;
  /** Palabras que dispararon la clasificación, para poder auditarla. */
  coincidencias: string[];
}

interface ContextoBase {
  /** La nota tal y como se le muestra al usuario. */
  nota: string;
  /**
   * `medido` son datos comprobados a mano; `noticia` son inferencias de un
   * titular. La diferencia no es cosmética: `lib/factores.ts` recorta la solidez
   * de lo inferido, porque un titular no es una medición.
   */
  origen?: "medido" | "noticia";
  fuente?: FuenteNoticia;
}

/**
 * Factor cualitativo del partido. Cada variante carga la medición que el motor
 * necesita para ponderarla: no hay ningún `peso` escrito a mano.
 * `lib/factores.ts` es quien convierte estas mediciones en puntos.
 */
export type Contexto =
  | (ContextoBase & { tipo: "arbitro"; arbitro: PerfilArbitro })
  | (ContextoBase & { tipo: "calendario"; lado: Lado; carga: CargaCalendario })
  | (ContextoBase & { tipo: "lesiones"; lado: Lado; baja: BajaClave })
  | (ContextoBase & { tipo: "plantel"; lado: Lado; rotacion: RotacionPlantel })
  | (ContextoBase & { tipo: "tactica"; lado: Lado; dinamica: DinamicaTactica })
  | (ContextoBase & { tipo: "nota" });

export interface Lectura {
  /** Mercado analizado, escrito como lo leería un apostador. */
  mercado: string;
  /** Qué clase de mercado es. Los factores apuntan aquí, no al nombre. */
  familia: FamiliaMercado;
  /** Si el factor que sube la familia ayuda o perjudica a esta lectura. */
  sentido: SentidoMercado;
  /** Tramo que cubre. Sin declarar, el mercado abarca el partido entero. */
  fase?: FaseJuego;
  /**
   * La línea del mercado, cuando es de total. Explícita y no deducida del
   * nombre: es lo que permite emparejar con los `totals` de la API de cuotas.
   */
  linea?: number;
  /** Mejor cuota encontrada en el mercado real. La rellena `apiConnector`. */
  cuotaMercado?: number;
  /** Casa que ofrece esa cuota. */
  casaMercado?: string;
  /** Probabilidad estimada por el modelo, de 0 a 100. */
  probabilidad: number;
  /** Veces que el mercado se cumplió sobre el total de la muestra. */
  frecuencia: { exitos: number; muestra: number };
  /** Últimos diez desenlaces del mercado, del más antiguo al más reciente. */
  historial: boolean[];
  /** Qué sostiene la lectura, en una frase. */
  nota: string;
}

export interface Partido {
  id: string;
  disciplina: DisciplinaId;
  torneo: string;
  cuando: string;
  hora: string;
  local: Competidor;
  visitante: Competidor;
  lecturas: Lectura[];
  /** Factores cualitativos del encuentro. Opcional: no todo partido trae noticia. */
  contexto?: Contexto[];
  destacado?: boolean;
  /**
   * Estado real del encuentro, resuelto contra el endpoint `/scores` de The
   * Odds API. Sin resolver (falló la petición o no hay clave): queda `undefined`,
   * no se asume "no iniciado" a ciegas.
   */
  estado?: "no_iniciado" | "en_vivo" | "finalizado";
  /** Marcador real, solo cuando `estado` se pudo resolver y la API ya lo reportó. */
  marcadorReal?: { local: number; visitante: number };
}

/** Agrupación de disciplinas para la barra de filtros del tablero. */
export interface Filtro {
  id: string;
  etiqueta: string;
  /** Vacío significa todas las disciplinas. */
  disciplinas: DisciplinaId[];
}

export const filtros: Filtro[] = [
  { id: "todos", etiqueta: "Todos", disciplinas: [] },
  { id: "futbol", etiqueta: "Fútbol", disciplinas: ["liga-mx", "premier", "champions"] },
  { id: "nba", etiqueta: "NBA", disciplinas: ["nba"] },
  { id: "tenis", etiqueta: "Tenis", disciplinas: ["tenis"] },
  { id: "ufc", etiqueta: "UFC", disciplinas: ["ufc"] },
  { id: "esports", etiqueta: "eSports", disciplinas: ["lol", "valorant"] },
];

export const disciplinas: Disciplina[] = [
  { id: "liga-mx", nombre: "Liga MX", categoria: "Deporte", acento: "#3E8E6E" },
  { id: "premier", nombre: "Premier League", categoria: "Deporte", acento: "#7A5FA8" },
  { id: "champions", nombre: "Champions League", categoria: "Deporte", acento: "#8FA3B8" },
  { id: "nba", nombre: "NBA", categoria: "Deporte", acento: "#C4713C" },
  { id: "tenis", nombre: "Tenis", categoria: "Deporte", acento: "#AFAF4B" },
  { id: "ufc", nombre: "UFC", categoria: "Deporte", acento: "#A8453C" },
  { id: "lol", nombre: "League of Legends", categoria: "eSport", acento: "#4A7FB5" },
  { id: "valorant", nombre: "Valorant", categoria: "eSport", acento: "#B24A63" },
];

export const partidos: Partido[] = [
  {
    id: "lmx-tig-mty",
    disciplina: "liga-mx",
    torneo: "Liga MX, jornada 10",
    cuando: "Hoy",
    hora: "21:05",
    destacado: true,
    local: {
      nombre: "Tigres UANL",
      clave: "TIG",
      forma: ["ganó", "empató", "ganó", "ganó", "ganó"],
    },
    visitante: {
      nombre: "Monterrey",
      clave: "MTY",
      forma: ["ganó", "perdió", "ganó", "empató", "ganó"],
    },
    lecturas: [
      {
        mercado: "Más de 2.5 goles",
        linea: 2.5,
        familia: "goles",
        sentido: "mas",
        probabilidad: 78,
        frecuencia: { exitos: 19, muestra: 24 },
        historial: [true, true, false, true, true, true, false, true, true, true],
        nota: "Los últimos seis clásicos regios abrieron el marcador antes del minuto 25.",
      },
      {
        mercado: "Ambos equipos anotan",
        familia: "goles",
        sentido: "mas",
        probabilidad: 71,
        frecuencia: { exitos: 17, muestra: 24 },
        historial: [true, false, true, true, true, false, true, true, false, true],
        nota: "Monterrey marcó como visitante en nueve de sus últimas once salidas.",
      },
      {
        mercado: "Más de 9.5 tiros de esquina",
        linea: 9.5,
        familia: "corners",
        sentido: "mas",
        probabilidad: 54,
        frecuencia: { exitos: 13, muestra: 24 },
        historial: [false, true, true, false, false, true, true, false, true, false],
        nota: "Volumen alto de centros, pero muy repartido entre partidos.",
      },
      {
        mercado: "Más de 4.5 tarjetas",
        linea: 4.5,
        familia: "tarjetas",
        sentido: "mas",
        probabilidad: 66,
        frecuencia: { exitos: 15, muestra: 24 },
        historial: [true, true, false, true, true, false, true, true, true, false],
        nota: "El clásico regio acumula más faltas por partido que cualquier otro cruce del torneo.",
      },
      {
        mercado: "Más de 2.5 tarjetas en la segunda parte",
        linea: 2.5,
        familia: "tarjetas",
        sentido: "mas",
        fase: "segunda-parte",
        probabilidad: 67,
        frecuencia: { exitos: 16, muestra: 24 },
        historial: [true, true, false, true, true, false, true, true, true, true],
        nota: "El clásico regio se calienta tras el descanso: tres de cada cuatro amarillas llegan ahí.",
      },
    ],
    contexto: [
      {
        tipo: "tactica",
        lado: "ambos",
        nota: "El clásico regio se endurece tras el descanso: el 71% de las amonestaciones del cruce llegan en la segunda parte.",
        dinamica: {
          fase: "segunda-parte",
          cuotaFase: 0.71,
          cuotaFaseMediaLiga: 0.58,
          cambiosDeEsquema: 2,
        },
      },
      {
        tipo: "lesiones",
        lado: "visitante",
        nota: "Monterrey viaja sin su central titular, sancionado por acumulación de amarillas, y adelanta a un canterano de 19 años.",
        baja: { rol: "defensa", cuotaProduccion: 0.72, titular: true, reemplazoDebil: true },
      },
      {
        tipo: "arbitro",
        nota: "El colegiado designado promedia 5.8 amonestaciones por partido, el registro más alto del torneo.",
        arbitro: {
          tarjetasPorPartido: 5.8,
          tarjetasMediaLiga: 4.1,
          faltasPorPartido: 26.4,
          faltasMediaLiga: 23.8,
          expulsionesUltimos10: 2,
        },
      },
    ],
  },
  {
    id: "lmx-ame-czl",
    disciplina: "liga-mx",
    torneo: "Liga MX, jornada 10",
    cuando: "Hoy",
    hora: "19:00",
    local: {
      nombre: "América",
      clave: "AME",
      forma: ["ganó", "ganó", "ganó", "empató", "ganó"],
    },
    visitante: {
      nombre: "Cruz Azul",
      clave: "CAZ",
      forma: ["perdió", "ganó", "empató", "ganó", "perdió"],
    },
    lecturas: [
      {
        mercado: "Gana el local",
        familia: "resultado",
        sentido: "evento",
        probabilidad: 64,
        frecuencia: { exitos: 18, muestra: 28 },
        historial: [true, true, false, true, false, true, true, true, false, true],
        nota: "América lleva siete partidos sin perder en casa.",
      },
      {
        mercado: "Menos de 3.5 goles",
        linea: 3.5,
        familia: "goles",
        sentido: "menos",
        probabilidad: 69,
        frecuencia: { exitos: 20, muestra: 28 },
        historial: [true, true, true, false, true, true, false, true, true, true],
        nota: "Cruz Azul cierra líneas atrás cuando visita al líder.",
      },
    ],
    contexto: [
      {
        tipo: "nota",
        nota: "El colegiado designado no dirigía un clásico desde 2024 y llega sin tendencia reciente que analizar.",
      },
    ],
  },
  {
    id: "lmx-gdl-pum",
    disciplina: "liga-mx",
    torneo: "Liga MX, jornada 10",
    cuando: "Mañana",
    hora: "17:00",
    local: {
      nombre: "Guadalajara",
      clave: "GDL",
      forma: ["empató", "perdió", "ganó", "empató", "empató"],
    },
    visitante: {
      nombre: "Pumas UNAM",
      clave: "PUM",
      forma: ["ganó", "ganó", "perdió", "ganó", "empató"],
    },
    lecturas: [
      {
        mercado: "Empate al descanso",
        familia: "resultado",
        sentido: "evento",
        probabilidad: 47,
        frecuencia: { exitos: 11, muestra: 26 },
        historial: [true, false, true, true, false, false, true, false, true, false],
        nota: "Ambos arrancan lento: solo cinco goles combinados en primeros tiempos.",
      },
      {
        mercado: "Menos de 2.5 goles",
        linea: 2.5,
        familia: "goles",
        sentido: "menos",
        probabilidad: 61,
        frecuencia: { exitos: 16, muestra: 26 },
        historial: [true, true, false, true, true, true, false, true, false, true],
        nota: "Cuatro de los últimos cinco entre ambos cerraron con uno o cero goles.",
      },
      {
        mercado: "Más de 4.5 tarjetas",
        linea: 4.5,
        familia: "tarjetas",
        sentido: "mas",
        probabilidad: 70,
        frecuencia: { exitos: 19, muestra: 26 },
        historial: [true, false, true, false, true, true, false, true, true, true],
        nota: "Duelo de media tabla con mucho roce en el mediocampo y pocas pausas.",
      },
    ],
    contexto: [
      {
        tipo: "arbitro",
        nota: "Dirige el colegiado con más amonestaciones por noventa minutos del torneo: 6.1 de media y tres expulsiones en sus últimos cinco encuentros.",
        arbitro: {
          tarjetasPorPartido: 6.1,
          tarjetasMediaLiga: 4.1,
          faltasPorPartido: 28.9,
          faltasMediaLiga: 23.8,
          expulsionesUltimos10: 3,
        },
      },
      {
        tipo: "plantel",
        lado: "visitante",
        nota: "Pumas rota la defensa completa pensando en la vuelta de la copa y alinea a tres suplentes atrás.",
        rotacion: { titularesQueDescansan: 3, motivo: "Vuelta de copa entre semana" },
      },
    ],
  },
  {
    id: "pl-ars-mci",
    disciplina: "premier",
    torneo: "Premier League, jornada 12",
    cuando: "Hoy",
    hora: "12:30",
    local: {
      nombre: "Arsenal",
      clave: "ARS",
      forma: ["ganó", "ganó", "empató", "ganó", "ganó"],
    },
    visitante: {
      nombre: "Manchester City",
      clave: "MCI",
      forma: ["ganó", "perdió", "ganó", "ganó", "empató"],
    },
    lecturas: [
      {
        mercado: "Ambos equipos anotan",
        familia: "goles",
        sentido: "mas",
        probabilidad: 74,
        frecuencia: { exitos: 20, muestra: 26 },
        historial: [true, true, true, false, true, true, true, false, true, true],
        nota: "Ninguno de los dos ha dejado la portería a cero en sus últimos cinco enfrentamientos directos.",
      },
      {
        mercado: "Más de 2.5 goles",
        linea: 2.5,
        familia: "goles",
        sentido: "mas",
        probabilidad: 71,
        frecuencia: { exitos: 18, muestra: 26 },
        historial: [true, true, false, true, true, true, false, true, true, false],
        nota: "Los dos ataques con más ocasiones por partido de la liga se cruzan en el Emirates.",
      },
      {
        mercado: "Más de 9.5 tiros de esquina",
        linea: 9.5,
        familia: "corners",
        sentido: "mas",
        probabilidad: 63,
        frecuencia: { exitos: 16, muestra: 26 },
        historial: [false, true, true, false, true, false, true, true, false, true],
        nota: "City acumula córners por acoso posicional; Arsenal los busca en transiciones.",
      },
      {
        mercado: "Menos de 3.5 tarjetas",
        linea: 3.5,
        familia: "tarjetas",
        sentido: "menos",
        probabilidad: 62,
        frecuencia: { exitos: 16, muestra: 26 },
        historial: [true, false, true, true, false, true, false, true, true, true],
        nota: "Duelo de intensidad alta pero con pocas entradas a destiempo.",
      },
      {
        mercado: "Más de 5.5 tiros de esquina en la segunda parte",
        linea: 5.5,
        familia: "corners",
        sentido: "mas",
        fase: "segunda-parte",
        probabilidad: 64,
        frecuencia: { exitos: 17, muestra: 26 },
        historial: [true, true, false, true, true, true, false, false, true, true],
        nota: "City acumula córners cuando el rival se encierra en el tramo final.",
      },
    ],
    contexto: [
      {
        tipo: "tactica",
        lado: "visitante",
        nota: "City encierra al rival en el tramo final: el 63% de sus córners llegan tras el descanso, diez puntos sobre la media de la Premier.",
        dinamica: {
          fase: "segunda-parte",
          cuotaFase: 0.63,
          cuotaFaseMediaLiga: 0.53,
        },
      },
      {
        tipo: "lesiones",
        lado: "local",
        nota: "Arsenal pierde a su mediocentro defensivo por acumulación de amarillas y adelanta a un lateral reconvertido al eje.",
        baja: { rol: "defensa", cuotaProduccion: 0.64, titular: true, reemplazoDebil: true },
      },
      {
        tipo: "arbitro",
        nota: "El colegiado designado deja jugar más que ningún otro de la Premier: señala 18.4 faltas por partido, nueve por debajo de la media de la liga.",
        arbitro: {
          tarjetasPorPartido: 2.9,
          tarjetasMediaLiga: 4.3,
          faltasPorPartido: 18.4,
          faltasMediaLiga: 27.1,
          expulsionesUltimos10: 0,
        },
      },
    ],
  },
  {
    id: "pl-liv-che",
    disciplina: "premier",
    torneo: "Premier League, jornada 12",
    cuando: "Mañana",
    hora: "14:00",
    local: {
      nombre: "Liverpool",
      clave: "LIV",
      forma: ["ganó", "ganó", "perdió", "ganó", "ganó"],
    },
    visitante: {
      nombre: "Chelsea",
      clave: "CHE",
      forma: ["empató", "ganó", "ganó", "perdió", "ganó"],
    },
    lecturas: [
      {
        mercado: "Ambos equipos anotan",
        familia: "goles",
        sentido: "mas",
        probabilidad: 76,
        frecuencia: { exitos: 20, muestra: 25 },
        historial: [true, true, true, true, false, true, true, true, false, true],
        nota: "Chelsea ha marcado en sus nueve últimas visitas a un rival de la mitad alta.",
      },
      {
        mercado: "Más de 3.5 goles",
        linea: 3.5,
        familia: "goles",
        sentido: "mas",
        probabilidad: 58,
        frecuencia: { exitos: 14, muestra: 25 },
        historial: [true, false, true, false, false, true, true, false, true, false],
        nota: "Anfield promedia 3.4 goles por partido esta temporada, pero con mucha varianza.",
      },
      {
        mercado: "Más de 10.5 tiros de esquina",
        linea: 10.5,
        familia: "corners",
        sentido: "mas",
        probabilidad: 61,
        frecuencia: { exitos: 15, muestra: 25 },
        historial: [true, false, true, true, false, true, false, true, false, true],
        nota: "Liverpool es el equipo que más córners fuerza en el último tercio del partido.",
      },
      {
        mercado: "Más de 1.5 goles en la segunda parte",
        linea: 1.5,
        familia: "goles",
        sentido: "mas",
        fase: "segunda-parte",
        probabilidad: 68,
        frecuencia: { exitos: 17, muestra: 25 },
        historial: [true, true, true, false, true, false, true, true, true, false],
        nota: "Anfield empuja en el último tramo y Liverpool marca más después del minuto 60 que antes.",
      },
    ],
    contexto: [
      {
        tipo: "tactica",
        lado: "local",
        nota: "Liverpool aprieta tras el descanso con presión alta sostenida: el 61% de sus goles en casa llegan después del minuto 45.",
        dinamica: {
          fase: "segunda-parte",
          cuotaFase: 0.61,
          cuotaFaseMediaLiga: 0.53,
          remontadas: { logradas: 4, intentos: 7 },
          cambiosDeEsquema: 3,
        },
      },
      {
        tipo: "calendario",
        lado: "visitante",
        nota: "Chelsea jugó el jueves en Europa y llega a Anfield con tres días de descanso frente a los seis del local.",
        carga: {
          diasDescanso: 3,
          partidosEn14Dias: 5,
          dobleCompetencia: true,
          viaje: "corto",
        },
      },
      {
        tipo: "lesiones",
        lado: "local",
        nota: "Liverpool recupera a su delantero centro tras cinco semanas de baja, pero su creador sigue fuera otra jornada más.",
        baja: { rol: "creador", cuotaProduccion: 0.41, titular: true },
      },
    ],
  },
  {
    id: "pl-new-avl",
    disciplina: "premier",
    torneo: "Premier League, jornada 12",
    cuando: "Mañana",
    hora: "16:30",
    local: {
      nombre: "Newcastle United",
      clave: "NEW",
      forma: ["perdió", "ganó", "empató", "ganó", "perdió"],
    },
    visitante: {
      nombre: "Aston Villa",
      clave: "AVL",
      forma: ["ganó", "empató", "ganó", "perdió", "ganó"],
    },
    lecturas: [
      {
        mercado: "Más de 4.5 tarjetas",
        linea: 4.5,
        familia: "tarjetas",
        sentido: "mas",
        probabilidad: 68,
        frecuencia: { exitos: 17, muestra: 25 },
        historial: [true, true, false, true, true, true, false, true, true, true],
        nota: "Cruce con historial de roce: cuatro de los últimos cinco pasaron de las cinco amonestaciones.",
      },
      {
        mercado: "Menos de 2.5 goles",
        linea: 2.5,
        familia: "goles",
        sentido: "menos",
        probabilidad: 55,
        frecuencia: { exitos: 13, muestra: 25 },
        historial: [true, false, false, true, true, false, true, false, true, false],
        nota: "Dos equipos que cierran bien atrás, aunque St James Park suele abrirse en el tramo final.",
      },
    ],
    contexto: [
      {
        tipo: "arbitro",
        nota: "Dirige el colegiado con más amonestaciones por partido de la Premier esta temporada: 4.9 de media y dos expulsiones en sus últimos seis encuentros.",
        arbitro: {
          tarjetasPorPartido: 4.9,
          tarjetasMediaLiga: 4.3,
          faltasPorPartido: 29.6,
          faltasMediaLiga: 27.1,
          expulsionesUltimos10: 2,
        },
      },
      {
        tipo: "lesiones",
        lado: "local",
        nota: "Newcastle acumula cuatro bajas en defensa y alinea una zaga inédita esta temporada.",
        baja: { rol: "defensa", cuotaProduccion: 0.81, titular: true, reemplazoDebil: true },
      },
    ],
  },
  {
    id: "ucl-rma-bay",
    disciplina: "champions",
    torneo: "Champions League, fase liga",
    cuando: "Hoy",
    hora: "15:00",
    local: {
      nombre: "Real Madrid",
      clave: "RMA",
      forma: ["ganó", "ganó", "empató", "ganó", "ganó"],
    },
    visitante: {
      nombre: "Bayern München",
      clave: "BAY",
      forma: ["ganó", "ganó", "ganó", "perdió", "ganó"],
    },
    lecturas: [
      {
        mercado: "Más de 2.5 goles",
        linea: 2.5,
        familia: "goles",
        sentido: "mas",
        probabilidad: 79,
        frecuencia: { exitos: 21, muestra: 26 },
        historial: [true, true, false, true, true, false, true, true, true, true],
        nota: "Los últimos nueve cruces entre ambos en Europa terminaron con tres goles o más.",
      },
      {
        mercado: "Ambos equipos anotan",
        familia: "goles",
        sentido: "mas",
        probabilidad: 77,
        frecuencia: { exitos: 20, muestra: 26 },
        historial: [true, true, true, false, true, true, false, true, true, true],
        nota: "Ninguno ha dejado la portería a cero en eliminatorias desde hace dos temporadas.",
      },
      {
        mercado: "Más de 4.5 tarjetas",
        linea: 4.5,
        familia: "tarjetas",
        sentido: "mas",
        probabilidad: 64,
        frecuencia: { exitos: 16, muestra: 26 },
        historial: [true, false, true, true, false, true, true, false, true, true],
        nota: "El ritmo del partido obliga a cortar transiciones con falta táctica.",
      },
      {
        mercado: "Más de 9.5 tiros de esquina",
        linea: 9.5,
        familia: "corners",
        sentido: "mas",
        probabilidad: 60,
        frecuencia: { exitos: 15, muestra: 26 },
        historial: [false, true, true, false, true, false, true, true, false, true],
        nota: "Dos equipos que atacan por fuera y rematan mucho desde el segundo palo.",
      },
      {
        mercado: "Más de 1.5 goles en la segunda parte",
        linea: 1.5,
        familia: "goles",
        sentido: "mas",
        fase: "segunda-parte",
        probabilidad: 72,
        frecuencia: { exitos: 19, muestra: 26 },
        historial: [true, true, false, true, true, true, false, true, true, true],
        nota: "Los cruces entre ambos se rompen tras el descanso, cuando se abren los espacios.",
      },
      {
        mercado: "Más de 2.5 tarjetas en la segunda parte",
        linea: 2.5,
        familia: "tarjetas",
        sentido: "mas",
        fase: "segunda-parte",
        probabilidad: 63,
        frecuencia: { exitos: 16, muestra: 26 },
        historial: [true, false, true, true, false, true, true, true, false, true],
        nota: "La falta táctica aparece cuando el marcador aprieta y las piernas fallan.",
      },
    ],
    contexto: [
      {
        tipo: "tactica",
        lado: "local",
        nota: "Real Madrid vive de la segunda parte en Europa: ahí genera el 64% de sus goles y ha remontado seis de nueve eliminatorias yendo por detrás al descanso.",
        dinamica: {
          fase: "segunda-parte",
          cuotaFase: 0.64,
          cuotaFaseMediaLiga: 0.52,
          remontadas: { logradas: 6, intentos: 9 },
          cambiosDeEsquema: 4,
        },
      },
      {
        tipo: "plantel",
        lado: "visitante",
        nota: "Bayern rota tres piezas del centro del campo pensando en el clásico del sábado y deja a su pivote titular en el banquillo.",
        rotacion: { titularesQueDescansan: 3, motivo: "Clásico de liga el sábado" },
      },
      {
        tipo: "calendario",
        lado: "ambos",
        nota: "Los dos encadenan liga y Europa sin semana libre desde octubre.",
        carga: {
          diasDescanso: 3,
          partidosEn14Dias: 5,
          dobleCompetencia: true,
          viaje: "largo",
        },
      },
      {
        tipo: "arbitro",
        nota: "Arbitraje europeo estricto con la falta táctica: el colegiado designado sanciona un 22% más de infracciones en campo propio que la media continental.",
        arbitro: {
          tarjetasPorPartido: 5.1,
          tarjetasMediaLiga: 3.9,
          faltasPorPartido: 31.2,
          faltasMediaLiga: 25.6,
          expulsionesUltimos10: 1,
        },
      },
    ],
  },
  {
    id: "ucl-int-psg",
    disciplina: "champions",
    torneo: "Champions League, fase liga",
    cuando: "Mañana",
    hora: "15:00",
    local: {
      nombre: "Inter",
      clave: "INT",
      forma: ["ganó", "empató", "ganó", "ganó", "empató"],
    },
    visitante: {
      nombre: "Paris Saint-Germain",
      clave: "PSG",
      forma: ["ganó", "ganó", "perdió", "empató", "ganó"],
    },
    lecturas: [
      {
        mercado: "Menos de 2.5 goles",
        linea: 2.5,
        familia: "goles",
        sentido: "menos",
        probabilidad: 66,
        frecuencia: { exitos: 17, muestra: 24 },
        historial: [true, true, false, true, true, true, false, true, true, true],
        nota: "Inter concede menos de una ocasión clara por partido en casa desde octubre.",
      },
      {
        mercado: "Más de 4.5 tarjetas",
        linea: 4.5,
        familia: "tarjetas",
        sentido: "mas",
        probabilidad: 63,
        frecuencia: { exitos: 15, muestra: 24 },
        historial: [true, false, true, true, false, true, true, false, true, true],
        nota: "Partido de bloque bajo y contragolpe, el escenario donde más se corta con falta.",
      },
    ],
    contexto: [
      {
        tipo: "calendario",
        lado: "ambos",
        nota: "Ninguno de los dos rotó el fin de semana: es el cuarto partido en once días para ambas plantillas.",
        carga: {
          diasDescanso: 2,
          partidosEn14Dias: 6,
          dobleCompetencia: true,
          viaje: "corto",
        },
      },
      {
        tipo: "arbitro",
        nota: "El colegiado designado aplica el criterio europeo de falta táctica con mano dura y promedia 5.2 amonestaciones en lo que va de fase liga.",
        arbitro: {
          tarjetasPorPartido: 5.2,
          tarjetasMediaLiga: 3.9,
          faltasPorPartido: 29.8,
          faltasMediaLiga: 25.6,
          expulsionesUltimos10: 1,
        },
      },
    ],
  },
  {
    id: "ucl-bar-bvb",
    disciplina: "champions",
    torneo: "Champions League, fase liga",
    cuando: "Mañana",
    hora: "18:00",
    local: {
      nombre: "Barcelona",
      clave: "BAR",
      forma: ["ganó", "perdió", "ganó", "ganó", "ganó"],
    },
    visitante: {
      nombre: "Borussia Dortmund",
      clave: "BVB",
      forma: ["empató", "ganó", "perdió", "ganó", "perdió"],
    },
    lecturas: [
      {
        mercado: "Ambos equipos anotan",
        familia: "goles",
        sentido: "mas",
        probabilidad: 72,
        frecuencia: { exitos: 18, muestra: 23 },
        historial: [true, true, true, false, true, true, true, false, true, true],
        nota: "Dortmund marca fuera de casa con una regularidad que no acompaña a sus resultados.",
      },
      {
        mercado: "Más de 3.5 goles",
        linea: 3.5,
        familia: "goles",
        sentido: "mas",
        probabilidad: 67,
        frecuencia: { exitos: 16, muestra: 23 },
        historial: [true, true, false, true, true, false, true, true, true, false],
        nota: "La línea alta del Barça y la verticalidad del Dortmund dejan el partido abierto.",
      },
      {
        mercado: "Más de 10.5 tiros de esquina",
        linea: 10.5,
        familia: "corners",
        sentido: "mas",
        probabilidad: 58,
        frecuencia: { exitos: 13, muestra: 23 },
        historial: [false, true, true, false, true, false, true, true, false, true],
        nota: "Volumen alto de remates bloqueados que acaban en saque de esquina.",
      },
    ],
    contexto: [
      {
        tipo: "lesiones",
        lado: "visitante",
        nota: "Dortmund viaja sin sus dos centrales titulares y adelanta a un juvenil del filial que debuta en Europa.",
        baja: { rol: "defensa", cuotaProduccion: 0.88, titular: true, reemplazoDebil: true },
      },
      {
        tipo: "calendario",
        lado: "local",
        nota: "Barcelona encadena su tercer partido en siete días y el técnico ya anunció rotaciones en las bandas.",
        carga: {
          diasDescanso: 2,
          partidosEn14Dias: 6,
          dobleCompetencia: true,
          viaje: "local",
        },
      },
    ],
  },
  {
    id: "nba-den-min",
    disciplina: "nba",
    torneo: "NBA, temporada regular",
    cuando: "Hoy",
    hora: "20:30",
    local: {
      nombre: "Denver Nuggets",
      clave: "DEN",
      forma: ["ganó", "ganó", "perdió", "ganó", "ganó"],
    },
    visitante: {
      nombre: "Minnesota Timberwolves",
      clave: "MIN",
      forma: ["perdió", "ganó", "ganó", "perdió", "ganó"],
    },
    lecturas: [
      {
        mercado: "Más de 218.5 puntos",
        linea: 218.5,
        familia: "puntos",
        sentido: "mas",
        probabilidad: 73,
        frecuencia: { exitos: 22, muestra: 30 },
        historial: [true, true, true, false, true, true, true, false, true, true],
        nota: "Denver corre más desde el cambio de base titular: ritmo sobre 101 posesiones.",
      },
      {
        mercado: "El local gana el primer cuarto",
        familia: "resultado",
        sentido: "evento",
        probabilidad: 58,
        frecuencia: { exitos: 17, muestra: 30 },
        historial: [true, false, true, true, true, false, false, true, true, false],
        nota: "Arranques sólidos en casa, aunque con ventajas cortas.",
      },
      {
        mercado: "Más de 57.5 puntos en el primer cuarto",
        linea: 57.5,
        familia: "puntos",
        sentido: "mas",
        fase: "primer-cuarto",
        probabilidad: 61,
        frecuencia: { exitos: 18, muestra: 30 },
        historial: [true, false, true, true, false, true, true, false, true, true],
        nota: "Los dos salen a correr desde el salto inicial y el primer cuarto suele ser el más alto.",
      },
      {
        mercado: "Más de 116.5 puntos en la segunda parte",
        linea: 116.5,
        familia: "puntos",
        sentido: "mas",
        fase: "segunda-parte",
        probabilidad: 69,
        frecuencia: { exitos: 21, muestra: 30 },
        historial: [true, true, true, false, true, true, false, true, true, true],
        nota: "Denver abre el tercer cuarto con su quinteto más ofensivo desde el cambio de base.",
      },
    ],
    contexto: [
      {
        tipo: "tactica",
        lado: "local",
        nota: "Denver reparte su anotación hacia el final: abre el tercer cuarto con el quinteto más ofensivo y sostiene el ritmo hasta el cierre.",
        dinamica: {
          fase: "segunda-parte",
          cuotaFase: 0.55,
          cuotaFaseMediaLiga: 0.5,
        },
      },
      {
        tipo: "lesiones",
        lado: "visitante",
        nota: "Minnesota pierde a su pívot titular por esguince de tobillo: es su líder de rebote ofensivo y el ancla defensiva de la pintura.",
        baja: { rol: "reboteador", cuotaProduccion: 0.78, titular: true, reemplazoDebil: true },
      },
    ],
  },
  {
    id: "nba-bos-mia",
    disciplina: "nba",
    torneo: "NBA, temporada regular",
    cuando: "Hoy",
    hora: "18:00",
    local: {
      nombre: "Boston Celtics",
      clave: "BOS",
      forma: ["ganó", "ganó", "ganó", "ganó", "perdió"],
    },
    visitante: {
      nombre: "Miami Heat",
      clave: "MIA",
      forma: ["perdió", "perdió", "ganó", "perdió", "ganó"],
    },
    lecturas: [
      {
        mercado: "Boston gana por más de 7.5",
        familia: "resultado",
        sentido: "evento",
        probabilidad: 66,
        frecuencia: { exitos: 19, muestra: 29 },
        historial: [true, true, false, true, true, true, false, true, false, true],
        nota: "Diferencial medio de 11.4 puntos en casa ante rivales fuera de zona de playoffs.",
      },
      {
        mercado: "Más de 26.5 triples combinados",
        linea: 26.5,
        familia: "puntos",
        sentido: "mas",
        probabilidad: 69,
        frecuencia: { exitos: 20, muestra: 29 },
        historial: [true, true, true, true, false, true, false, true, true, true],
        nota: "Boston lanza 42 triples por noche y Miami lo sigue de cerca.",
      },
      {
        mercado: "Más de 59.5 puntos en el primer cuarto",
        linea: 59.5,
        familia: "puntos",
        sentido: "mas",
        fase: "primer-cuarto",
        probabilidad: 58,
        frecuencia: { exitos: 16, muestra: 29 },
        historial: [true, true, false, true, false, true, false, true, true, false],
        nota: "Boston arranca fuerte en casa, aunque Miami acostumbra a frenar el ritmo pronto.",
      },
      {
        mercado: "Más de 30.5 puntos en el último cuarto",
        linea: 30.5,
        familia: "puntos",
        sentido: "mas",
        fase: "ultimo-cuarto",
        probabilidad: 64,
        frecuencia: { exitos: 19, muestra: 29 },
        historial: [true, true, false, true, true, true, false, true, false, true],
        nota: "Los finales apretados alargan las posesiones con faltas y tiros libres.",
      },
    ],
    contexto: [
      {
        tipo: "tactica",
        lado: "local",
        nota: "Boston concentra su ventaja en el arranque: el 29% de sus puntos llegan en el primer cuarto, cuatro puntos por encima de la media de la liga.",
        dinamica: {
          fase: "primer-cuarto",
          cuotaFase: 0.29,
          cuotaFaseMediaLiga: 0.25,
        },
      },
      {
        tipo: "lesiones",
        lado: "visitante",
        nota: "Miami llega sin su base titular y reparte la dirección entre dos suplentes con poco rodaje.",
        baja: { rol: "base", cuotaProduccion: 0.69, titular: true, reemplazoDebil: true },
      },
      {
        tipo: "calendario",
        lado: "visitante",
        nota: "Segundo partido en noches consecutivas para Miami, que además cierra viaje largo por la costa este.",
        carga: {
          diasDescanso: 0,
          partidosEn14Dias: 8,
          backToBack: true,
          viaje: "largo",
        },
      },
    ],
  },
  {
    id: "ten-ruiz-halvorsen",
    disciplina: "tenis",
    torneo: "ATP 500, cuartos de final",
    cuando: "Hoy",
    hora: "13:30",
    local: {
      nombre: "Mateo Ruiz",
      clave: "RUI",
      forma: ["ganó", "ganó", "ganó", "perdió", "ganó"],
    },
    visitante: {
      nombre: "Erik Halvorsen",
      clave: "HAL",
      forma: ["ganó", "perdió", "ganó", "ganó", "perdió"],
    },
    lecturas: [
      {
        mercado: "Más de 22.5 juegos",
        linea: 22.5,
        familia: "juegos",
        sentido: "mas",
        probabilidad: 75,
        frecuencia: { exitos: 18, muestra: 23 },
        historial: [true, true, true, true, false, true, true, true, false, true],
        nota: "Dos sacadores potentes en pista rápida: siete de cada diez sets llegan al 5-4.",
      },
      {
        mercado: "Al menos un tie-break",
        familia: "juegos",
        sentido: "mas",
        probabilidad: 62,
        frecuencia: { exitos: 14, muestra: 23 },
        historial: [true, false, true, true, true, false, true, false, true, true],
        nota: "Ninguno ha cedido su saque en los últimos cuatro encuentros.",
      },
    ],
    contexto: [
      {
        tipo: "calendario",
        lado: "visitante",
        nota: "Halvorsen encadena dos partidos a cinco sets en cuatro días y pidió atención al fisioterapeuta en el último.",
        carga: { diasDescanso: 1, partidosEn14Dias: 7, viaje: "corto" },
      },
    ],
  },
  {
    id: "ten-navarro-kessler",
    disciplina: "tenis",
    torneo: "WTA 500, cuartos de final",
    cuando: "Mañana",
    hora: "11:00",
    local: {
      nombre: "Lucía Navarro",
      clave: "NAV",
      forma: ["ganó", "ganó", "perdió", "ganó", "ganó"],
    },
    visitante: {
      nombre: "Dana Kessler",
      clave: "KES",
      forma: ["perdió", "ganó", "ganó", "perdió", "perdió"],
    },
    lecturas: [
      {
        mercado: "Navarro gana 2-0",
        familia: "resultado",
        sentido: "evento",
        probabilidad: 57,
        frecuencia: { exitos: 12, muestra: 21 },
        historial: [true, true, false, true, false, true, false, true, true, false],
        nota: "Cierra rápido cuando quiebra primero, pero se alarga si pierde el set inicial.",
      },
      {
        mercado: "Menos de 21.5 juegos",
        linea: 21.5,
        familia: "juegos",
        sentido: "menos",
        probabilidad: 53,
        frecuencia: { exitos: 11, muestra: 21 },
        historial: [false, true, true, false, true, false, true, true, false, false],
        nota: "Muestra corta y muy repartida: la lectura se sostiene poco.",
      },
    ],
  },
  {
    id: "ufc-okafor-brennan",
    disciplina: "ufc",
    torneo: "UFC Fight Night, pelea estelar",
    cuando: "Mañana",
    hora: "22:00",
    local: {
      nombre: "Daniel Okafor",
      clave: "OKA",
      forma: ["ganó", "ganó", "ganó", "perdió", "ganó"],
    },
    visitante: {
      nombre: "Ryan Brennan",
      clave: "BRE",
      forma: ["ganó", "perdió", "ganó", "ganó", "ganó"],
    },
    lecturas: [
      {
        mercado: "No llega a decisión",
        familia: "asaltos",
        sentido: "menos",
        probabilidad: 68,
        frecuencia: { exitos: 15, muestra: 22 },
        historial: [true, true, false, true, true, true, false, true, true, false],
        nota: "Okafor cierra siete de cada diez peleas antes del cuarto asalto.",
      },
      {
        mercado: "Termina en el asalto 1 o 2",
        familia: "asaltos",
        sentido: "menos",
        probabilidad: 49,
        frecuencia: { exitos: 10, muestra: 22 },
        historial: [true, false, false, true, true, false, true, false, true, false],
        nota: "Ambos arrancan a alta intensidad, pero Brennan aguanta bien el primer asalto.",
      },
    ],
    contexto: [
      {
        tipo: "plantel",
        lado: "visitante",
        nota: "Brennan cambió de entrenador de lucha a seis semanas de la pelea y estrena esquina completa.",
        rotacion: { titularesQueDescansan: 1, motivo: "Esquina nueva sin rodaje" },
      },
      {
        tipo: "calendario",
        lado: "local",
        nota: "Okafor pelea por segunda vez en once semanas, su calendario más apretado desde que subió de categoría.",
        carga: { diasDescanso: 2, partidosEn14Dias: 6 },
      },
    ],
  },
  {
    id: "ufc-silveira-tanaka",
    disciplina: "ufc",
    torneo: "UFC Fight Night, coestelar",
    cuando: "Mañana",
    hora: "21:15",
    local: {
      nombre: "Bruno Silveira",
      clave: "SIL",
      forma: ["perdió", "ganó", "ganó", "ganó", "perdió"],
    },
    visitante: {
      nombre: "Kenji Tanaka",
      clave: "TAN",
      forma: ["ganó", "ganó", "perdió", "ganó", "ganó"],
    },
    lecturas: [
      {
        mercado: "Gana Tanaka",
        familia: "resultado",
        sentido: "evento",
        probabilidad: 61,
        frecuencia: { exitos: 13, muestra: 20 },
        historial: [true, true, false, true, true, false, true, false, true, true],
        nota: "Mejor defensa de derribo del cartel: neutraliza el plan de Silveira.",
      },
      {
        mercado: "Más de 1.5 asaltos",
        linea: 1.5,
        familia: "asaltos",
        sentido: "mas",
        probabilidad: 72,
        frecuencia: { exitos: 16, muestra: 20 },
        historial: [true, true, true, false, true, true, true, false, true, true],
        nota: "Solo una de las últimas diez peleas de ambos acabó en el primer asalto.",
      },
    ],
    contexto: [
      {
        tipo: "nota",
        nota: "Tanaka firma la mejor defensa de derribo del cartel y neutraliza el plan de Silveira.",
      },
    ],
  },
  {
    id: "lol-t1-geng",
    disciplina: "lol",
    torneo: "LCK, jornada 6",
    cuando: "Hoy",
    hora: "06:00",
    local: {
      nombre: "T1",
      clave: "T1",
      forma: ["ganó", "ganó", "perdió", "ganó", "ganó"],
    },
    visitante: {
      nombre: "Gen.G",
      clave: "GEN",
      forma: ["ganó", "ganó", "ganó", "perdió", "ganó"],
    },
    lecturas: [
      {
        mercado: "Más de 2.5 mapas",
        linea: 2.5,
        familia: "mapas",
        sentido: "mas",
        probabilidad: 70,
        frecuencia: { exitos: 14, muestra: 20 },
        historial: [true, true, false, true, true, true, true, false, true, true],
        nota: "Seis de sus últimas ocho series entre ellos llegaron al mapa decisivo.",
      },
      {
        mercado: "Primer dragón para T1",
        familia: "resultado",
        sentido: "evento",
        probabilidad: 59,
        frecuencia: { exitos: 12, muestra: 20 },
        historial: [true, false, true, true, false, true, true, false, true, false],
        nota: "Prioridad constante en la calle inferior durante los primeros diez minutos.",
      },
    ],
    contexto: [
      {
        tipo: "plantel",
        lado: "visitante",
        nota: "Gen.G estrena jungla titular tras el traspaso de la semana pasada: es su primera serie oficial con la alineación nueva.",
        rotacion: { titularesQueDescansan: 1, motivo: "Traspaso reciente en la jungla" },
      },
    ],
  },
  {
    id: "lol-g2-fnc",
    disciplina: "lol",
    torneo: "LEC, jornada 6",
    cuando: "Hoy",
    hora: "11:00",
    local: {
      nombre: "G2 Esports",
      clave: "G2",
      forma: ["ganó", "perdió", "ganó", "ganó", "ganó"],
    },
    visitante: {
      nombre: "Fnatic",
      clave: "FNC",
      forma: ["perdió", "ganó", "perdió", "ganó", "perdió"],
    },
    lecturas: [
      {
        mercado: "G2 gana 2-0",
        familia: "resultado",
        sentido: "evento",
        probabilidad: 55,
        frecuencia: { exitos: 11, muestra: 20 },
        historial: [true, false, true, true, false, true, false, false, true, true],
        nota: "Domina el mapa temprano, pero Fnatic suele robar un mapa alargando la partida.",
      },
      {
        mercado: "Menos de 62.5 minutos totales",
        linea: 62.5,
        familia: "mapas",
        sentido: "menos",
        probabilidad: 64,
        frecuencia: { exitos: 13, muestra: 20 },
        historial: [true, true, true, false, true, false, true, true, false, true],
        nota: "Las series de G2 en casa promedian 29 minutos por mapa.",
      },
    ],
  },
  {
    id: "val-sen-loud",
    disciplina: "valorant",
    torneo: "VCT Americas, fase de grupos",
    cuando: "Mañana",
    hora: "15:00",
    local: {
      nombre: "Sentinels",
      clave: "SEN",
      forma: ["ganó", "perdió", "ganó", "ganó", "perdió"],
    },
    visitante: {
      nombre: "LOUD",
      clave: "LLL",
      forma: ["ganó", "ganó", "ganó", "perdió", "ganó"],
    },
    lecturas: [
      {
        mercado: "Más de 2.5 mapas",
        linea: 2.5,
        familia: "mapas",
        sentido: "mas",
        probabilidad: 67,
        frecuencia: { exitos: 12, muestra: 18 },
        historial: [true, true, true, false, true, false, true, true, true, false],
        nota: "Cinco de los últimos seis cruces se decidieron en el tercer mapa.",
      },
      {
        mercado: "Al menos un mapa a tiempo extra",
        familia: "mapas",
        sentido: "mas",
        probabilidad: 51,
        frecuencia: { exitos: 9, muestra: 18 },
        historial: [true, false, true, false, false, true, true, false, true, false],
        nota: "Rondas cerradas, aunque el desempate aparece menos de lo que parece.",
      },
    ],
    contexto: [
      {
        tipo: "calendario",
        lado: "visitante",
        nota: "LOUD juega su tercer mapa en dos días tras salir del repechaje.",
        carga: { diasDescanso: 0, partidosEn14Dias: 7 },
      },
    ],
  },
  {
    id: "val-fnc-prx",
    disciplina: "valorant",
    torneo: "VCT Masters, fase de grupos",
    cuando: "Mañana",
    hora: "12:30",
    local: {
      nombre: "Fnatic",
      clave: "FNC",
      forma: ["ganó", "ganó", "ganó", "ganó", "perdió"],
    },
    visitante: {
      nombre: "Paper Rex",
      clave: "PRX",
      forma: ["ganó", "perdió", "ganó", "ganó", "ganó"],
    },
    lecturas: [
      {
        mercado: "Más de 21.5 rondas en el mapa 1",
        linea: 21.5,
        familia: "mapas",
        sentido: "mas",
        probabilidad: 74,
        frecuencia: { exitos: 14, muestra: 19 },
        historial: [true, true, true, true, false, true, true, false, true, true],
        nota: "Paper Rex fuerza intercambios temprano y estira los mapas contra defensas lentas.",
      },
      {
        mercado: "Fnatic gana el mapa 1",
        familia: "resultado",
        sentido: "evento",
        probabilidad: 60,
        frecuencia: { exitos: 11, muestra: 19 },
        historial: [true, true, false, true, false, true, true, false, true, false],
        nota: "Mejor equipo del circuito eligiendo el primer mapa del veto.",
      },
    ],
  },
];

/* Métricas derivadas -------------------------------------------------------- */

/** Porcentaje real de veces que el mercado se cumplió en la muestra completa. */
export function tasaDeAcierto(lectura: Lectura): number {
  const { exitos, muestra } = lectura.frecuencia;
  return muestra === 0 ? 0 : (exitos / muestra) * 100;
}

/**
 * Distancia entre lo que estima el modelo y lo que dice el historial.
 * Positiva: el modelo va por delante de la frecuencia observada.
 *
 * Sin muestra (un partido real recién incorporado, todavía sin historial
 * propio) no hay nada que contradiga al modelo: la divergencia es 0, no la
 * probabilidad entera. Devolver "probabilidad - 0" trataría la ausencia de
 * datos como el peor desacuerdo posible, cuando en realidad es la ausencia
 * de una opinión con la que discrepar.
 */
export function divergencia(lectura: Lectura): number {
  if (lectura.frecuencia.muestra === 0) return 0;
  return lectura.probabilidad - tasaDeAcierto(lectura);
}

/** Cuota que haría justa la apuesta según la probabilidad estimada. */
export function cuotaJusta(lectura: Lectura): number {
  return lectura.probabilidad === 0 ? 0 : 100 / lectura.probabilidad;
}

/** Racha vigente al cierre del historial: cuántas veces seguidas se repitió. */
export function rachaActual(historial: boolean[]): { largo: number; cumplida: boolean } {
  if (historial.length === 0) return { largo: 0, cumplida: false };
  const cumplida = historial[historial.length - 1];
  let largo = 0;
  for (let i = historial.length - 1; i >= 0 && historial[i] === cumplida; i--) {
    largo++;
  }
  return { largo, cumplida };
}

/** Qué tan firme es una lectura: cruza probabilidad, muestra y acuerdo con el historial. */
export function fuerza(lectura: Lectura): "firme" | "moderada" | "débil" {
  const acuerdo = Math.abs(divergencia(lectura));
  if (lectura.probabilidad >= 68 && lectura.frecuencia.muestra >= 20 && acuerdo <= 12) {
    return "firme";
  }
  if (lectura.probabilidad >= 55 && acuerdo <= 18) return "moderada";
  return "débil";
}

/** La lectura de mayor probabilidad de un partido. */
export function lecturaPrincipal(partido: Partido): Lectura {
  return partido.lecturas.reduce((mejor, actual) =>
    actual.probabilidad > mejor.probabilidad ? actual : mejor,
  );
}

export function buscarDisciplina(id: DisciplinaId): Disciplina {
  const encontrada = disciplinas.find((d) => d.id === id);
  if (!encontrada) throw new Error(`Disciplina desconocida: ${id}`);
  return encontrada;
}

export function partidosDe(id: DisciplinaId): Partido[] {
  return partidos.filter((p) => p.disciplina === id);
}

export function partidoDestacado(): Partido {
  return partidos.find((p) => p.destacado) ?? partidos[0];
}

/** Totales para la cabecera. */
export function resumenDelDia() {
  const todasLasLecturas = partidos.flatMap((p) => p.lecturas);
  return {
    partidos: partidos.length,
    lecturas: todasLasLecturas.length,
    firmes: todasLasLecturas.filter((l) => fuerza(l) === "firme").length,
    disciplinas: disciplinas.length,
  };
}
