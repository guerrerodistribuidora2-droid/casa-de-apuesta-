# Casa de Apuesta - Guía del Proyecto

## Descripción
Plataforma web de análisis estadístico de apuestas deportivas y eSports orientada a
generar lecturas de probabilidad basadas en frecuencias y métricas.

Competiciones cubiertas: **Liga MX**, **Premier League** y **Champions League** en
fútbol, más NBA, Tenis, UFC, League of Legends y Valorant.

## Stack Tecnológico
- **Framework:** Next.js (App Router)
- **Estilos:** Tailwind CSS (Enfoque en modo oscuro / Dark mode estético)
- **Lenguaje:** TypeScript / JavaScript
- **Base de datos (Próximamente):** Supabase

## Comandos Comunes
- Iniciar entorno de desarrollo: `npm run dev`
- Construir para producción: `npm run build`
- Iniciar producción: `npm start`
- Linter: `npm run lint`

## Convenciones de Código
- Usar componentes funcionales de React con TypeScript.
- Mantener los estilos limpios utilizando exclusivamente clases utilitarias de Tailwind CSS.
- Organizar los datos simulados (mock data) en la carpeta `/data` mientras se integra la base de datos definitiva.

## Estructura de Carpetas
```
app/            Rutas del App Router (layout.tsx, page.tsx, globals.css)
components/     Componentes de presentación reutilizables
data/           Datos simulados y métricas derivadas (mockData.ts, enVivo.ts)
app/api/banca/  Puente servidor entre el gestor de banca y Supabase
lib/            Lógica de negocio sin interfaz
                  noticias/       extracción y clasificación de feeds RSS
                  factores.ts     motor multifactorial (árbitro, fatiga, bajas, táctica)
                  supabase.ts     persistencia del gestor de banca
                  banca.ts        matemática del gestor de banca
                  almacenBanca.ts persistencia en localStorage
                  analista.ts     puntuación y ranking (solo servidor)
                  enVivo.ts       motor In-Play (también en el navegador)
                  apiConnector.ts adaptador de cuotas con degradación a local
public/         Recursos estáticos
```

## Notas Técnicas
- **Tailwind v4:** no existe `tailwind.config.js`. Los tokens de diseño (colores y
  tipografías) se declaran con la directiva `@theme` dentro de `app/globals.css`.
- **Modo oscuro:** la interfaz está fijada en oscuro mediante `color-scheme: dark`.
  No se usa la variante `dark:`; la paleta base ya es oscura.
- **Tipografías:** se cargan con `next/font/google` en `app/layout.tsx` y se exponen
  como variables CSS (`--font-display`, `--font-sans`).
- **Componentes de servidor:** las páginas son Server Components por defecto. Añadir
  `"use client"` solo cuando se necesite estado o eventos del navegador. El único
  componente cliente es `components/Tablero.tsx`, que sostiene el filtro por
  disciplina; `app/page.tsx` puntúa en el servidor y le pasa el resultado ya hecho,
  de modo que cambiar de pestaña no vuelve a analizar nada.
- **Cálculos:** las métricas derivadas (tasa de acierto, divergencia, cuota justa,
  racha) viven junto a los datos en `data/mockData.ts` como funciones puras, para
  poder reutilizarlas tal cual cuando la fuente pase a ser Supabase.

## Módulo de Recomendaciones (IA Match Analyzer)
`lib/analista.ts` elige las mejores apuestas del día y `components/AnalistaIA.tsx`
las presenta en la cabecera del dashboard.

- **No hay modelo de lenguaje ni llamada externa.** Es un sistema de reglas
  determinista que corre en local durante el prerender: los mismos datos producen
  siempre el mismo resultado. El nombre del módulo es comercial, el código no debe
  dar a entender otra cosa.
- **Puntaje:** suma ponderada de seis factores cuyos pesos suman 1 — respaldo
  histórico (25%), convicción del modelo (21%), coherencia entre ambos (18%),
  contexto del partido (12%), solidez de la muestra (12%) e inercia reciente (12%).
  Se alimenta solo de los datos y funciones de `data/mockData.ts`.
