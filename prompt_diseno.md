# Prompt para Claude (diseño) — copiar y pegar desde acá hasta el final

Quiero que diseñes una web app de estadísticas del fútbol uruguayo. Necesito el
diseño visual completo (no la lógica de datos, que ya está resuelta). Entregame
un mockup en HTML/CSS navegable con datos de ejemplo realistas, que después un
desarrollador va a conectar a los datos reales.

## Nombre y personalidad

Nombre de trabajo: **LaTabla.uy** (alternativas si proponés algo mejor:
EstadioUY, DatosCharrúas). Personalidad: sitio de datos deportivos serio y
limpio, estilo FlashScore/Sofascore pero más sobrio. Identidad uruguaya con
acento celeste (#75AADB o similar). MUY IMPORTANTE: nada de estética de casa de
apuestas — sin cuotas, sin verde-dinero, sin urgencia. Es un sitio de consulta
para hinchas.

## Contexto técnico (restricciones duras)

- Sitio 100% estático alojado en GitHub Pages: sin backend, sin login, sin
  base de datos. Todo es HTML + CSS + JavaScript vanilla leyendo archivos JSON
  locales. No usar frameworks (ni React ni Tailwind), no asumir build step.
- Los datos se actualizan ~1 vez por día con un script. El header debe mostrar
  "Actualizado: [fecha y hora]" de forma visible pero discreta.
- Mobile-first obligatorio: la mayoría va a entrar del celular. Las tablas
  deben tener una versión reducida en pantalla chica (decidir qué columnas
  sobreviven en 380px de ancho).
- Idioma: español rioplatense (es-UY). Fechas formato DD/MM.

## Datos disponibles (diseñar SOLO con esto)

**Torneos:** Primera División y Segunda División de Uruguay, temporada 2026.

1. **Tablas de posiciones** (varias por torneo: Apertura, Tabla Anual,
   Intermedio Grupo A y B): posición, equipo, PJ, G, E, P, GF, GC, diferencia,
   puntos, y racha de últimos 5 (G/E/P). 16 equipos en Primera.
2. **Fixture y resultados**: 153 partidos por temporada con fecha, hora, número
   de fecha (ronda), equipos y marcador. Hay partidos jugados y pendientes.
3. **Goleadores** (ranking de liga): nombre, equipo, goles, partidos jugados,
   minutos, minutos por gol, goles de cabeza, penales.
4. **Planteles** (16 equipos, ~450 jugadores): dorsal, nombre, posición
   (arquero/defensa/mediocampista/delantero), edad, nacionalidad, altura, pie
   hábil, valor de mercado estimado, y stats de la temporada: PJ, goles,
   amarillas, rojas, minutos, tiros y tiros al arco.

## Datos que NO existen (no diseñar nada que los necesite)

- NO hay asistencias ni titularidades (la fuente las trae vacías).
- NO hay fotos de jugadores ni escudos de clubes. Resolver identidad visual de
  equipos sin imágenes: monogramas/iniciales en círculos de color, o solo
  tipografía. Asignar un color por club es válido (Peñarol amarillo/negro,
  Nacional blanco/azul/rojo, etc.).
- NO hay datos en vivo minuto a minuto, ni xG, ni posesión, ni historial de
  temporadas anteriores (solo 2026).
- NO hay noticias, ni comentarios, ni contenido editorial.

## Vistas a diseñar (5)

1. **Inicio / Tabla**: selector de torneo (Primera/Segunda) y de tabla
   (Apertura/Anual/Intermedio), tabla de posiciones con racha. Es la vista
   principal y la cara del sitio. Indicar visualmente zonas de la tabla
   (líder, descenso) si mejora la lectura.
2. **Fixture**: partidos pendientes agrupados por fecha (ronda), con día y hora.
3. **Resultados**: partidos jugados, más recientes primero, agrupados por fecha.
4. **Goleadores**: ranking top 25 con goles destacados y stats secundarias.
5. **Plantel de equipo**: selector de equipo, jugadores agrupados por posición
   con sus stats. Considerar una mini-ficha o fila expandible por jugador para
   los datos extra (altura, pie, valor de mercado, tiros).

Estados especiales a contemplar: "sin partidos esta semana" (hay parones, p.ej.
el Mundial), y jornada a medio jugar.

## Entregable

- Un único archivo HTML con CSS embebido, navegable (las 5 vistas con tabs o
  navegación simple), con datos de ejemplo del fútbol uruguayo real
  (Peñarol, Nacional, Racing, Defensor Sporting, etc.).
- Definir y documentar en comentarios CSS: paleta de colores (variables CSS),
  tipografía (system fonts o Google Fonts máximo 1 familia), espaciados, y los
  componentes reutilizables (tabla, chip de racha, fila de partido, card).
- Tema claro como base; si proponés tema oscuro, que sea variante opcional.
