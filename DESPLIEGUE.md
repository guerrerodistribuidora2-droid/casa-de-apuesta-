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

Declara las cinco en los tres entornos (Production, Preview, Development) si
quieres el mismo comportamiento en las previews.

> **Ninguna variable lleva prefijo `NEXT_PUBLIC_`, y es a propósito.** Todas se
> leen solo en el servidor: el adaptador de cuotas corre en el render y Supabase
> pasa por `app/api/banca`. Un `NEXT_PUBLIC_SUPABASE_ANON_KEY` acabaría en el
> paquete del navegador y, sin autenticación de usuarios, dejaría la tabla
> abierta a cualquiera que abriese el inspector.

## 2. Supabase

Crea el proyecto y ejecuta esto en el editor SQL:

```sql
create table if not exists public.banca_sesiones (
  dispositivo    text primary key,
  estado         jsonb       not null,
  actualizado_en timestamptz not null default now()
);

alter table public.banca_sesiones enable row level security;

-- Esta política deja entrar a la clave anónima. Basta porque la clave no sale
-- del servidor, pero NO sustituye a una autenticación real: cualquiera que
-- obtenga la clave podría leer y escribir la tabla.
create policy "acceso anonimo a banca_sesiones"
  on public.banca_sesiones
  for all
  to anon
  using (true)
  with check (true);
```

`SUPABASE_URL` es la *Project URL* y `SUPABASE_ANON_KEY` la clave `anon public`,
ambas en **Project Settings → API**.

**Cuando haya usuarios de verdad**, lo correcto es añadir Supabase Auth y
cambiar la política a `using (auth.uid() = usuario_id)`. La tabla ya está
preparada: basta con añadir la columna y ajustar la política.

## 3. The Odds API

Plan gratuito: **500 peticiones al mes**.

- Las respuestas se cachean 10 minutos (`REVALIDAR_S` en `lib/apiConnector.ts`),
  así que la portada consume como mucho unas pocas peticiones por hora.
- Se consulta una vez por disciplina con encuentros locales, más una llamada a
  la lista de deportes que **no** consume cuota.
- La lista de deportes se usa para resolver las claves que rotan por torneo: las
  de tenis cambian con cada Grand Slam, así que fijarlas a mano se rompe sola.
- El consumo real se ve en el pie del tablero (*peticiones restantes*).

Si se agota la cuota, la API devuelve 429, el adaptador lo detecta y el tablero
cae a los datos locales sin que se rompa nada.

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

**Rotación de claves.** Si alguna clave se ha compartido por chat, correo o
captura, regenérala antes de desplegar. The Odds API permite hacerlo desde el
panel de la cuenta y Supabase desde Project Settings → API.
