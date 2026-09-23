/**
 * Puente entre el gestor de banca del navegador y Supabase.
 *
 * Existe para que la clave anónima se quede en el servidor: el componente habla
 * con esta ruta y nunca con Supabase directamente. Devuelve siempre 200 con un
 * cuerpo que dice si hubo suerte, porque un fallo de persistencia no debe
 * romper el panel: `localStorage` sigue siendo la copia inmediata.
 */

import { NextResponse } from "next/server";
import type { EstadoBanca } from "@/lib/banca";
import { guardarBanca, leerBanca, supabaseConfigurado } from "@/lib/supabase";

/** Un identificador de dispositivo razonable; no confiamos en él para nada. */
function dispositivoDe(url: string): string | null {
  const valor = new URL(url).searchParams.get("dispositivo");
  if (!valor || valor.length < 8 || valor.length > 64) return null;
  return /^[A-Za-z0-9_-]+$/.test(valor) ? valor : null;
}

export async function GET(peticion: Request) {
  if (!supabaseConfigurado()) {
    return NextResponse.json({ ok: false, motivo: "Supabase no está configurado" });
  }

  const dispositivo = dispositivoDe(peticion.url);
  if (!dispositivo) {
    return NextResponse.json({ ok: false, motivo: "Identificador no válido" });
  }

  return NextResponse.json(await leerBanca(dispositivo));
}

export async function PUT(peticion: Request) {
  if (!supabaseConfigurado()) {
    return NextResponse.json({ ok: false, motivo: "Supabase no está configurado" });
  }

  const dispositivo = dispositivoDe(peticion.url);
  if (!dispositivo) {
    return NextResponse.json({ ok: false, motivo: "Identificador no válido" });
  }

  let estado: EstadoBanca;
  try {
    estado = (await peticion.json()) as EstadoBanca;
  } catch {
    return NextResponse.json({ ok: false, motivo: "Cuerpo ilegible" });
  }

  // Validación mínima antes de escribir: no guardamos cualquier cosa.
  if (
    typeof estado?.bancaInicial !== "number" ||
    typeof estado?.riesgoBase !== "number" ||
    !Array.isArray(estado?.apuestas) ||
    !Array.isArray(estado?.historial)
  ) {
    return NextResponse.json({ ok: false, motivo: "Estado con forma inesperada" });
  }

  return NextResponse.json(await guardarBanca(dispositivo, estado));
}