- **Confianza:** el puntaje crudo (0-100) se reescala a la banda de presentación
  75-95 anclándolo al tramo 60-90, que es donde caen las lecturas reales. Sin ese
  anclaje todas las finalistas saldrían cerca del 90 y el orden dejaría de leerse.
  Es una escala de presentación, **no** una probabilidad.
- **Selección:** descarta las lecturas `débil`, exige puntaje mínimo de 55 y toma
  como mucho una lectura por partido para no repetir el mismo encuentro.
- **Razonamiento:** el párrafo de cada recomendación se construye con
  `razonar()` a partir de frecuencia, racha, forma de los competidores, factores
  contextuales y divergencia. Nunca se escribe a mano ni se guarda en los datos.

## Fuente de datos: cartelera en vivo (lib/apiConnector.ts)
`app/page.tsx` pide los partidos a `obtenerPartidos()`. Variables de entorno y
pasos de despliegue: ver `DESPLIEGUE.md`.

**Cambio de arquitectura importante:** hasta una versión anterior, la cartelera
era la lista simulada de `data/mockData.ts` y la API solo le pegaba una cuota
real cuando el par de equipos coincidía por casualidad con el calendario real
(en la práctica, ~1 de cada 19 partidos). Después pasó a construirse
directamente desde eventos reales, con `data/mockData.ts` como **reserva**
para la disciplina que no se pudiera obtener en vivo.

**Esa reserva ya no existe.** Desde la integración de PitchAPI se decidió
eliminar por completo cualquier dato simulado de la vista principal: una
disciplina sin eventos, sin clave, o sin cuota restante en el plan
simplemente no aparece — no se completa con `data/mockData.ts` ni con nada
inventado. El tipo `Partido` sigue viviendo ahí (y el array `partidos` sigue
existiendo como valor por defecto en las firmas de `lib/analista.ts`, sin uso
real en producción), pero `lib/apiConnector.ts` ya no lo importa.

- **Esta capa nunca lanza**, y degrada por disciplina, no en bloque: si NBA
  falla pero Premier League responde, NBA se queda sin partidos y Premier
  League sigue en vivo. Cada disciplina lleva su propio `EstadoDisciplina`
  (`vivo` / `sin-datos` / `sin-cobertura`), visible en el pie del tablero.
- **Estado real y marcador:** además de `/odds`, cada disciplina pide
  `/sports/{clave}/scores/?daysFrom=1` para resolver `estado`
  (`no_iniciado`/`en_vivo`/`finalizado`) y `marcadorReal` por partido — el
  mismo `id` de evento identifica al partido en ambos endpoints. Esto **duplica
  el costo en cuota** respecto a solo pedir cuotas (ver `DESPLIEGUE.md` §3):
  dos peticiones por disciplina y ciclo de caché, no una.
- **Cobertura real ahora mismo:** Liga MX, Premier League, Champions League,
  NBA, UFC y tenis se construyen en vivo — las seis tienen cobertura confirmada
  en The Odds API (probado con datos reales: 138 partidos, 703 mercados en una
  sola carga). **LoL y Valorant no tienen cobertura en esta API** — no es un
  hueco de la integración, el proveedor simplemente no cubre eSports — y ya no
  aparecen en el tablero en absoluto, marcadas `sin-cobertura` en el pie.
- **La cuenta de desarrollo llegó a agotar los 500/mes** (`OUT_OF_USAGE_CREDITS`,
  devuelto como 401 — `pedir()` en `lib/apiConnector.ts` distingue este caso de
  una clave inválida leyendo el cuerpo de la respuesta, no solo el código de
  estado). Mientras dure, el tablero se ve vacío en producción para las seis
  disciplinas: es el comportamiento correcto de esta arquitectura sin reserva,
  no un bug.
- **Se probó `RIOT_API_KEY` para cerrar ese hueco y no sirve, verificado con la
  clave real:** `TOURNAMENT-V5` y `VAL-MATCH-V1` devuelven `403 Forbidden`
  (piden aprobación de producto que una clave personal no trae), y aunque la
  tuvieran, ninguno de los dos da un calendario de partidos profesionales —
  uno es para lobbies de torneo propios, el otro necesita ya conocer la cuenta
  de cada jugador. La clave queda guardada en `.env.local` sin conectar a
  ningún adaptador. Detalle completo en `DESPLIEGUE.md`.
