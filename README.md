# Casa de Apuesta

Plataforma de análisis estadístico de apuestas deportivas y eSports. Lee
frecuencias históricas, las cruza con factores medidos del encuentro (árbitro,
fatiga, bajas, táctica por fases) y produce lecturas de probabilidad
explicables: cada cifra se puede auditar hasta el dato que la produjo.

**Cobertura:** Liga MX, Premier League, Champions League, NBA, tenis, UFC,
League of Legends y Valorant.

## Arranque

```bash
npm install
cp .env.example .env.local   # opcional: todo funciona sin claves
npm run dev
```

Abre http://localhost:3000. Sin variables de entorno la aplicación funciona con
los datos locales enriquecidos; cada clave añade una capacidad y ninguna es
obligatoria.

## Qué hay dentro

| Módulo | Qué hace |
|---|---|
| **IA Match Analyzer** | Puntúa cada mercado con seis factores ponderados y publica las tres mejores lecturas del día |
| **Motor multifactorial** | Deriva el peso de árbitro, calendario, bajas y táctica a partir de mediciones, no de pesos escritos a mano |
| **In-Play** | Reevalúa mercados en directo proyectando el ritmo sobre la línea, con panel de notas tácticas y alertas de línea rota |
| **Noticias** | Lee feeds RSS públicos, filtra por palabras clave y autocompleta factores contextuales |
| **Gestor de banca** | Presupuesto, stake por confianza, seguimiento de apuestas y ciclos de retiro |
| **Adaptador de cuotas** | Incorpora precios reales de The Odds API, con degradación transparente a datos locales |

## Principios del proyecto

Tres reglas que conviene respetar al tocar el código:

1. **Ninguna capa de red lanza.** Cuotas, noticias y Supabase degradan a los
   datos locales y explican el motivo. No existe un estado en el que la página
   se rompa por un problema de red.
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

Los datos de partidos son **simulados** y sirven para maquetar y probar la
plataforma. Nada de lo que muestra es una recomendación para apostar.
