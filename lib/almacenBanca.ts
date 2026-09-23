"use client";

/**
 * Persistencia del gestor de banca en `localStorage`.
 *
 * Se resuelve con `useSyncExternalStore` y no con un `setState` dentro de un
 * efecto: el almacenamiento del navegador es exactamente un almacén externo, y
 * este hook está hecho para eso. Además resuelve tres cosas de golpe:
 *
 *   - El render del servidor usa `snapshotServidor`, así que el HTML servido
 *     coincide con el primer render del cliente y no hay desajuste de
 *     hidratación.
 *   - El snapshot se cachea contra la cadena cruda, porque React exige una
 *     referencia estable o entra en bucle.
 *   - Si el almacenamiento no está disponible (ventana privada, permisos), se
 *     sigue trabajando en memoria en vez de romperse.
 *
 * Encima de eso hay una capa remota opcional (Supabase, a través de
 * `/api/banca`). `localStorage` sigue siendo la copia inmediata —la interfaz no
 * espera a la red— y el servidor es el respaldo que sobrevive a cambiar de
 * navegador. Si Supabase no está configurado o falla, no se nota nada.
 */

import { useCallback, useSyncExternalStore } from "react";
import { BANCA_INICIAL, type EstadoBanca } from "./banca";

const CLAVE = "casa-de-apuesta:banca";
const CLAVE_DISPOSITIVO = "casa-de-apuesta:dispositivo";

const oyentes = new Set<() => void>();
let cacheCrudo: string | null = null;
let cacheValor: EstadoBanca = BANCA_INICIAL;
let soloMemoria = false;
let remotoConsultado = false;
let estadoRemoto: "sin-configurar" | "sincronizado" | "error" | "pendiente" = "pendiente";

/**
 * Identificador estable por navegador. Sin autenticación es lo único que
 * separa la sesión de un dispositivo de la de otro; no se usa como credencial.
 */
function dispositivo(): string {
  try {
    const guardado = window.localStorage.getItem(CLAVE_DISPOSITIVO);
    if (guardado) return guardado;
    const nuevo =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "")
        : `d${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(CLAVE_DISPOSITIVO, nuevo);
    return nuevo;
  } catch {
    return "sin-almacenamiento";
  }
}

export function estadoSincronizacion() {
  return estadoRemoto;
}

/** Empuja el estado al servidor sin bloquear la interfaz. */
function empujarARemoto(valor: EstadoBanca): void {
  fetch(`/api/banca?dispositivo=${encodeURIComponent(dispositivo())}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(valor),
  })
    .then((r) => r.json())
    .then((r: { ok: boolean; motivo?: string }) => {
      estadoRemoto = r.ok
        ? "sincronizado"
        : r.motivo?.includes("no está configurado")
          ? "sin-configurar"
          : "error";
      for (const avisar of oyentes) avisar();
    })
    .catch(() => {
      estadoRemoto = "error";
    });
}

/**
 * Trae lo guardado en el servidor la primera vez que alguien se suscribe.
 * Solo adopta el estado remoto si aquí no había nada: lo que el usuario acaba
 * de hacer en este navegador manda sobre una copia antigua del servidor.
 */
function traerDeRemoto(): void {
  if (remotoConsultado) return;
  remotoConsultado = true;

  fetch(`/api/banca?dispositivo=${encodeURIComponent(dispositivo())}`)
    .then((r) => r.json())
    .then((r: { ok: boolean; estado?: EstadoBanca; motivo?: string }) => {
      if (!r.ok) {
        estadoRemoto = r.motivo?.includes("no está configurado")
          ? "sin-configurar"
          : "error";
      } else {
        estadoRemoto = "sincronizado";
        const local = leerSnapshot();
        const vacioAqui = local.apuestas.length === 0 && local.historial.length === 0;
        if (r.estado && vacioAqui) {
          cacheValor = r.estado;
          cacheCrudo = JSON.stringify(r.estado);
          try {
            window.localStorage.setItem(CLAVE, cacheCrudo);
          } catch {
            soloMemoria = true;
          }
        }
      }
      for (const avisar of oyentes) avisar();
    })
    .catch(() => {
      estadoRemoto = "error";
      for (const avisar of oyentes) avisar();
    });
}

/** Un estado guardado por una versión anterior no debe tumbar el panel. */
function validar(crudo: string | null): EstadoBanca | null {
  if (!crudo) return null;
  try {
    const dato = JSON.parse(crudo) as EstadoBanca;
    if (
      typeof dato?.bancaInicial !== "number" ||
      typeof dato?.riesgoBase !== "number" ||
      !Array.isArray(dato?.apuestas) ||
      !Array.isArray(dato?.historial)
    ) {
      return null;
    }
    return dato;
  } catch {
    return null;
  }
}

function leerSnapshot(): EstadoBanca {
  if (soloMemoria) return cacheValor;

  let crudo: string | null = null;
  try {
    crudo = window.localStorage.getItem(CLAVE);
  } catch {
    soloMemoria = true;
    return cacheValor;
  }

  if (crudo === cacheCrudo) return cacheValor;
  cacheCrudo = crudo;
  cacheValor = validar(crudo) ?? BANCA_INICIAL;
  return cacheValor;
}

function snapshotServidor(): EstadoBanca {
  return BANCA_INICIAL;
}

function suscribir(avisar: () => void): () => void {
  oyentes.add(avisar);
  traerDeRemoto();
  // El evento `storage` mantiene sincronizadas dos pestañas abiertas a la vez.
  window.addEventListener("storage", avisar);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener("storage", avisar);
  };
}

export type Actualizador = EstadoBanca | ((previo: EstadoBanca) => EstadoBanca);

/**
 * El prefijo `use` no es opcional aunque el resto del proyecto esté en español:
 * las reglas de hooks de React identifican los hooks por ese nombre.
 */
export function useBanca(): [EstadoBanca, (siguiente: Actualizador) => void] {
  const estado = useSyncExternalStore(suscribir, leerSnapshot, snapshotServidor);

  const escribir = useCallback((siguiente: Actualizador) => {
    const valor =
      typeof siguiente === "function" ? siguiente(leerSnapshot()) : siguiente;
    const crudo = JSON.stringify(valor);

    try {
      window.localStorage.setItem(CLAVE, crudo);
    } catch {
      soloMemoria = true;
    }

    cacheCrudo = crudo;
    cacheValor = valor;
    empujarARemoto(valor);
    for (const avisar of oyentes) avisar();
  }, []);

  return [estado, escribir];
}