- **Qué es real y qué no lo es en un partido construido así:**
  - Equipos, fecha, hora, mercados y cuota: reales, tal cual la API.
  - Probabilidad: derivada de la cuota real (`probabilidadImplicita`), no una
    estimación propia.
  - `frecuencia`/`historial`/`forma`: **honestamente vacíos**
    (`{exitos:0,muestra:0}`, `[]`). The Odds API no da qué pasó en los últimos
    diez encuentros ni la racha de resultados; no se inventa.
  - Contexto (árbitro, calendario, lesiones, táctica): **nunca se fabrica**
    para un partido real. Fabricar "el árbitro promedia 5.8 tarjetas" sobre un
    Arsenal-Leeds de verdad sería peor que el mock: parecería auténtico sin
    serlo. El único contexto posible en un partido real es el que detecta
    `lib/noticias/` a partir de prensa genuina (`origen: "noticia"`).
- **El motor tenía que aprender a no castigar la ausencia de historial.**
  `divergencia()` devolvía `probabilidad - 0` cuando `muestra=0`, lo que
  `fuerza()` leía como el peor desacuerdo posible: **todo partido real
  quedaba clasificado `débil` y `recomendaciones()` lo descartaba antes de
  puntuarlo.** Se corrigió en tres sitios — `divergencia()` en
  `data/mockData.ts` devuelve 0 sin muestra; "Respaldo histórico" y "Solidez
  de la muestra" en `lib/analista.ts` quedan neutros (0.5) en vez de 0. Antes
  del arreglo un partido real nunca podía llegar al IA Match Analyzer; después,
  una lectura real típica puntúa ~58 (por encima del umbral de 55).
- **La interfaz no debe colapsar en silencio ante un array vacío.**
  `TiraForma`/`TiraFrecuencia` son "el elemento central del tablero" (su propio
  comentario) — con `forma`/`historial` vacíos, ahora muestran un texto
  explícito ("Sin historial propio todavía") en vez de un hueco en blanco que
  se leería como un fallo de carga.
- **Se toma el mejor precio entre todas las casas** de cada evento, no la
  media: es la cuota que un apostador podría tomar de verdad, y la de-vigging
  (`probabilidadImplicita`) usa los precios de ESA misma casa, nunca mezclados
  con los de otra.
- **Las claves de deporte de tenis rotan con el torneo y pueden ser varias a
  la vez** (un ATP y un WTA simultáneos). Se resuelven contra la lista de
  deportes, que no consume cuota, tomando TODOS los grupos activos, no solo el
  primero.
- **Mercados: solo `h2h` y `totals`.** El plan usado no admite mercados
  adicionales (`btts` da `422 INVALID_MARKET`); UFC y tenis, de hecho, solo
  ofrecen `h2h` en este plan — no hay mercado de "más/menos asaltos" ni
  "más/menos games" que se pueda pedir, así que no se simula.
- **Presupuesto de cuota — esto importa de verdad.** El plan gratuito es
  500 peticiones **al mes**, no al día. Con 6 disciplinas y caché de 600 s
  (10 min), tráfico continuo agotaría el mes entero en menos de una hora.
  `REVALIDAR_S` está en 3600 s (1 hora) por esa cuenta, documentada en el
  propio archivo. "En vivo" en este proyecto significa "tan reciente como la
  última hora", no "al segundo" — subir la frecuencia exige un plan de pago.
- El pie del tablero muestra, **por disciplina**, si está en vivo (con cuántos
  eventos), si cayó a local (y por qué) o si no tiene cobertura — la
  afirmación "100% real" se puede auditar ahí, no solo de palabra.

## Módulo de Noticias (lib/noticias/)
Lee feeds RSS públicos, clasifica titulares y autocompleta factores contextuales.

- **Tres filtros encadenados.** Un titular debe (1) mencionar algo que mueva una
  línea, (2) atribuirse a un equipo de la cartelera y (3) permitir inferir una
  magnitud. Sobre prensa generalista lo normal es descartar más del 95%: de 179
  titulares reales salieron 2 factores. **No es un fallo, es el filtro
  funcionando**, y por eso el pie muestra el diagnóstico completo.
