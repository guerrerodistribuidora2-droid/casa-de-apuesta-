# Despliegue en Vercel

Guía rápida para poner *Casa de Apuesta* en producción.

## 1. Variables de entorno

En **Vercel → Project Settings → Environment Variables**. Ninguna es obligatoria
para que la aplicación arranque: sin ellas funciona con los datos locales y el
gestor de banca guarda solo en el navegador. Cada una añade una capacidad.

| Variable | Obligatoria | Qué habilita | Si falta |
|---|---|---|---|
| `ODDS_API_KEY` | No | Cuotas reales de mercado y cálculo de ventaja | Se usan los datos locales enriquecidos |
| `SHARP_API_KEY` | No | Proveedor secundario | Se ignora |
| `SHARP_API_HABILITADA` | No | Pon `true` para activar el proveedor secundario | Queda apagado |
| `SUPABASE_URL` | No | Historial de banca en servidor | Solo `localStorage` |
| `SUPABASE_ANON_KEY` | No | Igual que la anterior | Solo `localStorage` |
| `RIOT_API_KEY` | No | Nada todavía — reservada, sin adaptador conectado | Se ignora |

Declara las seis en los tres entornos (Production, Preview, Development) si
quieres el mismo comportamiento en las previews.

> **Ninguna variable lleva prefijo `NEXT_PUBLIC_`, y es a propósito.** Todas se
> leen solo en el servidor: el adaptador de cuotas corre en el render y Supabase
> pasa por `app/api/banca`. Un `NEXT_PUBLIC_SUPABASE_ANON_KEY` acabaría en el
> paquete del navegador y, sin autenticación de usuarios, dejaría la tabla
> abierta a cualquiera que abriese el inspector.

## 2. Supabase

Tres tablas normalizadas: una sesión de banca por ciclo, una fila por apuesta y
un registro de auditoría de lo que detectó el clasificador de prensa. Ejecuta
esto entero en el editor SQL del proyecto:

```sql
-- Un ciclo de banca (abierto o cerrado) por dispositivo.
create table if not exists public.bankroll_sessions (
  id             uuid primary key default gen_random_uuid(),
  dispositivo    text not null,
  ciclo_numero   integer not null,
  estado         text not null check (estado in ('abierto', 'cerrado')),
  banca_inicial  numeric not null,
  riesgo_base    numeric not null,
  balance_final  numeric,
  creado_en      timestamptz not null default now(),
  cerrado_en     timestamptz,
  unique (dispositivo, ciclo_numero)
);

-- Una fila por apuesta registrada, ligada a su ciclo.
create table if not exists public.bets (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.bankroll_sessions(id) on delete cascade,
  -- "<id_partido>|<mercado>": el mismo id que usa el navegador, para poder
  -- actualizar una apuesta existente en vez de duplicarla.
  apuesta_id     text not null,
  partido        text not null,
  mercado        text not null,
  confianza      numeric not null,
  cuota          numeric not null,
  importe        numeric not null,
  estado         text not null check (estado in ('pendiente', 'ganada', 'perdida')),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (session_id, apuesta_id)
);

-- Auditoría de los factores que el clasificador de prensa detectó y
-- autocompletó. "url" puede ser NULL cuando un titular no trae enlace; NULL
-- nunca choca con la restricción única, así que eso no bloquea el registro.
create table if not exists public.news_factors (
  id             uuid primary key default gen_random_uuid(),
  partido_id     text not null,
  tipo           text not null check (
                   tipo in ('lesiones', 'arbitro', 'plantel', 'calendario', 'tactica', 'nota')
                 ),
  nota           text not null,
  medio          text,
  url            text,
  fecha_noticia  timestamptz,
  coincidencias  jsonb,
  creado_en      timestamptz not null default now(),
  unique (partido_id, url)
);

alter table public.bankroll_sessions enable row level security;
alter table public.bets              enable row level security;
alter table public.news_factors      enable row level security;

-- Estas políticas dejan entrar a la clave anónima. Basta porque la clave no
-- sale del servidor (ver lib/supabase.ts), pero NO sustituyen una
-- autenticación real: cualquiera que obtenga la clave podría leer y escribir
-- las tres tablas.
create policy "acceso anonimo a bankroll_sessions"
  on public.bankroll_sessions for all to anon using (true) with check (true);
create policy "acceso anonimo a bets"
  on public.bets for all to anon using (true) with check (true);
create policy "acceso anonimo a news_factors"
  on public.news_factors for all to anon using (true) with check (true);
```

