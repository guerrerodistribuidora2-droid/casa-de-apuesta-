/**
 * Persistencia en Supabase.
 *
 * Tres tablas normalizadas — `bankroll_sessions`, `bets`, `news_factors` — en
 * vez de un blob JSONB. El SQL exacto está en `DESPLIEGUE.md`.
 *
 * Se habla directamente con PostgREST por `fetch` en lugar de añadir
 * `@supabase/supabase-js`: el proyecto sigue sin dependencias de runtime más
 * allá de Next y React. Si algún día hace falta realtime o auth, migrar al
 * cliente oficial es directo.
 *
 * **La clave anónima no sale nunca del servidor.** Por eso las variables NO
 * llevan prefijo `NEXT_PUBLIC_` y todo el acceso del navegador pasa por la ruta
 * `app/api/banca`. Sin autenticación de usuarios, una clave anónima en el
 * navegador dejaría las tablas abiertas a cualquiera que abriese el inspector.
 *
 * Igual que el adaptador de cuotas: **esto nunca lanza**. Si Supabase no está
 * configurado o falla, el gestor de banca sigue funcionando contra
 * `localStorage` y el registro de noticias simplemente no ocurre.
 */

import type { Contexto } from "@/data/mockData";
import type { Apuesta, CicloCerrado, EstadoApuesta, EstadoBanca } from "./banca";

const TABLA_SESIONES = "bankroll_sessions";
const TABLA_APUESTAS = "bets";
const TABLA_NOTICIAS = "news_factors";
const TIEMPO_LIMITE_MS = 5000;

export interface RespuestaSupabase {
  ok: boolean;
  estado?: EstadoBanca;
  motivo?: string;
}

export function supabaseConfigurado(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

function cabeceras(extra?: HeadersInit): HeadersInit {
  const clave = process.env.SUPABASE_ANON_KEY ?? "";
  return {
    apikey: clave,
    Authorization: `Bearer ${clave}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function urlTabla(tabla: string, query = ""): string {
  const base = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/rest/v1/${tabla}${query}`;
}

class ErrorSupabase extends Error {}

/** GET o POST contra PostgREST. Nunca lanza fuera de este archivo: se atrapa arriba. */
async function peticion<T>(
  url: string,
  init: RequestInit & { headers: HeadersInit },
): Promise<T> {
  const respuesta = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
    cache: "no-store",
  });
  if (!respuesta.ok) {
    throw new ErrorSupabase(`Supabase respondió ${respuesta.status} en ${url}`);
  }
  if (respuesta.status === 204) return [] as T;
  return (await respuesta.json()) as T;
}

function motivoDe(error: unknown): string {
  if (error instanceof ErrorSupabase) return error.message;
  if (error instanceof Error && error.name === "TimeoutError") return "Supabase tardó demasiado";
  return "No se pudo contactar con Supabase";
}

/* Filas tal y como las devuelve PostgREST ------------------------------------ */

interface FilaSesion {
  id: string;
  dispositivo: string;
  ciclo_numero: number;
  estado: "abierto" | "cerrado";
  banca_inicial: number;
  riesgo_base: number;
  balance_final: number | null;
}

interface FilaApuesta {
  id: string;
  session_id: string;
  apuesta_id: string;
  partido: string;
  mercado: string;
  confianza: number;
  cuota: number;
  importe: number;
  estado: EstadoApuesta;
}

/* Lectura ---------------------------------------------------------------------
 * Dos peticiones como mucho: las sesiones del dispositivo, y las apuestas de
 * todas ellas de una vez (por eso el conteo de cada ciclo cerrado sale exacto
 * sin una petición por ciclo).
 */

export async function leerBanca(dispositivo: string): Promise<RespuestaSupabase> {
  if (!supabaseConfigurado()) {
    return { ok: false, motivo: "Supabase no está configurado" };
  }

  try {
    const sesiones = await peticion<FilaSesion[]>(
      urlTabla(
        TABLA_SESIONES,
        `?dispositivo=eq.${encodeURIComponent(dispositivo)}&order=ciclo_numero.asc`,
      ),
      { headers: cabeceras() },
    );

    if (sesiones.length === 0) {
      // Dispositivo nuevo: no es un error, simplemente no hay nada guardado.
      return { ok: true };
    }

    const ids = sesiones.map((s) => s.id);
    const apuestasFilas = await peticion<FilaApuesta[]>(
      urlTabla(
        TABLA_APUESTAS,
        `?session_id=in.(${ids.join(",")})&order=creado_en.asc`,
      ),
      { headers: cabeceras() },
    );

    const porSesion = new Map<string, FilaApuesta[]>();
    for (const fila of apuestasFilas) {
      const lista = porSesion.get(fila.session_id) ?? [];
      lista.push(fila);
      porSesion.set(fila.session_id, lista);
    }

    const aApuesta = (f: FilaApuesta): Apuesta => ({
      id: f.apuesta_id,
      partido: f.partido,
      mercado: f.mercado,
      confianza: f.confianza,
      cuota: f.cuota,
      importe: f.importe,
      estado: f.estado,
    });

    const abierta = sesiones.find((s) => s.estado === "abierto");
    const cerradas = sesiones.filter((s) => s.estado === "cerrado");

    const historial: CicloCerrado[] = cerradas.map((s) => ({
      numero: s.ciclo_numero,
      inicial: s.banca_inicial,
      final: s.balance_final ?? s.banca_inicial,
      apuestas: (porSesion.get(s.id) ?? []).length,
    }));

    let estado: EstadoBanca;
    if (abierta) {
      estado = {
        bancaInicial: abierta.banca_inicial,
        riesgoBase: abierta.riesgo_base,
        ciclo: abierta.ciclo_numero,
        apuestas: (porSesion.get(abierta.id) ?? []).map(aApuesta),
        historial,
      };
    } else {
      // Todas las sesiones guardadas están cerradas: se infiere el ciclo
      // siguiente a partir de la última, con el balance final como banca base.
      const ultima = cerradas[cerradas.length - 1];
      estado = {
        bancaInicial: ultima.balance_final ?? ultima.banca_inicial,
        riesgoBase: ultima.riesgo_base,
        ciclo: ultima.ciclo_numero + 1,
        apuestas: [],
        historial,
      };
    }

    return { ok: true, estado };
  } catch (error) {
    return { ok: false, motivo: motivoDe(error) };
  }
}