- **Lo inferido pesa menos que lo medido.** `DESCUENTO_POR_NOTICIA` en
  `lib/factores.ts` recorta la solidez al 45%: en la práctica 0.32 frente a 0.70.
  Un titular puede estar mal leído o referirse a otro partido. La interfaz marca
  la procedencia y las palabras que dispararon la clasificación.
- **Un titular de arbitraje nunca mueve cifras.** No trae las medias del
  colegiado, así que se guarda como apunte informativo. Inventar un perfil sería
  peor que no tenerlo.
- **Guardas de ambigüedad.** Se exige palabra completa (si no, "village"
  dispararía Aston Villa y "heated" Miami Heat) y gana el término más largo
  ("Newcastle United" sobre el alias corto). Los términos genéricos —madrid,
  city, united, villa, heat— solo cuentan dentro del nombre completo.
- **Diccionarios bilingües** porque los feeds lo son: `lesion`/`injury`,
  `sancion`/`suspended`, `rotacion`/`load management`.
- El parser de RSS es regex sobre `<item>`, sin dependencia de XML. Si hiciera
  falta Atom o namespaces, tocaría un parser de verdad.

## Persistencia del Gestor de Banca (lib/supabase.ts + app/api/banca)
`localStorage` es la copia inmediata y Supabase el respaldo que sobrevive a
cambiar de navegador. Esquema y SQL exacto en `DESPLIEGUE.md`.

- **Tres tablas normalizadas**, no un blob JSONB: `bankroll_sessions` (una fila
  por ciclo, abierto o cerrado), `bets` (una fila por apuesta, ligada a su
  ciclo) y `news_factors` (auditoría de lo que detectó el clasificador de
  prensa). El historial queda consultable con SQL corriente en vez de exigir
  traer un blob entero y filtrar en el cliente.
- **La clave anónima nunca sale del servidor.** Por eso las variables no llevan
  `NEXT_PUBLIC_` y todo pasa por `app/api/banca`. Sin autenticación de usuarios,
  una clave anónima en el navegador dejaría las tablas abiertas.
- **Nunca lanza.** Si Supabase no está configurado o falla, la ruta responde 200
  con `ok:false` y el gestor sigue con `localStorage`. No hay estado en el que
  el panel se rompa por un problema de red.
- **El remoto solo se adopta si aquí no hay nada.** Lo que el usuario acaba de
  hacer en este navegador manda sobre una copia antigua del servidor.
- **Escritura en dos peticiones como mucho.** `guardarBanca()` hace un upsert
  masivo a `bankroll_sessions` (el ciclo abierto más cada ciclo del historial —
  así el que se acaba de cerrar queda marcado `cerrado` aunque el registro
  anterior dijera `abierto`) y un upsert masivo a `bets` con las apuestas del
  ciclo abierto. Las apuestas de ciclos ya cerrados no se reenvían: se
  guardaron cuando ese ciclo todavía estaba abierto.
- **`apuesta_id` es la clave del upsert de `bets`**: el mismo
  `"<partidoId>|<mercado>"` que usa `useBanca` en el navegador, así que
  actualizar el estado de una apuesta (pendiente → ganada) hace `UPDATE`, no
  un duplicado.
- **`news_factors` se escribe con `after()`**, no en el flujo de render de
  `app/page.tsx`. Nunca añade latencia a la página y sobrevive al final de la
  respuesta en Vercel (a diferencia de una promesa suelta sin `await`, que ahí
  puede cortarse a medias).
- Se habla con PostgREST por `fetch` en vez de añadir `@supabase/supabase-js`:
  el proyecto sigue sin dependencias de runtime más allá de Next y React.
  Migrar al cliente oficial es directo si hiciera falta realtime o auth.

## Módulo In-Play (data/enVivo.ts + lib/enVivo.ts)
Sección de partidos en curso, encima del IA Match Analyzer y sujeta al mismo
filtro por disciplina.

- **El estado no se guarda, se deriva.** `estadoEn()` parte del marcador base y
  aplica los eventos cuyo minuto ya pasó, así que el reloj puede avanzar sin que
  existan dos versiones de la verdad.
- **Este motor sí corre en el navegador**, al revés que `analista.ts`: tiene que
  recalcularse en cada tic. Sigue siendo determinista, y el reloj arranca en 0
  tanto en el servidor como en el primer render, de modo que no hay desajuste de
  hidratación.