`SUPABASE_URL` es la *Project URL* y `SUPABASE_ANON_KEY` la clave `anon public`,
ambas en **Project Settings → API**.

**Cuando haya usuarios de verdad**, lo correcto es añadir Supabase Auth, sumar
una columna `usuario_id` a `bankroll_sessions` y cambiar la política de esa
tabla a `using (auth.uid() = usuario_id)`; `bets` hereda la protección a través
de la referencia a `session_id`.

### Por qué tres tablas y no una

Una versión anterior de este proyecto usaba una sola tabla con un blob JSONB
por dispositivo. Se migró al esquema normalizado por dos razones concretas:

- **El historial de apuestas queda consultable.** Con JSONB, "cuántas apuestas
  gané en octubre" exige traer el blob entero y filtrar en el cliente; con
  `bets` es una consulta SQL corriente.
- **`news_factors` no existía antes.** El clasificador de prensa
  (`lib/noticias/`) generaba contextos en cada carga de página y los
  descartaba: nada quedaba registrado. Ahora cada factor detectado se guarda,
  con el titular, el medio y las palabras que lo dispararon, así que se puede
  auditar qué vio el sistema y cuándo.

### Cómo reconcilian las escrituras

`guardarBanca()` en `lib/supabase.ts` hace como mucho dos peticiones sea cual
sea el número de apuestas o de ciclos cerrados: un upsert masivo a
`bankroll_sessions` (el ciclo abierto más cada ciclo del historial, que así
queda marcado `cerrado` aunque antes estuviera `abierto`) y un upsert masivo a
`bets` con las apuestas del ciclo abierto. Las apuestas de un ciclo ya cerrado
no se reenvían: se guardaron cuando ese ciclo todavía estaba abierto, y cerrar
el ciclo solo cambia el estado de la sesión, no las apuestas que ya tiene.

## 3. The Odds API

Plan gratuito: **500 peticiones al mes** (no al día — la aritmética de abajo
importa). Desde esta versión, **la cartelera se construye en vivo** desde la
API para Liga MX, Premier League, Champions League, NBA, UFC y tenis; solo
LoL/Valorant (sin cobertura de eSports en este proveedor) y cualquier
disciplina cuya petición falle ese momento siguen viniendo de
`data/mockData.ts`.

- **Presupuesto real:** con 6 disciplinas y una petición cada una, cada ciclo
  de caché cuesta 6 peticiones. A 600 s (10 min) de caché, tráfico continuo
  agotaría el mes entero en menos de una hora. Por eso `REVALIDAR_S` en
  `lib/apiConnector.ts` está en **3600 s (1 hora)**: "en vivo" aquí significa
  "tan reciente como la última hora", no "al segundo". Si necesitas más
  frecuencia, hace falta un plan de pago de The Odds API.
- Una llamada aparte a la lista de deportes (para resolver el torneo de tenis
  vigente) **no consume cuota**.
- Si una disciplina falla (red, 429, respuesta rara) esa disciplina cae a su
  reserva local; las demás siguen en vivo. No es todo-o-nada.
- El consumo real y el desglose por disciplina (en vivo / local / sin
  cobertura, con cuántos eventos) se ven en el pie del tablero.
- **Durante el desarrollo de esta función se consumieron ~480 de 500
  peticiones del mes en pruebas manuales** (exploración con `curl` fuera de la
  aplicación, más recargas del servidor de desarrollo, que no comparte el
  caché de 10 minutos entre recargas como sí hace producción). Si el contador
  aparece bajo al desplegar, es por eso, no por un fallo — se repone con el
  ciclo de facturación del plan.

## 4. Feeds de noticias

No necesitan clave: son RSS públicos (BBC Sport, ESPN, Marca), definidos en
`FEEDS` de `lib/noticias/index.ts`. Se cachean 15 minutos y solo se consultan los
feeds de disciplinas presentes en el tablero.

