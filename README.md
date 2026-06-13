# LaTabla.uy — Estadísticas del fútbol uruguayo

Web app gratuita con estadísticas del fútbol uruguayo (Primera y Segunda División):
tablas de posiciones, fixture, resultados, goleadores y planteles. Sitio 100%
estático pensado para GitHub Pages, con el design system **LaTabla.uy**.

## Cómo funciona

**No hace falta scrapear con navegador.** La sección "Estadísticas en Vivo" de
Supermatch es un widget de **Sportradar**, y sus feeds JSON públicos responden a
llamadas HTTP directas:

```
https://stats.fn.sportradar.com/supermatch/es/America:Montevideo/gismo/<feed>
```

Feeds que usamos (categoría Uruguay = 57):

| Feed | Qué trae |
|---|---|
| `config_tree_mini/41/0` | Árbol de deportes/países/torneos (para encontrar season ids) |
| `stats_season_tables/<seasonid>` | Tablas de posiciones (Apertura, Anual, Intermedio...) |
| `stats_season_fixtures2/<seasonid>/1` | Fixture completo con resultados |
| `stats_season_goals/<seasonid>` | Estadísticas de goles por intervalo |

Temporadas actuales (junio 2026): Primera División = `139306`, Segunda = `140446`.
Cuando cambie la temporada, buscar el nuevo id en `config_tree_mini`.

**Datos de jugadores:** `stats_season_topgoals` viene vacío, pero los datos por
jugador SÍ existen vía equipo:

| Feed | Qué trae |
|---|---|
| `stats_teamplayer_facts/<teamid>/<seasonid>` | Por jugador: goles, PJ, minutos, tarjetas, tiros, posición, dorsal, edad, pie, valor de mercado |
| `stats_team_squad/<teamid>` | Plantel completo |
| `stats_team_info/<teamid>` | Ficha del club |

Los team ids salen de las tablas de posiciones (campo `equipo_id`).
Limitación real: las **asistencias** vienen en 0 para toda la liga (nivel de
cobertura de Sportradar), y el campo `started` (titularidades) es poco confiable.

## Archivos

- `fetch_stats.py` — descarga los feeds y genera `data/*.json` limpios.
  Correr con: `/Library/Frameworks/Python.framework/Versions/3.14/bin/python3 fetch_stats.py`
- `index.html` — shell de la app (header, tabs, contenedor). Carga `assets/`.
  Probar local: `python3 -m http.server 8765` y abrir http://localhost:8765
- `assets/styles.css` — entrada CSS (importa tokens + `app.css`).
- `assets/tokens/` — design system LaTabla.uy: `colors.css`, `typography.css`,
  `clubs.css` (colores de club para los monogramas), `spacing.css`, `base.css`.
- `assets/app.css` — estilos de componentes y vistas (traducción a CSS vanilla
  de los componentes React documentados en el handoff de diseño).
- `assets/app.js` — render: lee los JSON reales y arma las 5 vistas.
- `data/primera.json` — tablas + fixture normalizados. Cada partido trae el
  `torneo` (Apertura / Intermedio / Clausura), detectado por el `_tid`.
- `data/jugadores_primera.json` — 16 planteles con stats por jugador + rankings
  de goleadores. El campo `valor_tm` (valor de mercado de Transfermarkt) lo
  agrega `fetch_transfermarkt.py`.
- `fetch_transfermarkt.py` — enriquece los planteles con el valor de mercado de
  transfermarkt.es (Sportradar solo trae ~5%). Baja el plantel de cada club y
  empareja por nombre uno-a-uno dentro del club (~80% de cobertura). Correr
  DESPUÉS de `fetch_stats.py`. La UI prioriza `valor_tm` sobre el de Sportradar.
- `data/partidos_primera.json` — detalle por partido jugado (posesión, tiros,
  córners, faltas, offsides, tarjetas). Una llamada `match_details` por partido;
  es lo más lento del run (se puede saltar con `--sin-detalle`).
- `data/resumen.json` — fecha de actualización.

Foco actual: **solo Primera División**. Segunda quedó definida en el código pero
no se baja por defecto (`--torneo segunda` o `--torneo todos` para incluirla).
- `prompt_diseno.md` — prompt usado para pedir el diseño.
- `explore_stats*.py`, `exploracion*.json` — scripts de investigación inicial
  (cómo se descubrió la API). Ya en `.gitignore`; se pueden borrar.

## Vistas

Tabla · Fixture · Resultados · Goleadores · Planteles · **Jugá**.

- **Resultados**: cada fecha muestra a qué torneo pertenece (Apertura/Intermedio).
  Tocando un partido jugado se despliega el **detalle** (posesión, tiros, córners…).
- **Jugá — ¿Quién es?**: adiviná el jugador por pistas que se revelan de a una
  (posición, nacionalidad, edad, goles, club, pista final). Menos pistas = más
  puntos. Usa los ~450 jugadores reales con autocompletado.

## Diseño (LaTabla.uy)

El sistema visual está en `assets/tokens/` + `assets/app.css`. Reglas clave:
sitio de datos sobrio (nada de estética de apuestas), una sola tipografía
(Archivo), cifras tabulares, mobile-first (en 380px sobreviven Pos/Equipo/PJ/DIF/PTS).
**Tema único: verde cancha, solo oscuro** (sin modo claro). Identidad de clubes
por una barrita de color minimalista (no hay escudos; los colores están en
`tokens/clubs.css`). El handoff original de diseño quedó en
`~/Downloads/LaTabla.uy Design System.zip` (era celeste/claro; lo adaptamos a verde/oscuro).

## Formato de datos

```json
{
  "nombre": "Primera División 2026",
  "seasonid": 139306,
  "tablas": [{ "nombre": "...", "filas": [{ "pos", "equipo", "pj", "g", "e", "p", "gf", "gc", "dif", "pts" }] }],
  "fixture": [{ "fecha", "hora", "ronda", "local", "visitante", "gol_local", "gol_visitante", "jugado" }]
}
```

La racha (últimos 5) se calcula en el navegador a partir del fixture.

## Próximos pasos (pendientes)

1. **Publicar gratis**: crear repo en GitHub y activar GitHub Pages (la app es
   estática, costo cero). Verificar si los feeds de Sportradar responden desde
   GitHub Actions; si los bloquean, actualizar los JSON desde esta Mac y pushear.
2. **Actualización automática**: tarea programada que corra `fetch_stats.py` y
   haga push. (OJO: no tocar nada del LaunchAgent de las 02:55 existente.)
3. Posibles mejoras: página por equipo, head-to-head (`stats_h2h`), partidos en
   vivo (`match_timeline/<matchid>`), Copa Uruguay y torneos femeninos
   (ids en `config_tree.json`).