- **Cálculo:** se proyecta el ritmo actual al final del partido, se compara con
  la línea por una curva logística y se mezcla con la probabilidad previa en
  proporción a lo jugado. Encima se suman los ajustes por evento.
- **Contadores continuos** (`continuos: ["puntos"]`): los puntos de baloncesto se
  interpolan entre eventos. Sin eso la proyección daba un diente de sierra,
  desplomándose cada minuto sin anotación. Los goles y las tarjetas sí son
  discretos y no se interpolan.
- **Alto fijo en las tarjetas.** Se pintan siempre dos huecos de mercado y se
  marca cuáles son alerta, en lugar de añadir y quitar bloques; la zona de
  incidencias reserva su alto y el razonamiento se recorta a tres líneas. Con la
  versión anterior la página se movía hasta 383 px bajo el dedo durante el
  scroll; ahora se queda dentro de un píxel. **Cualquier cambio aquí tiene que
  mantener el alto estable.**
- **El botón de pausa no es decorativo:** WCAG 2.2.2 exige poder detener el
  contenido que se actualiza solo.

## Motor Multifactorial (lib/factores.ts)
Convierte las mediciones de `Contexto` en un desplazamiento de probabilidad, en
puntos y con signo. **Ya no hay ningún `peso` escrito a mano**: el peso se deriva
de datos comparables.

Dos reglas sostienen el módulo:

1. **Los factores apuntan a familias de mercado, no a nombres.** Cada `Lectura`
   declara `familia` (goles, tarjetas, corners, puntos, juegos, asaltos, mapas,
   resultado) y `sentido` (`mas` / `menos` / `evento`). Esto sustituye al viejo
   emparejamiento por el texto del mercado, que se rompía en silencio al
   renombrar cualquier cosa.
2. **El signo depende del deporte.** La fatiga abre un partido de fútbol (más
   goles) pero hunde la anotación en la NBA, donde un back-to-back baja ritmo y
   porcentajes. Tratar ambos casos igual es el error fácil; la tabla `direccion`
   de `efectoCalendario` es donde vive esa distinción.

### Los tres factores
- **Árbitro:** compara al colegiado contra la media de SU competición. Cada
  amonestación de exceso vale ~7 puntos en la familia `tarjetas`; las faltas por
  debajo de la media suman en `goles` (un árbitro que deja jugar no trocea el
  partido). Solidez 0.85 en tarjetas, 0.4 en goles, porque la segunda relación es
  indirecta.
- **Calendario:** días de descanso contra lo normal del deporte, partidos en 14
  días, back-to-back, doble competencia y viaje. Si la carga la arrastran los dos
  equipos el efecto se amplifica, no se reparte. Solidez 0.6.
- **Bajas:** el rol decide el signo y la cuota de producción la magnitud. Perder
  al creador baja los goles; perder al central los sube; perder al reboteador de
  la NBA sube los puntos por segundas oportunidades. Solidez 0.7.

### Cómo entra en el puntaje
`valorDelContexto()` lleva el neto (ya descontado por solidez) a la escala 0-1 que
consume el factor "Contexto del partido" del motor de recomendaciones. Sin
factores medidos queda neutro en 0.5.

`lib/factores.ts` es matemática pura sin dependencias y puede ejecutarse en el
navegador; `lib/analista.ts` (selección y ranking) sigue siendo solo de servidor.

### Fases de juego
Cada `Lectura` puede declarar una `fase` (`primera-parte`, `segunda-parte`,
`primer-cuarto`, `segundo-cuarto`, `ultimo-cuarto`; sin declarar, el mercado
cubre el partido entero).

- **Los factores acumulativos pesan según la fase.** `PESO_POR_FASE` escala la
  fatiga y las tarjetas: 0.45 en el primer cuarto, 1.5 en el último. Sin esto un
  back-to-back parecía afectar al salto inicial igual que al minuto 45.
- **El factor táctico solo actúa sobre su propia fase.** Compara cómo reparte el
  equipo su producción entre fases frente a la media de su liga, y suma aparte
  las remontadas desde el descanso y los cambios de esquema. Un desvío en la
  segunda parte no dice nada del primer cuarto, y el motor lo respeta.