Si un medio cambia su URL o deja de responder, `leerFeed` devuelve lista vacía y
el pie del tablero lo refleja (`Prensa: 3/4 feeds`). No hay que hacer nada para
que la aplicación siga funcionando.

## 5. Comprobaciones antes de desplegar

```bash
npm run lint        # sin errores
npx tsc --noEmit    # TypeScript estricto, sin errores
npm run build       # debe terminar en verde
```

El build muestra `/` como ruta ISR (revalida cada 10 min por el cacheado de
cuotas) y `/api/banca` como ruta dinámica. Es lo esperado.

## 6. Subir a GitHub

El repositorio ya está configurado: `.gitignore` cubre `.env*`, `node_modules`
y `.next`. Comprobado que ninguna clave aparece en archivos versionables.

```bash
git add -A
git commit -m "Plataforma completa: motor multifactorial, In-Play, banca y noticias"
git remote add origin https://github.com/TU_USUARIO/casa-de-apuesta.git
git push -u origin main
```

En Vercel: **Add New → Project → Import Git Repository**. Detecta Next.js solo.
Antes del primer despliegue, declara las variables de la sección 1.

## 7. Notas sobre los proveedores

**SharpAPI.** La clave probada devuelve `401 Unauthorized`, y el servicio no
publica un producto de cuotas deportivas: es una API de flujos de IA para RRHH,
comercio electrónico y contenido. El hueco queda preparado en
`estadoSharp()` de `lib/apiConnector.ts`, apagado por defecto. Para activarlo
hace falta una clave válida y saber qué endpoint sirve los precios.

**Riot Games API (`RIOT_API_KEY`).** Guardada en `.env.local` pero **no
conectada a ningún adaptador**, a propósito. Verificado con la clave real
contra la API en vivo, no de memoria:

| Endpoint | Resultado real |
|---|---|
| `lol/status/v4/platform-data` | `200 OK` -- la clave está activa |
| `lol/tournament/v5/providers` (POST) | **`403 Forbidden`** |
| `val/match/v1/matchlists/by-puuid/...` | **`403 Forbidden`** |
| `val/content/v1`, `val/status/v1` | `200 OK` -- solo lo público básico |

El 403 no es un problema de configuración: TOURNAMENT-V5 y VAL-MATCH-V1
exigen que Riot apruebe la aplicación para ese producto concreto, algo que una
clave personal no trae nunca por defecto.

Pero hay algo más de fondo que un permiso: **ninguno de los dos endpoints
sirve para esto aunque estuvieran aprobados.**

- `TOURNAMENT-V5` no da el calendario de las ligas profesionales (LCK, LEC,
  Worlds...). Es para que un tercero cree y gestione **sus propios** lobbies
  de torneo personalizado y consulte los resultados de esas partidas -- la
  herramienta de un organizador amateur, no una fuente de partidos
  profesionales.
- `VAL-MATCH-V1` no da un calendario de VCT. Da el historial de partidas ya
  jugadas de **un jugador que ya se conoce** por su cuenta (PUUID) -- no hay
  forma de pedir "los partidos profesionales de hoy", y no hay manera fiable
  de distinguir una partida de torneo del resto del historial de un jugador.

Lo que de verdad da "calendario + cuotas" de eSports, análogo a lo que The
Odds API da para fútbol/NBA/UFC/tenis, son proveedores especializados
(PandaScore, GRID, Abios) con su propia clave -- o la API no oficial de
lolesports.com, que funciona pero no es un producto sancionado por Riot.
Ninguna de las dos está integrada.

**Por eso LoL y Valorant siguen viniendo de `data/mockData.ts`**, marcados
`sin-cobertura` en el pie del tablero -- no es un hueco de esta integración,
es que no hay ninguna clave con acceso real a ese dato todavía.

**Rotación de claves.** Si alguna clave se ha compartido por chat, correo o
captura, regenérala antes de desplegar. The Odds API permite hacerlo desde el
panel de la cuenta, Supabase desde Project Settings → API, y Riot desde el
Developer Portal (developer.riotgames.com).
