/**
 * Persistencia en Supabase para el gestor de banca.
 *
 * Se habla directamente con PostgREST por `fetch` en lugar de añadir
 * `@supabase/supabase-js`: lo único que hace falta es leer y escribir una fila,
 * y así el proyecto sigue sin dependencias de runtime más allá de Next y React.
 * Si algún día hace falta realtime o auth, migrar al cliente oficial es directo.
 *
 * **La clave anónima no sale nunca del servidor.** Por eso las variables NO
 * llevan prefijo `NEXT_PUBLIC_` y todo el acceso pasa por la ruta
 * `app/api/banca`. Sin autenticación de usuarios, una clave anónima en el
 * navegador dejaría la tabla abierta a cualquiera que abriese el inspector.
 *
 * Igual que el adaptador de cuotas: **esto nunca lanza**. Si Supabase no está
 * configurado o falla, el gestor sigue funcionando contra `localStorage`.
 */

import type { EstadoBanca } from "./banca";

const TABLA = "banca_sesiones";
const TIEMPO_LIMITE_MS = 5000;

export interface RespuestaSupabase {
  ok: boolean;
  estado?: EstadoBanca;
  motivo?: string;
}

export function supabaseConfigurado(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

function cabeceras(): HeadersInit {
  const clave = process.env.SUPABASE_ANON_KEY ?? "";
  return {
    apikey: clave,
    Authorization: `Bearer ${clave}`,
    "Content-Type": "application/json",
  };
}

function base(): string {
  return `${(process.env.SUPABASE_URL ?? "").replace(/\/$/, "")}/rest/v1/${TABLA}`;
}

/** Lee el estado guardado de un dispositivo. */
export async function leerBanca(dispositivo: string): Promise<RespuestaSupabase> {
  if (!supabaseConfigurado()) {
    return { ok: false, motivo: "Supabase no está configurado" };
  }

  try {
    const url = `${base()}?dispositivo=eq.${encodeURIComponent(dispositivo)}&select=estado&limit=1`;
    const respuesta = await fetch(url, {
      headers: cabeceras(),
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
      cache: "no-store",
    });

    if (!respuesta.ok) {
      return { ok: false, motivo: `Supabase respondió ${respuesta.status}` };
    }

    const filas = (await respuesta.json()) as { estado: EstadoBanca }[];
    if (!Array.isArray(filas) || filas.length === 0) {
      // Dispositivo nuevo: no es un error, simplemente no hay nada guardado.
      return { ok: true };
    }
    return { ok: true, estado: filas[0].estado };
  } catch (error) {
    return {
      ok: false,
      motivo:
        error instanceof Error && error.name === "TimeoutError"
          ? "Supabase tardó demasiado"
          : "No se pudo contactar con Supabase",
    };
  }
}

/** Guarda el estado de un dispositivo, creando la fila si no existía. */
export async function guardarBanca(
  dispositivo: string,
  estado: EstadoBanca,
): Promise<RespuestaSupabase> {
  if (!supabaseConfigurado()) {
    return { ok: false, motivo: "Supabase no está configurado" };
  }

  try {
    const respuesta = await fetch(base(), {
      method: "POST",
      headers: {
        ...cabeceras(),
        // Un upsert sobre la clave primaria: una fila por dispositivo.
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        dispositivo,
        estado,
        actualizado_en: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
      cache: "no-store",
    });

    if (!respuesta.ok) {
      return { ok: false, motivo: `Supabase respondió ${respuesta.status}` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      motivo:
        error instanceof Error && error.name === "TimeoutError"
          ? "Supabase tardó demasiado"
          : "No se pudo contactar con Supabase",
    };
  }
}
