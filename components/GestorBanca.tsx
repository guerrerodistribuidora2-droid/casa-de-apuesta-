"use client";

import { useState } from "react";
import { cuotaJusta, type Lectura } from "@/data/mockData";
import type { Recomendacion } from "@/lib/analista";
import { valorEsperado } from "@/lib/apiConnector";
import { useBanca } from "@/lib/almacenBanca";
import {
  cerrarCiclo,
  dinero,
  importeSugerido,
  resumir,
  type Apuesta,
} from "@/lib/banca";

/**
 * Gestor de banca y seguimiento de sesión.
 *
 * El estado vive en `localStorage` a través de `useBanca`, que lo expone como
 * almacén externo: el servidor renderiza los valores por defecto y el navegador
 * sustituye por lo guardado sin desajuste de hidratación.
 */
/**
 * La cuota con la que se liquida. Si la API trajo precio real de mercado se usa
 * ese; si no, la cuota justa, que no deja margen por construcción.
 */
function cuotaDe(lectura: Lectura): number {
  return lectura.cuotaMercado ?? cuotaJusta(lectura);
}

export default function GestorBanca({ picks }: { picks: Recomendacion[] }) {
  const [estado, setEstado] = useBanca();
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);

  const resumen = resumir(estado);
  const puestas = new Map(estado.apuestas.map((a) => [a.id, a]));

  function apostar(pick: Recomendacion) {
    const id = `${pick.partido.id}|${pick.lectura.mercado}`;
    if (puestas.has(id)) return;

    const apuesta: Apuesta = {
      id,
      partido: `${pick.partido.local.nombre} contra ${pick.partido.visitante.nombre}`,
      mercado: pick.lectura.mercado,
      confianza: pick.confianza,
      cuota: Math.round(cuotaDe(pick.lectura) * 100) / 100,
      importe: importeSugerido(estado.bancaInicial, estado.riesgoBase, pick.confianza),
      estado: "pendiente",
    };
    setEstado((e) => ({ ...e, apuestas: [...e.apuestas, apuesta] }));
  }

  function marcar(id: string, nuevo: Apuesta["estado"]) {
    setEstado((e) => ({
      ...e,
      apuestas: e.apuestas.map((a) =>
        a.id === id ? { ...a, estado: a.estado === nuevo ? "pendiente" : nuevo } : a,
      ),
    }));
  }

  function quitar(id: string) {
    setEstado((e) => ({ ...e, apuestas: e.apuestas.filter((a) => a.id !== id) }));
  }

  return (
    <section aria-labelledby="banca" className="mt-12 border-t-2 border-t-tiza-media">
      <header className="flex flex-col gap-4 border-x border-b border-regla bg-tinta-800 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="banca" className="font-display text-2xl leading-none font-semibold">
            Gestor de banca
          </h2>
          <p className="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-tiza-media">
            Ciclo {estado.ciclo}. El importe sugerido escala con la confianza de cada
            lectura sobre el riesgo base que fijes.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-4">
          <Campo
            etiqueta="Banca inicial"
            valor={estado.bancaInicial}
            paso={50}
            onCambio={(v) => setEstado((e) => ({ ...e, bancaInicial: v }))}
          />
          <Campo
            etiqueta="Riesgo base %"
            valor={estado.riesgoBase}
            paso={0.5}
            maximo={20}
            onCambio={(v) => setEstado((e) => ({ ...e, riesgoBase: v }))}
          />
        </div>
      </header>

      <div className="grid gap-px border-x border-b border-regla bg-regla sm:grid-cols-2 lg:grid-cols-4">
        <Tile etiqueta="Balance" valor={dinero(resumen.balance)} destacar />
        <Tile
          etiqueta="Resultado del ciclo"
          valor={`${resumen.variacion >= 0 ? "+" : ""}${dinero(resumen.variacion)}`}
          tono={resumen.variacion > 0 ? "jade" : resumen.variacion < 0 ? "oxido" : "tiza"}
          pie={`${resumen.variacion >= 0 ? "+" : ""}${resumen.variacionPorcentual.toFixed(1)}%`}
        />
        <Tile
          etiqueta="En juego"
          valor={dinero(resumen.expuesto)}
          pie={`${resumen.pendientes} ${resumen.pendientes === 1 ? "apuesta" : "apuestas"}`}
        />
        <Tile
          etiqueta="Ganadas / perdidas"
          valor={`${resumen.ganadas} / ${resumen.perdidas}`}
          pie={`+${dinero(resumen.ganado)} · -${dinero(resumen.perdido)}`}
        />
      </div>

      <div className="grid gap-4 border-x border-b border-regla bg-tinta-900 p-4 lg:grid-cols-2">
        <div>
          <p className="text-[12px] text-tiza-tenue">Picks disponibles</p>
          <ul className="mt-2 space-y-2">
            {picks.length === 0 && (
              <li className="text-[13px] text-tiza-tenue">
                No hay recomendaciones en esta selección.
              </li>
            )}
            {picks.map((pick) => {
              const id = `${pick.partido.id}|${pick.lectura.mercado}`;
              const yaPuesta = puestas.has(id);
              const sugerido = importeSugerido(
                estado.bancaInicial,
                estado.riesgoBase,
                pick.confianza,
              );

              return (
                <li
                  key={id}
                  className="border-l-2 border-regla bg-tinta-800 px-3.5 py-3"
                >
                  <p className="truncate text-[12px] text-tiza-tenue">
                    {pick.partido.local.nombre} contra {pick.partido.visitante.nombre}
                  </p>
                  <p className="mt-0.5 font-display text-[17px] leading-tight text-tiza">
                    {pick.lectura.mercado}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <span className="cifra text-[12px] text-tiza-media">
                      Confianza {pick.confianza}%
                    </span>
                    <span className="cifra text-[12px] text-tiza-media">
                      Cuota {cuotaDe(pick.lectura).toFixed(2)}
                      {pick.lectura.cuotaMercado ? " de mercado" : " justa"}
                    </span>
                    {(() => {
                      const ve = valorEsperado(pick.lectura);
                      if (ve === null) return null;
                      return (
                        <span
                          className={`cifra text-[12px] ${ve > 0 ? "text-jade" : "text-oxido"}`}
                        >
                          Ventaja {ve > 0 ? "+" : ""}
                          {(ve * 100).toFixed(1)}%
                        </span>
                      );
                    })()}
                    <span className="cifra font-display text-[19px] leading-none text-ambar">
                      {dinero(sugerido)}
                    </span>
                    <button
                      type="button"
                      onClick={() => apostar(pick)}
                      disabled={yaPuesta}
                      className="ml-auto rounded-[2px] border border-regla px-2.5 py-1 font-display text-[14px] leading-none text-tiza-media transition-colors hover:border-ambar hover:text-ambar disabled:border-regla disabled:text-tiza-tenue disabled:hover:border-regla disabled:hover:text-tiza-tenue"
                    >
                      {yaPuesta ? "En la sesión" : "Registrar"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <p className="text-[12px] text-tiza-tenue">
            Sesión en curso ({estado.apuestas.length})
          </p>
          <ul className="mt-2 space-y-2">
            {estado.apuestas.length === 0 && (
              <li className="text-[13px] leading-relaxed text-tiza-tenue">
                Registra un pick para empezar a seguir el ciclo.
              </li>
            )}
            {estado.apuestas.map((apuesta) => (
              <li
                key={apuesta.id}
                className={`border-l-2 bg-tinta-800 px-3.5 py-3 ${
                  apuesta.estado === "ganada"
                    ? "border-jade"
                    : apuesta.estado === "perdida"
                      ? "border-oxido"
                      : "border-ambar/55"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate text-[12px] text-tiza-tenue">{apuesta.partido}</p>
                  <button
                    type="button"
                    onClick={() => quitar(apuesta.id)}
                    className="shrink-0 text-[12px] text-tiza-tenue transition-colors hover:text-oxido"
                    aria-label={`Quitar ${apuesta.mercado} de la sesión`}
                  >
                    Quitar
                  </button>
                </div>
                <p className="mt-0.5 font-display text-[17px] leading-tight text-tiza">
                  {apuesta.mercado}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                  <span className="cifra text-[12px] text-tiza-media">
                    {dinero(apuesta.importe)} a {apuesta.cuota.toFixed(2)}
                  </span>
                  <span
                    className={`cifra text-[13px] ${
                      apuesta.estado === "ganada"
                        ? "text-jade"
                        : apuesta.estado === "perdida"
                          ? "text-oxido"
                          : "text-tiza-tenue"
                    }`}
                  >
                    {apuesta.estado === "ganada"
                      ? `+${dinero(apuesta.importe * (apuesta.cuota - 1))}`
                      : apuesta.estado === "perdida"
                        ? `-${dinero(apuesta.importe)}`
                        : "pendiente"}
                  </span>
                  <span className="ml-auto flex gap-1.5">
                    <Marcar
                      activo={apuesta.estado === "ganada"}
                      tono="jade"
                      onClick={() => marcar(apuesta.id, "ganada")}
                    >
                      Ganada
                    </Marcar>
                    <Marcar
                      activo={apuesta.estado === "perdida"}
                      tono="oxido"
                      onClick={() => marcar(apuesta.id, "perdida")}
                    >
                      Perdida
                    </Marcar>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-x border-b border-regla bg-tinta-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {confirmandoCierre ? (
            <p className="text-[13px] leading-relaxed text-tiza-media">
              Se cerrará el ciclo {estado.ciclo} con balance {dinero(resumen.balance)}
              {resumen.pendientes > 0 &&
                `, descartando ${resumen.pendientes} ${resumen.pendientes === 1 ? "apuesta pendiente" : "apuestas pendientes"}`}
              .
            </p>
          ) : (
            <p className="text-[13px] leading-relaxed text-tiza-tenue">
              Cerrar el ciclo archiva la sesión y arranca la siguiente con el balance
              actual como banca base.
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          {confirmandoCierre && (
            <button
              type="button"
              onClick={() => setConfirmandoCierre(false)}
              className="rounded-[2px] border border-regla px-3 py-1.5 font-display text-[15px] leading-none text-tiza-media transition-colors hover:text-tiza"
            >
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!confirmandoCierre) {
                setConfirmandoCierre(true);
                return;
              }
              setEstado(cerrarCiclo(estado));
              setConfirmandoCierre(false);
            }}
            className="rounded-[2px] border border-ambar/60 px-3 py-1.5 font-display text-[15px] leading-none text-ambar transition-colors hover:bg-ambar hover:text-tinta-900"
          >
            {confirmandoCierre ? "Confirmar cierre" : "Retirar / Reiniciar ciclo"}
          </button>
        </div>
      </div>

      {estado.historial.length > 0 && (
        <div className="border-x border-b border-regla bg-tinta-900 px-5 py-4">
          <p className="text-[12px] text-tiza-tenue">Ciclos cerrados</p>
          <ul className="mt-2 space-y-1">
            {[...estado.historial].reverse().map((c) => {
              const delta = c.final - c.inicial;
              return (
                <li key={c.numero} className="flex items-baseline gap-4 text-[13px]">
                  <span className="cifra w-16 shrink-0 text-tiza-media">Ciclo {c.numero}</span>
                  <span className="cifra text-tiza-tenue">
                    {dinero(c.inicial)} a {dinero(c.final)}
                  </span>
                  <span
                    className={`cifra ml-auto ${delta >= 0 ? "text-jade" : "text-oxido"}`}
                  >
                    {delta >= 0 ? "+" : ""}
                    {dinero(delta)}
                  </span>
                  <span className="cifra w-20 shrink-0 text-right text-tiza-tenue">
                    {c.apuestas} {c.apuestas === 1 ? "apuesta" : "apuestas"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <p className="mt-3 max-w-[92ch] text-[12px] leading-relaxed text-tiza-tenue">
        Cuando la API de cuotas responde, la apuesta se liquida al{" "}
        <span className="text-tiza-media">mejor precio real de mercado</span> y la ventaja
        mostrada es nuestra probabilidad contra ese precio. Si no hay precio, se usa la{" "}
        <span className="text-tiza-media">cuota justa</span>, derivada de nuestra propia
        estimación, que no deja margen por construcción. En ambos casos la ventaja vale lo
        que valga el modelo, y el modelo corre hoy sobre frecuencias simuladas: trátalo
        como una simulación de gestión de banca, no como una expectativa de beneficio.
      </p>
    </section>
  );
}

/**
 * Campo numérico con texto propio.
 *
 * Un `input type="number"` atado directamente al estado tiene dos problemas
 * reales: al vaciarlo para reescribirlo, `Number("")` vale 0 y dejaría la banca
 * a cero; y con locales que usan coma decimal el valor puede llegar sin parsear.
 * Aquí el texto es local, se normaliza la coma y solo se confirma cuando lo
 * escrito es un número válido. Al salir del campo, si quedó a medias, se
 * restaura el último valor bueno.
 */
function Campo({
  etiqueta,
  valor,
  paso,
  maximo,
  onCambio,
}: {
  etiqueta: string;
  valor: number;
  paso: number;
  maximo?: number;
  onCambio: (v: number) => void;
}) {
  const [texto, setTexto] = useState(String(valor));
  const [ultimo, setUltimo] = useState(valor);

  // Ajuste de estado durante el render: si el valor cambia desde fuera (cerrar
  // un ciclo, por ejemplo), el texto se pone al día sin pasar por un efecto.
  if (valor !== ultimo) {
    setUltimo(valor);
    setTexto(String(valor));
  }

  function escribir(entrada: string) {
    setTexto(entrada);
    const limpio = entrada.replace(",", ".").trim();
    if (limpio === "") return;
    const v = Number(limpio);
    if (!Number.isFinite(v) || v < 0) return;
    onCambio(maximo !== undefined ? Math.min(v, maximo) : v);
  }

  return (
    <label className="block">
      <span className="block text-[12px] text-tiza-tenue">{etiqueta}</span>
      <input
        type="text"
        inputMode="decimal"
        value={texto}
        step={paso}
        onChange={(e) => escribir(e.target.value)}
        onBlur={() => setTexto(String(valor))}
        className="cifra mt-1 w-32 rounded-[2px] border border-regla bg-tinta-900 px-2 py-1 font-display text-[20px] leading-none text-tiza"
      />
    </label>
  );
}

function Tile({
  etiqueta,
  valor,
  pie,
  destacar = false,
  tono = "tiza",
}: {
  etiqueta: string;
  valor: string;
  pie?: string;
  destacar?: boolean;
  tono?: "tiza" | "jade" | "oxido";
}) {
  const color =
    tono === "jade" ? "text-jade" : tono === "oxido" ? "text-oxido" : destacar ? "text-ambar" : "text-tiza";

  return (
    <div className="bg-tinta-800 px-4 py-3">
      <p className="text-[12px] text-tiza-tenue">{etiqueta}</p>
      <p className={`cifra mt-1 font-display text-[26px] leading-none font-semibold ${color}`}>
        {valor}
      </p>
      {pie && <p className="cifra mt-1 text-[12px] text-tiza-tenue">{pie}</p>}
    </div>
  );
}

function Marcar({
  activo,
  tono,
  onClick,
  children,
}: {
  activo: boolean;
  tono: "jade" | "oxido";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const encendido =
    tono === "jade" ? "border-jade text-jade" : "border-oxido text-oxido";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={`rounded-[2px] border px-2 py-0.5 text-[12px] leading-5 transition-colors ${
        activo ? encendido : "border-regla text-tiza-tenue hover:text-tiza"
      }`}
    >
      {children}
    </button>
  );
}