### Al añadir datos
- Toda `Lectura` nueva necesita `familia` y `sentido`. El validador de
  `scratchpad/validar.mjs` detecta un sentido invertido ("Más de..." marcado como
  `menos`), que si no sería un error silencioso grave.
- `cuotaProduccion` va de 0 a 1 y es la parte de la producción del equipo **en su
  faceta**, no del total del equipo.
- Las medias del árbitro deben ser de su propia liga: 4.8 tarjetas significan
  cosas distintas en la Premier y en la Liga MX.

## Gestor de Banca (lib/banca.ts + components/GestorBanca.tsx)
Configuración de presupuesto, stake sugerido por confianza, marcado de
ganada/perdida, balance en vivo y cierre de ciclo.

- **Con cuota de mercado sí calcula ventaja; sin ella, no.** Cuando el adaptador
  trae precio real, la apuesta se liquida a ese precio y la ventaja es nuestra
  probabilidad contra él. Sin precio se usa la cuota justa, que no deja margen
  por construcción. En ambos casos **la ventaja vale lo que valga el modelo**, y
  el modelo corre hoy sobre frecuencias simuladas. El aviso está en la interfaz
  y debe seguir ahí.
- **El stake no es Kelly.** Kelly necesita una ventaja medible contra el precio
  del mercado. Lo que hay es un plan proporcional a la confianza: 0.6x del riesgo
  base en la lectura más floja y 1.4x en la más firme.
- **La confianza no es una probabilidad** (ver la sección del analista). Se usa
  para escalar el stake, no como `p` en ninguna fórmula.
- **Persistencia:** `useSyncExternalStore`, no un `setState` dentro de un efecto.
  `localStorage` es literalmente un almacén externo y ese hook está hecho para
  eso; además evita el desajuste de hidratación y sincroniza dos pestañas. La
  regla de lint `react-hooks/set-state-in-effect` rechaza la otra vía.
- **Los campos numéricos llevan texto propio.** Atar un `input type="number"` al
  estado tenía dos fallos reales: vaciarlo para reescribirlo ponía la banca a 0
  (`Number("")` es 0) y los locales con coma decimal no parseaban. `Campo`
  normaliza la coma y solo confirma números válidos.

## Panel Táctico en Vivo (components/PanelTactico.tsx)
Deja introducir a mano lo que el guion de eventos no recoge (un cambio de
esquema, una presión sostenida) con su dirección e intensidad en puntos. El motor
In-Play lo suma a su cálculo sin tocar los datos.

Las alertas distinguen tres estados: **línea rota a favor** (fondo ámbar, el
contador ya superó la línea en un mercado de "más"), **alerta de valor** (canto
ámbar, se movió 8 puntos o más) y **en seguimiento** (canto gris). Los tres
huecos son fijos: ver la nota sobre alto estable más abajo.

## Filtros
`filtros` en `data/mockData.ts` agrupa disciplinas para las pestañas del tablero.

- `futbol` reúne Liga MX, Premier League y Champions League; `esports` reúne LoL y
  Valorant. NBA, Tenis y UFC van uno a uno. El id `todos` lleva la lista de
  disciplinas vacía, que significa "todas".
- Las pestañas agrupan, pero las secciones de abajo siguen separando cada liga: el
  orden de las secciones lo manda el orden del array `disciplinas`, donde las tres
  competiciones de fútbol van seguidas.
- **Seis pestañas es el techo práctico.** A 390 px la barra ya hace scroll lateral,
  por eso las ligas de fútbol comparten pestaña en vez de tener una cada una. Si se
  añaden más competiciones, agruparlas antes que sumar pestañas.

## Datos
Todos los datos actuales son **simulados** y sirven solo para maquetar la interfaz.
Los nombres de clubes y organizaciones son reales por familiaridad visual, pero las
cifras no corresponden a ningún registro real. Los competidores individuales
(tenis y UFC) son ficticios de forma deliberada.

Las notas de contexto **nunca nombran a una persona**: los árbitros aparecen como
"el colegiado designado" y los jugadores por su puesto. Atribuir estadísticas
inventadas a personas reales sería otra cosa que datos de maqueta, así que esta
regla se mantiene al añadir partidos nuevos.