/* Escritura ---------------------------------------------------------------------
 * Dos peticiones como mucho, sea cual sea el número de apuestas o ciclos:
 * un upsert masivo de sesiones (el ciclo abierto + cada ciclo del historial,
 * que así queda marcado "cerrado" aunque antes estuviera abierto) y un upsert
 * masivo de las apuestas del ciclo abierto. Las apuestas de ciclos ya cerrados
 * no se reenvían: se guardaron cuando ese ciclo todavía estaba abierto.
 */

export async function guardarBanca(
  dispositivo: string,
  estado: EstadoBanca,
): Promise<RespuestaSupabase> {
  if (!supabaseConfigurado()) {
    return { ok: false, motivo: "Supabase no está configurado" };
  }

  try {
    const filasHistorial = estado.historial.map((c) => ({
      dispositivo,
      ciclo_numero: c.numero,
      estado: "cerrado" as const,
      banca_inicial: c.inicial,
      balance_final: c.final,
      cerrado_en: new Date().toISOString(),
    }));

    const filaAbierta = {
      dispositivo,
      ciclo_numero: estado.ciclo,
      estado: "abierto" as const,
      banca_inicial: estado.bancaInicial,
      riesgo_base: estado.riesgoBase,
    };

    const sesionesGuardadas = await peticion<FilaSesion[]>(
      urlTabla(TABLA_SESIONES),
      {
        method: "POST",
        headers: cabeceras({
          Prefer: "resolution=merge-duplicates,return=representation",
        }),
        body: JSON.stringify([...filasHistorial, filaAbierta]),
      },
    );

    const sesionAbierta = sesionesGuardadas.find(
      (s) => s.ciclo_numero === estado.ciclo && s.estado === "abierto",
    );
    if (!sesionAbierta) {
      throw new ErrorSupabase("Supabase no devolvió la sesión abierta tras guardarla");
    }

    if (estado.apuestas.length > 0) {
      const filasApuestas = estado.apuestas.map((a) => ({
        session_id: sesionAbierta.id,
        apuesta_id: a.id,
        partido: a.partido,
        mercado: a.mercado,
        confianza: a.confianza,
        cuota: a.cuota,
        importe: a.importe,
        estado: a.estado,
        actualizado_en: new Date().toISOString(),
      }));

      await peticion(urlTabla(TABLA_APUESTAS), {
        method: "POST",
        headers: cabeceras({
          Prefer: "resolution=merge-duplicates,return=minimal",
        }),
        body: JSON.stringify(filasApuestas),
      });
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, motivo: motivoDe(error) };
  }
}

/* Noticias --------------------------------------------------------------------
 * Registro de auditoría de lo que el clasificador de prensa detectó. Nunca
 * bloquea el render: se llama con `after()` desde el componente de servidor.
 * `partido_id + url` es la clave de deduplicado, así que volver a ver el mismo
 * titular en un recarga no crea una fila nueva.
 */

export interface FactorNoticiaAGuardar {
  partidoId: string;
  contexto: Contexto;
}

export async function registrarFactoresNoticia(
  factores: FactorNoticiaAGuardar[],
): Promise<RespuestaSupabase> {
  if (!supabaseConfigurado()) {
    return { ok: false, motivo: "Supabase no está configurado" };
  }
  if (factores.length === 0) return { ok: true };

  try {
    const filas = factores
      .filter((f) => f.contexto.origen === "noticia" && f.contexto.fuente)
      .map((f) => {
        const fuente = f.contexto.fuente!;
        return {
          partido_id: f.partidoId,
          tipo: f.contexto.tipo,
          nota: f.contexto.nota,
          medio: fuente.medio,
          // NULL en vez de cadena vacía: así dos titulares sin enlace no
          // chocan contra la restricción única (partido_id, url).
          url: fuente.url || null,
          fecha_noticia: fuente.fecha || null,
          coincidencias: fuente.coincidencias,
        };
      });

    if (filas.length === 0) return { ok: true };

    await peticion(urlTabla(TABLA_NOTICIAS), {
      method: "POST",
      headers: cabeceras({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(filas),
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, motivo: motivoDe(error) };
  }
}
