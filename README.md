# Casa de Apuesta

Plataforma de análisis estadístico de apuestas deportivas y eSports. Lee
frecuencias históricas, las cruza con factores medidos del encuentro (árbitro,
fatiga, bajas, táctica por fases) y produce lecturas de probabilidad
explicables: cada cifra se puede auditar hasta el dato que la produjo.

**Cobertura real:** Liga MX, Premier League, Champions League, NBA, tenis y
UFC, siempre que The Odds API tenga eventos disponibles en ese momento y no se
haya agotado la cuota del plan. League of Legends y Valorant no tienen
cobertura en ningún proveedor conectado todavía — ver el aviso más abajo.

## Arranque

```bash
npm install
cp .env.example .env.local   # ODDS_API_KEY es la única variable que importa para ver partidos
npm run dev
```

Abre http://localhost:3000. **Sin `ODDS_API_KEY` (o si se agotó su cuota), el
tablero se muestra vacío a propósito**: esta versión no tiene ninguna reserva
de datos simulados — el pie de página explica disciplina por disciplina por
qué no hay partidos.

## Qué hay dentro

| Módulo | Qué hace |
|---|---|
| **IA Match Analyzer** | Puntúa cada mercado con seis factores ponderados y publica las tres mejores lecturas del día |
| **Motor multifactorial** | Deriva el peso de árbitro, calendario, bajas y táctica a partir de mediciones, no de pesos escritos a mano |
| **Noticias** | Lee feeds RSS públicos, filtra por palabras clave y autocompleta factores contextuales |
| **PitchAPI** | Contexto histórico real (VAEP, PPDA, heatmap) del último enfrentamiento ya jugado entre los dos equipos, cuando hay coincidencia |
| **Gestor de banca** | Presupuesto, stake por confianza, seguimiento de apuestas y ciclos de retiro |
| **Cartelera en vivo** | Liga MX, Premier, Champions, NBA, UFC y tenis, con estado real (no iniciado / en vivo / finalizado) y marcador desde The Odds API. Sin reserva local: una disciplina sin eventos, o eSports, no aparece |

> El módulo **In-Play** (reevaluación de mercados en directo con guion de
> eventos minuto a minuto) sigue en el código (`lib/enVivo.ts`,
> `components/SeccionEnVivo.tsx`) pero ya no se muestra en el tablero: todo su
> guion era ficticio y The Odds API no da eventos en vivo (solo cuotas y
> marcador), así que no había manera honesta de conectarlo a datos reales sin
> un proveedor distinto. Ver `DESPLIEGUE.md`.

## Principios del proyecto

Tres reglas que conviene respetar al tocar el código:

1. **Ninguna capa de red lanza, pero tampoco inventa nada al fallar.** Cuotas,
   noticias, PitchAPI y Supabase degradan a "sin datos" y explican el motivo;
   ninguna cae a un dato simulado para disimularlo. No existe un estado en el
   que la página se rompa por un problema de red, pero sí puede quedar vacía.
2. **Se distingue lo medido de lo inferido.** Un perfil arbitral comprobado pesa
   más que una baja deducida de un titular, y la interfaz muestra la procedencia
   de cada factor.
3. **Nada se presenta como más seguro de lo que es.** La confianza es una escala
   de presentación, no una probabilidad; el gestor de banca dice cuándo opera
   contra precios reales y cuándo no.

## Documentación

- **[CLAUDE.md](CLAUDE.md)** — guía técnica: arquitectura, decisiones y sus
  motivos, y qué respetar al añadir datos.
- **[DESPLIEGUE.md](DESPLIEGUE.md)** — variables de entorno, SQL de Supabase,
  gestión de cuota y pasos para Vercel.

## Comandos

```bash
npm run dev      # desarrollo
npm run build    # build de producción
npm start        # servir el build
npm run lint     # ESLint
npx tsc --noEmit # TypeScript estricto
```

## Aviso

Con `ODDS_API_KEY` configurada, los partidos de fútbol, NBA, UFC y tenis son
**reales** (equipos, fecha, cuota, estado y marcador) — el pie del tablero
dice exactamente qué disciplina está en vivo y cuál no, y por qué. eSports no
tiene cobertura en ningún proveedor conectado, y cualquier disciplina sin
eventos disponibles en ese momento (o sin cuota restante en el plan) tampoco
aparece: **esta versión no rellena ningún hueco con datos simulados.** En
ningún caso nada de lo que aparece aquí es una recomendación para apostar.
