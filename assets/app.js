/* ============================================================
   LaTabla.uy — Lógica de la app (vanilla JS, sin dependencias)
   Lee los JSON reales de data/ (generados por fetch_stats.py) y
   los renderiza con los componentes del design system.
   ============================================================ */

'use strict';

/* ---------------- utilidades ---------------- */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------- identidad de clubes ----------------
   Mapea el nombre del equipo (con o sin tildes) al slug de
   tokens/clubs.css y a su monograma de 3 letras. */
const CLUBS = {
  'penarol': { slug: 'penarol', abbr: 'PEÑ' },
  'nacional': { slug: 'nacional', abbr: 'NAC' },
  'defensor sporting': { slug: 'defensor', abbr: 'DEF' },
  'danubio': { slug: 'danubio', abbr: 'DAN' },
  'liverpool': { slug: 'liverpool', abbr: 'LIV' },
  'racing': { slug: 'racing', abbr: 'RAC' },
  'wanderers': { slug: 'wanderers', abbr: 'WAN' },
  'cerro': { slug: 'cerro', abbr: 'CER' },
  'boston river': { slug: 'boston', abbr: 'BOS' },
  'cerro largo': { slug: 'cerrolargo', abbr: 'CLA' },
  'progreso': { slug: 'progreso', abbr: 'PRO' },
  'juventud de las piedras': { slug: 'juventud', abbr: 'JUV' },
  'juventud': { slug: 'juventud', abbr: 'JUV' },
  'm.c. torque': { slug: 'torque', abbr: 'TOR' },
  'montevideo city torque': { slug: 'torque', abbr: 'TOR' },
  'dep maldonado': { slug: 'maldonado', abbr: 'MAL' },
  'deportivo maldonado': { slug: 'maldonado', abbr: 'MAL' },
  'albion': { slug: 'albion', abbr: 'ALB' },
  'central espanol': { slug: 'central', abbr: 'CEN' },
  'river plate': { slug: 'river', abbr: 'RIV' },
  'plaza colonia': { slug: 'plaza', abbr: 'PLA' },
  'miramar misiones': { slug: 'miramar', abbr: 'MIR' },
};

function resolverClub(nombre) {
  const key = norm(nombre);
  const hit = CLUBS[key];
  if (hit) {
    const s = hit.slug;
    return {
      bg: `var(--club-${s}-bg)`, fg: `var(--club-${s}-fg)`,
      ring: `var(--club-${s}-ring)`, abbr: hit.abbr,
    };
  }
  // Fallback: iniciales de las palabras significativas, gris neutro.
  const palabras = (nombre || '').split(/\s+/).filter((w) => w.length > 2);
  const abbr = (palabras.length >= 2
    ? palabras.slice(0, 3).map((w) => w[0]).join('')
    : (nombre || '??').slice(0, 3)).toUpperCase();
  return {
    bg: 'var(--club-default-bg)', fg: 'var(--club-default-fg)',
    ring: 'var(--club-default-ring)', abbr,
  };
}

/* Badge minimalista: una barra de color delgada con el color del club.
   Sin letras ni círculos — apenas un acento cromático delicado. */
function teamBadge(nombre, size = 18) {
  const c = resolverClub(nombre);
  return `<span class="team-kit" style="--kit:${c.bg};--kit-stripe:${c.ring};height:${size}px" aria-hidden="true"></span>`;
}

function teamCell(nombre, size = 18) {
  return `<span class="team-cell">${teamBadge(nombre, size)}<span class="team-cell__name">${esc(nombre)}</span></span>`;
}

/* ---------------- racha (FormRun) ---------------- */
function formChips(racha) {
  if (!racha) return '';
  const letras = racha.toUpperCase().split('').filter((x) => 'GEP'.includes(x));
  const viejas = Math.max(0, letras.length - 2); // las más viejas se atenúan
  return `<span class="form-run">${letras.map((l, i) =>
    `<span class="form-chip form-chip--${l.toLowerCase()}${i < viejas ? ' is-old' : ''}">${l}</span>`
  ).join('')}</span>`;
}

/* Calcula la racha (últimos 5, viejo→reciente) de un equipo desde el fixture. */
function calcularRacha(fixture, equipo, n = 5) {
  const jugados = fixture
    .filter((p) => p.jugado && (p.local === equipo || p.visitante === equipo))
    .sort((a, b) => (a.uts || 0) - (b.uts || 0))
    .slice(-n);
  return jugados.map((p) => {
    const esLocal = p.local === equipo;
    const gf = esLocal ? p.gol_local : p.gol_visitante;
    const gc = esLocal ? p.gol_visitante : p.gol_local;
    if (gf > gc) return 'G';
    if (gf < gc) return 'P';
    return 'E';
  }).join('');
}

/* ---------------- zonas de tabla ----------------
   Orientativas: el descenso real se define por la Tabla Anual y
   las reglas de la AUF pueden variar. Se marca el líder siempre y,
   en la Anual, las dos últimas posiciones como referencia. */
function zonasDeTabla(nombreTabla, filas) {
  const nombre = norm(nombreTabla);
  const zonas = {};
  const leyenda = [];
  let nota = '';
  const ultimaPos = filas.length ? filas[filas.length - 1].pos : 0;

  if (nombre.includes('apertura')) {
    zonas[1] = 'lider';
    leyenda.push({ zona: 'lider', label: 'Líder del Apertura' });
  } else if (nombre.includes('clausura')) {
    zonas[1] = 'lider';
    leyenda.push({ zona: 'lider', label: 'Líder del Clausura' });
  } else if (nombre.includes('overall') || nombre.includes('anual')) {
    zonas[1] = 'lider';
    leyenda.push({ zona: 'lider', label: 'Puntero de la Anual' });
    if (filas.length >= 6) {
      zonas[ultimaPos] = 'descenso';
      zonas[ultimaPos - 1] = 'descenso';
      leyenda.push({ zona: 'descenso', label: 'Zona de descenso' });
      nota = 'Zonas orientativas — el descenso lo define la AUF.';
    }
  } else if (nombre.includes('group') || nombre.includes('intermedio')) {
    zonas[1] = 'lider';
    leyenda.push({ zona: 'lider', label: 'Líder de la zona' });
  } else {
    zonas[1] = 'lider';
    leyenda.push({ zona: 'lider', label: 'Líder' });
  }
  return { zonas, leyenda, nota };
}

/* ---------------- formato ---------------- */
function nombreLegible(nombre) {
  // "Apellido, Nombre" -> "Nombre Apellido"; deja igual si no tiene coma.
  if (nombre && nombre.includes(',')) {
    const [ap, no] = nombre.split(',').map((x) => x.trim());
    return `${no} ${ap}`.trim();
  }
  return nombre || '';
}
function inicialApellido(nombre) {
  // "Apellido, Nombre" -> "N. Apellido"
  if (nombre && nombre.includes(',')) {
    const [ap, no] = nombre.split(',').map((x) => x.trim());
    return no ? `${no[0]}. ${ap}` : ap;
  }
  const partes = (nombre || '').split(/\s+/);
  if (partes.length >= 2) return `${partes[0][0]}. ${partes.slice(1).join(' ')}`;
  return nombre || '';
}
function fmtValor(v) {
  if (!v || v <= 0) return '—';
  if (v >= 1e6) return `€ ${(v / 1e6).toFixed(1).replace('.', ',')} M`;
  if (v >= 1e3) return `€ ${Math.round(v / 1e3)} mil`;
  return `€ ${v}`;
}
function fmtAltura(cm) {
  if (!cm) return '—';
  return (cm / 100).toFixed(2).replace('.', ',') + ' m';
}
// Temporada actual (cuando agreguemos años, esto pasa a ser dinámico).
const TEMPORADA = '2026';

/* Nombre amigable de una tabla de posiciones de Sportradar.
   "Primera Division 2026, Apertura" -> "Apertura - 2026", etc. */
function nombreTabla(nombre) {
  const n = norm(nombre);
  const anio = (nombre.match(/20\d{2}/) || [TEMPORADA])[0];
  if (n.includes('apertura')) return `Apertura - ${anio}`;
  if (n.includes('clausura')) return `Clausura - ${anio}`;
  if (n.includes('overall') || n.includes('anual')) return `Anual - ${anio}`;
  if (n.includes('group a')) return `Intermedio Grupo A - ${anio}`;
  if (n.includes('group b')) return `Intermedio Grupo B - ${anio}`;
  if (n.includes('intermedio')) return `Intermedio - ${anio}`;
  return nombre;
}

/* Nombre amigable de un torneo de partido (fixture/resultados). */
function nombreTorneo(torneo) {
  return `${torneo} - ${TEMPORADA}`;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
function diaLabel(p) {
  if (p.uts) {
    const d = new Date(p.uts * 1000);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${DIAS[d.getDay()]} ${dd}/${mm}`;
  }
  // Fallback: fecha "DD/MM/YY" -> "DD/MM"
  return (p.fecha || '').slice(0, 5);
}
function fmtActualizado(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso || '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

/* ---------------- estado + datos ---------------- */
const state = {
  torneo: 'primera',
  vista: 'tabla',
  tablaIdx: 0,
  equipoIdx: 0,
  torneoResultados: null, // se fija al torneo en disputa en el primer render
};
const cache = {};      // torneo -> data
const cacheJug = {};   // torneo -> jugadores

async function cargar(torneo) {
  if (!cache[torneo]) {
    const r = await fetch(`data/${torneo}.json`);
    cache[torneo] = await r.json();
  }
  return cache[torneo];
}
async function cargarJug(torneo) {
  if (cacheJug[torneo] === undefined) {
    try {
      const r = await fetch(`data/jugadores_${torneo}.json`);
      cacheJug[torneo] = r.ok ? await r.json() : null;
    } catch { cacheJug[torneo] = null; }
  }
  return cacheJug[torneo];
}
const cachePartidos = {}; // torneo -> {matchid: detalle}
async function cargarPartidos(torneo) {
  if (cachePartidos[torneo] === undefined) {
    try {
      const r = await fetch(`data/partidos_${torneo}.json`);
      cachePartidos[torneo] = r.ok ? await r.json() : null;
    } catch { cachePartidos[torneo] = null; }
  }
  return cachePartidos[torneo];
}

/* ---------------- componentes de UI ---------------- */
function card({ title, accesorio, body, flush }) {
  const head = (title || accesorio)
    ? `<div class="card__head"><h2 class="card__title">${esc(title || '')}</h2>${accesorio || ''}</div>`
    : '';
  return `<section class="card">${head}<div class="card__body${flush ? ' card__body--flush' : ''}">${body}</div></section>`;
}
function segmented(items, valor, attr) {
  return `<div class="segmented" role="tablist">${items.map((it) =>
    `<button class="seg${it.id === valor ? ' is-active' : ''}" data-${attr}="${esc(it.id)}">${esc(it.label)}</button>`
  ).join('')}</div>`;
}
function emptyState(titulo, detalle) {
  return `<div class="empty-state"><div class="empty-state__rule"></div>
    <h3 class="empty-state__title">${esc(titulo)}</h3>
    <p class="empty-state__detail">${esc(detalle)}</p></div>`;
}

/* ---------------- vista: Tabla ---------------- */
function vistaTabla(d) {
  const tabla = d.tablas[state.tablaIdx] || d.tablas[0];
  if (!tabla) return card({ body: emptyState('Sin tabla', 'No hay datos de posiciones para este torneo.') });
  const { zonas, leyenda, nota } = zonasDeTabla(tabla.nombre, tabla.filas);

  const filasHtml = tabla.filas.map((r) => {
    const zona = zonas[r.pos];
    const racha = calcularRacha(d.fixture, r.equipo);
    const difClass = r.dif > 0 ? 'pos' : (r.dif < 0 ? 'neg' : '');
    return `<tr class="${zona ? 'zona-' + zona : ''}">
      <td class="col-pos tnum">${zona ? '<span class="zona-bar"></span>' : ''}${r.pos}</td>
      <td class="col-equipo">${teamCell(r.equipo, 24)}</td>
      <td class="tnum">${r.pj}</td>
      <td class="tnum hide-md">${r.g}</td>
      <td class="tnum hide-md">${r.e}</td>
      <td class="tnum hide-md">${r.p}</td>
      <td class="tnum hide-md">${r.gf}</td>
      <td class="tnum hide-md">${r.gc}</td>
      <td class="col-dif tnum"><span class="${difClass}">${r.dif > 0 ? '+' : ''}${r.dif}</span></td>
      <td class="col-pts tnum">${r.pts}</td>
      <td class="hide-sm">${racha ? formChips(racha) : ''}</td>
    </tr>`;
  }).join('');

  const leyendaHtml = leyenda.length ? `<div class="leyenda">
    ${leyenda.map((l) => `<span class="leyenda__item"><span class="leyenda__dot" style="background:var(--zona-${l.zona})"></span>${esc(l.label)}</span>`).join('')}
    ${nota ? `<span class="leyenda__nota">${esc(nota)}</span>` : ''}
  </div>` : '';

  const body = `<div class="tabla-wrap"><table class="standings">
    <thead><tr>
      <th class="col-pos">#</th>
      <th class="col-equipo">Equipo</th>
      <th>PJ</th>
      <th class="hide-md">G</th><th class="hide-md">E</th><th class="hide-md">P</th>
      <th class="hide-md">GF</th><th class="hide-md">GC</th>
      <th>DIF</th><th>PTS</th>
      <th class="hide-sm">Racha</th>
    </tr></thead>
    <tbody>${filasHtml}</tbody>
  </table></div>${leyendaHtml}`;

  return card({ title: nombreTabla(tabla.nombre), flush: true, body });
}

/* ---------------- agrupar partidos por torneo + fecha (ronda) y día ----------------
   Apertura e Intermedio reusan números de fecha, así que la clave es torneo|ronda.
   Los grupos se ordenan por su fecha real (uts), no por el número de ronda. */
function agruparPorRonda(partidos, desc) {
  const grupos = new Map();
  for (const p of partidos) {
    const key = `${p.torneo || 'Apertura'}|${p.ronda ?? 0}`;
    if (!grupos.has(key)) grupos.set(key, []);
    grupos.get(key).push(p);
  }
  const arr = [...grupos.entries()].map(([key, lista]) => {
    const [torneo, ronda] = key.split('|');
    lista.sort((a, b) => (a.uts || 0) - (b.uts || 0));
    const repUts = Math.max(...lista.map((p) => p.uts || 0));
    const porDia = new Map();
    for (const p of lista) {
      const dia = diaLabel(p);
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia).push(p);
    }
    return {
      torneo, ronda: Number(ronda), repUts,
      dias: [...porDia.entries()].map(([dia, ps]) => ({ dia, partidos: ps })),
    };
  });
  arr.sort((a, b) => desc ? b.repUts - a.repUts : a.repUts - b.repUts);
  return arr;
}

function matchRow(p) {
  let centro, clase = '';
  if (p.jugado) {
    centro = `<span class="match-row__score tnum">${p.gol_local} – ${p.gol_visitante}</span>`;
    if (p.gol_local > p.gol_visitante) clase = 'is-home-win';
    else if (p.gol_local < p.gol_visitante) clase = 'is-away-win';
    else clase = 'is-draw';
  } else if (p.estado && /aplaz|suspend|posterg/i.test(p.estado)) {
    centro = `<span class="match-row__apl">APL</span>`;
  } else {
    centro = `<span class="match-row__time tnum">${esc(p.hora || 'vs')}</span>`;
  }
  // Solo los partidos jugados son clickeables (tienen detalle).
  const clickable = p.jugado ? ' is-clickable' : '';
  const dataMatch = p.jugado ? ` data-match-id="${p.id}"` : '';
  const chev = p.jugado ? `<span class="match-row__chev-m">▾</span>` : '';
  return `<div class="match-row ${clase}${clickable}"${dataMatch}>
    <div class="match-row__side match-row__side--home">${teamCell(p.local, 20)}</div>
    <div class="match-row__center">${centro}${chev}</div>
    <div class="match-row__side match-row__side--away">${teamCell(p.visitante, 20)}</div>
  </div>${p.jugado ? `<div class="match-detail" hidden data-match-detail="${p.id}"></div>` : ''}`;
}

/* Render del panel de detalle de un partido (posesión, tiros, etc.). */
const CMP_FILAS = [
  ['tiros_arco', 'Tiros al arco'],
  ['tiros_fuera', 'Tiros afuera'],
  ['corners', 'Córners'],
  ['faltas', 'Faltas'],
  ['offsides', 'Offsides'],
  ['amarillas', 'Amarillas'],
  ['rojas', 'Rojas'],
];
function barra(h, a, lado) {
  const tot = (h || 0) + (a || 0);
  const pct = tot ? Math.round(((lado === 'h' ? h : a) || 0) / tot * 100) : 0;
  return `<div class="cmp__half cmp__half--${lado}"><span class="cmp__bar cmp__bar--${lado}" style="width:${pct}%"></span></div>`;
}
function detallePartido(det) {
  if (!det) return '<div class="cmp__label" style="text-align:center;padding:8px">Sin estadísticas para este partido.</div>';
  let html = '';
  const pos = det.posesion;
  if (pos && (pos.home != null || pos.away != null)) {
    html += `<div class="match-detail__pos">
      <div class="match-detail__pos-top"><b>${pos.home ?? 0}%</b><span>Posesión</span><b>${pos.away ?? 0}%</b></div>
      <div class="pos-bar"><span class="pos-bar__h" style="width:${pos.home ?? 0}%"></span><span class="pos-bar__a" style="width:${pos.away ?? 0}%"></span></div>
    </div>`;
  }
  for (const [clave, label] of CMP_FILAS) {
    const v = det[clave];
    if (!v || (v.home == null && v.away == null)) continue;
    html += `<div class="cmp">
      <span class="cmp__h">${v.home ?? 0}</span>
      <div class="cmp__mid">
        <div class="cmp__label">${label}</div>
        <div class="cmp__bars">${barra(v.home, v.away, 'h')}${barra(v.home, v.away, 'a')}</div>
      </div>
      <span class="cmp__a">${v.away ?? 0}</span>
    </div>`;
  }
  return html || '<div class="cmp__label" style="text-align:center;padding:8px">Sin estadísticas para este partido.</div>';
}

function bloquesPartidos(grupos) {
  return grupos.map((g) => {
    const dias = g.dias.map((d) =>
      `<div class="matchday"><span class="matchday__title">${esc(d.dia)}</span></div>${d.partidos.map(matchRow).join('')}`
    ).join('');
    return card({
      title: `Fecha ${g.ronda}`,
      accesorio: `<span class="badge badge--torneo">${esc(g.torneo)}</span>`,
      flush: true,
      body: dias,
    });
  }).join('');
}

/* ---------------- vista: Fixture ----------------
   Solo partidos genuinamente futuros. Los partidos sin resultado cuya fecha
   ya pasó (aplazados/sin cargar) se muestran aparte para no confundir. */
function vistaFixture(d) {
  const ahora = Date.now() / 1000;
  const pendientes = d.fixture.filter((p) => !p.jugado);
  const futuros = pendientes.filter((p) => (p.uts || 0) >= ahora - 86400);
  const aplazados = pendientes.filter((p) => (p.uts || 0) < ahora - 86400);

  let html = '';
  if (futuros.length) {
    html += bloquesPartidos(agruparPorRonda(futuros, false));
  } else {
    html += card({
      body: emptyState('No hay próximos partidos programados',
        'El Apertura y el Intermedio ya se jugaron. Cuando la AUF publique el fixture del Clausura va a aparecer acá.'),
    });
  }
  if (aplazados.length) {
    const filas = aplazados
      .sort((a, b) => (a.uts || 0) - (b.uts || 0))
      .map(matchRow).join('');
    html += card({
      title: 'Pendientes de reprogramación',
      accesorio: `<span class="badge">${aplazados.length}</span>`,
      flush: true,
      body: filas,
    });
  }
  return html;
}

/* ---------------- vista: Resultados ----------------
   Filtrados por torneo (selector). Por defecto, el torneo en disputa
   (el de la última fecha con resultados). */
function vistaResultados(d) {
  const jugados = d.fixture.filter((p) => p.jugado);
  if (!jugados.length) {
    return card({ body: emptyState('Sin resultados todavía', 'Cuando se jueguen los primeros partidos van a aparecer acá.') });
  }
  const torneos = torneosDeResultados(d);
  if (!torneos.includes(state.torneoResultados)) state.torneoResultados = torneos[0];

  const delTorneo = jugados.filter((p) => (p.torneo || 'Apertura') === state.torneoResultados);
  const grupos = agruparPorRonda(delTorneo, true);
  return bloquesPartidos(grupos);
}

/* ---------------- vista: Goleadores ---------------- */
function vistaGoleadores(jug) {
  if (!jug || !jug.goleadores || !jug.goleadores.length) {
    return card({ body: emptyState('Goleadores no disponibles', 'Los datos por jugador están disponibles solo para Primera División.') });
  }
  const filas = jug.goleadores.slice(0, 25).map((j, i) => {
    const minxgol = j.goles ? Math.round(j.minutos / j.goles) : '—';
    const extra = [];
    if (j.goles_cabeza) extra.push(`${j.goles_cabeza} de cabeza`);
    if (j.penales) extra.push(`${j.penales} de penal`);
    const sub = `${j.pj} PJ · ${minxgol}′/gol${extra.length ? ' · ' + extra.join(' · ') : ''}`;
    return `<div class="scorer-row${i === 0 ? ' scorer-row--top' : ''}">
      <div class="scorer-row__rank tnum">${i + 1}</div>
      <div class="scorer-row__main">
        <div class="scorer-row__name">${esc(nombreLegible(j.nombre))}</div>
        <div class="scorer-row__sub">${teamBadge(j.equipo, 18)} ${esc(j.equipo)} · ${esc(sub)}</div>
      </div>
      <div class="scorer-row__goals"><b class="tnum">${j.goles}</b><span>Goles</span></div>
    </div>`;
  }).join('');
  return card({ title: 'Goleadores', accesorio: `<span class="badge badge--celeste">Primera</span>`, flush: true, body: filas });
}

/* ---------------- vista: Planteles ---------------- */
const POS_LABEL = { G: 'Arqueros', D: 'Defensas', M: 'Mediocampistas', F: 'Delanteros' };
const POS_ORDEN = ['G', 'D', 'M', 'F'];

function playerRow(j, idx) {
  const cards = [];
  if (j.amarillas) cards.push(`<span class="cuenta-tarjetas"><span class="card-tarjeta card-tarjeta--amarilla"></span>${j.amarillas}</span>`);
  if (j.rojas) cards.push(`<span class="cuenta-tarjetas"><span class="card-tarjeta card-tarjeta--roja"></span>${j.rojas}</span>`);
  // Solo mostramos el valor de Transfermarkt (verificable). El de Sportradar
  // es viejo/inflado, así que no se usa ni como fallback.
  const valor = j.valor_tm || null;
  const sub = [
    j.edad ? `${j.edad} años` : null,
    j.nacionalidad && j.nacionalidad !== 'Uruguay' ? j.nacionalidad : null,
    valor ? fmtValor(valor) : null,
  ].filter(Boolean).join(' · ');

  const detalle = `<div class="player-detail" hidden data-detail="${idx}">
    <div class="player-detail__item"><span>Altura</span><b>${fmtAltura(j.altura)}</b></div>
    <div class="player-detail__item"><span>Pie</span><b>${esc(j.pie || '—')}</b></div>
    <div class="player-detail__item"><span>Nacionalidad</span><b>${esc(j.nacionalidad || '—')}</b></div>
    <div class="player-detail__item"><span>Valor${j.tm_id ? ' <a class="tm-link" href="https://www.transfermarkt.es/x/profil/spieler/' + j.tm_id + '" target="_blank" rel="noopener">ver ↗</a>' : ''}</span><b>${fmtValor(valor)}</b></div>
    <div class="player-detail__item"><span>Minutos</span><b class="tnum">${j.minutos || 0}′</b></div>
    <div class="player-detail__item"><span>Tiros</span><b class="tnum">${j.tiros || 0}</b></div>
    <div class="player-detail__item"><span>Al arco</span><b class="tnum">${j.tiros_al_arco || 0}</b></div>
  </div>`;

  return `<button class="player-row" data-player="${idx}" aria-expanded="false">
    <span class="player-row__dorsal tnum">${j.dorsal || ''}</span>
    <span class="player-row__main">
      <span class="player-row__name">${esc(inicialApellido(j.nombre))}</span>
      ${sub ? `<span class="player-row__sub">${esc(sub)}</span>` : ''}
    </span>
    <span class="player-row__stats">
      <span class="player-row__stat"><b class="tnum">${j.pj || 0}</b><span>PJ</span></span>
      <span class="player-row__stat"><b class="tnum">${j.goles || 0}</b><span>Gol</span></span>
      <span class="player-row__stat stat-min"><b class="tnum">${j.minutos || 0}</b><span>Min</span></span>
      ${cards.length ? `<span class="player-row__stat">${cards.join(' ')}</span>` : ''}
      <span class="player-row__chev">▾</span>
    </span>
  </button>${detalle}`;
}

function vistaPlanteles(jug) {
  if (!jug || !jug.equipos || !jug.equipos.length) {
    return card({ body: emptyState('Planteles no disponibles', 'Los datos por jugador están disponibles solo para Primera División.') });
  }
  const eq = jug.equipos[state.equipoIdx] || jug.equipos[0];
  let body = '';
  let idx = 0;
  for (const tipo of POS_ORDEN) {
    const grupo = eq.jugadores.filter((j) => j.pos_tipo === tipo);
    if (!grupo.length) continue;
    body += `<div class="pos-header">${POS_LABEL[tipo]}</div>`;
    body += grupo.map((j) => playerRow(j, idx++)).join('');
  }
  const otros = eq.jugadores.filter((j) => !POS_LABEL[j.pos_tipo]);
  if (otros.length) {
    body += `<div class="pos-header">Otros</div>`;
    body += otros.map((j) => playerRow(j, idx++)).join('');
  }
  const head = `<span class="team-cell">${teamBadge(eq.nombre, 28)}<span class="team-cell__name">${esc(eq.nombre)}</span></span>`;
  return `<section class="card"><div class="card__head">${head}<span class="badge">${eq.jugadores.length} jugadores</span></div><div class="card__body card__body--flush">${body}</div></section>`;
}

/* ---------------- Juego: ¿Quién es? ----------------
   Adiviná el jugador a partir de pistas que se revelan de a una.
   Menos pistas usadas = más puntos. Usa el plantel real. */
const juego = {
  pool: [],
  nombres: [],     // nombres legibles para el autocompletado
  actual: null,
  pistas: [],
  reveladas: 1,
  estado: 'jugando', // 'jugando' | 'acertado' | 'rendido'
  puntos: 0,
  aciertos: 0,
  rondas: 0,
  feedback: null,
};

function prepararJuego(jug) {
  if (juego.pool.length) return;
  const todos = [];
  for (const eq of jug.equipos) {
    for (const j of eq.jugadores) todos.push(j);
  }
  // Solo jugadores con minutos suficientes (más reconocibles y justo).
  juego.pool = todos.filter((j) => (j.minutos || 0) >= 200);
  juego.nombres = [...new Set(juego.pool.map((j) => nombreLegible(j.nombre)))].sort();
}

const POS_JUEGO = { G: 'Arquero', D: 'Defensa', M: 'Mediocampista', F: 'Delantero' };

function pistasDe(j) {
  const goles = j.goles
    ? `Lleva ${j.goles} gol${j.goles === 1 ? '' : 'es'} en el torneo`
    : 'Todavía no marcó en el torneo';
  const inicial = nombreLegible(j.nombre).trim()[0] || '?';
  return [
    { label: 'Posición', valor: POS_JUEGO[j.pos_tipo] || j.posicion || '—' },
    { label: 'Nacionalidad', valor: j.nacionalidad || '—' },
    { label: 'Edad', valor: j.edad ? `${j.edad} años` : '—' },
    { label: 'Goles', valor: goles },
    { label: 'Club', valor: j.equipo },
    { label: 'Pista final', valor: `Usa la ${j.dorsal || '—'} · su nombre empieza con “${inicial}”` },
  ];
}

function nuevoJugador() {
  juego.actual = juego.pool[Math.floor(Math.random() * juego.pool.length)];
  juego.pistas = pistasDe(juego.actual);
  juego.reveladas = 1;
  juego.estado = 'jugando';
  juego.feedback = null;
  juego.rondas += 1;
}

function puntosPorRonda() {
  return Math.max(7 - juego.reveladas, 1);
}

function vistaJuego(jug) {
  if (!jug || !jug.equipos) {
    return card({ body: emptyState('Juego no disponible', 'El juego usa los datos de jugadores de Primera División.') });
  }
  prepararJuego(jug);
  if (!juego.actual) nuevoJugador();
  return `<section class="card"><div id="juego"></div></section>
    <datalist id="lista-jugadores">${juego.nombres.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>`;
}

function pintarJuego() {
  const cont = $('#juego');
  if (!cont) return;
  const j = juego.actual;
  const finalizado = juego.estado !== 'jugando';

  const pistas = juego.pistas.map((p, i) => {
    const visible = i < juego.reveladas || finalizado;
    return `<div class="pista ${visible ? '' : 'pista--oculta'}">
      <span class="pista__label">${esc(p.label)}</span>
      <span class="pista__valor">${visible ? esc(p.valor) : 'pista oculta'}</span>
    </div>`;
  }).join('');

  let bloqueFinal = '';
  if (finalizado) {
    bloqueFinal = `<div class="juego__revelado">
      <div class="nombre">${esc(nombreLegible(j.nombre))}</div>
      <div class="meta">${teamBadge(j.equipo, 16)} ${esc(j.equipo)} · ${esc(POS_JUEGO[j.pos_tipo] || j.posicion || '')} · ${j.edad || '?'} años</div>
    </div>
    <div class="juego__acciones"><button class="btn btn--primario" data-juego="siguiente">Siguiente jugador</button></div>`;
  } else {
    const fb = juego.feedback
      ? `<div class="juego__feedback juego__feedback--no">${esc(juego.feedback)}</div>` : '';
    bloqueFinal = `${fb}
      <form class="juego__form" id="form-juego" autocomplete="off">
        <input class="juego__input" id="guess" list="lista-jugadores" placeholder="Escribí el nombre del jugador…" />
        <button class="btn btn--primario" type="submit">Adivinar</button>
      </form>
      <div class="juego__acciones">
        <button class="btn" data-juego="pista" ${juego.reveladas >= juego.pistas.length ? 'disabled' : ''}>Otra pista (−1 punto)</button>
        <button class="btn" data-juego="rendirse">Me rindo</button>
      </div>`;
  }

  cont.innerHTML = `<div class="juego">
    <div class="juego__head">
      <div>
        <h2 class="card__title">¿Quién es?</h2>
        <div class="juego__sub">Adiviná el jugador. Vale ${puntosPorRonda()} punto${puntosPorRonda() === 1 ? '' : 's'} con las pistas actuales.</div>
      </div>
      <div class="juego__marcador">
        <div><b class="tnum">${juego.puntos}</b><span>Puntos</span></div>
        <div><b class="tnum">${juego.aciertos}/${juego.rondas}</b><span>Aciertos</span></div>
      </div>
    </div>
    <div class="pistas">${pistas}</div>
    ${bloqueFinal}
  </div>`;

  const input = $('#guess');
  if (input) input.focus();
}

function intentar(texto) {
  if (juego.estado !== 'jugando') return;
  const objetivo = norm(nombreLegible(juego.actual.nombre));
  const apellido = norm(juego.actual.nombre.split(',')[0]);
  const g = norm(texto);
  if (!g) return;
  if (g === objetivo || g === apellido) {
    juego.estado = 'acertado';
    juego.puntos += puntosPorRonda();
    juego.aciertos += 1;
  } else {
    juego.feedback = 'No es ese. Probá de nuevo o pedí otra pista.';
  }
  pintarJuego();
}

/* ---------------- selectores contextuales ---------------- */
async function selectores(d) {
  // Primera es el único torneo en estas versiones: no hay selector de división.
  let html = '';
  if (state.vista === 'tabla') {
    const items = d.tablas.map((t, i) => ({ id: String(i), label: nombreTabla(t.nombre) }));
    html += segmented(items, String(state.tablaIdx), 'tabla');
  } else if (state.vista === 'resultados') {
    const torneos = torneosDeResultados(d);
    if (torneos.length > 1) {
      const items = torneos.map((t) => ({ id: t, label: nombreTorneo(t) }));
      html += segmented(items, state.torneoResultados, 'torneo-r');
    }
  } else if (state.vista === 'planteles') {
    const jug = await cargarJug(state.torneo);
    if (jug && jug.equipos) {
      const items = jug.equipos.map((e, i) => ({ id: String(i), label: e.nombre }));
      html += segmented(items, String(state.equipoIdx), 'equipo');
    }
  }
  return html ? `<div class="selectores">${html}</div>` : '';
}

/* Lista de torneos presentes en los resultados, ordenados del más reciente
   (por última fecha jugada) al más antiguo. */
function torneosDeResultados(d) {
  const ultimo = new Map();
  for (const p of d.fixture) {
    if (!p.jugado) continue;
    const t = p.torneo || 'Apertura';
    ultimo.set(t, Math.max(ultimo.get(t) || 0, p.uts || 0));
  }
  return [...ultimo.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/* ---------------- render principal ---------------- */
const TABS = [
  { id: 'tabla', label: 'Tabla' },
  { id: 'fixture', label: 'Fixture' },
  { id: 'resultados', label: 'Resultados' },
  { id: 'goleadores', label: 'Goleadores' },
  { id: 'planteles', label: 'Planteles' },
  { id: 'juego', label: 'Jugá' },
];

async function render() {
  // tabs activos
  $('#tabs').innerHTML = TABS.map((t) =>
    `<button class="tab${t.id === state.vista ? ' is-active' : ''}" data-vista="${t.id}">${t.label}</button>`
  ).join('');

  const d = await cargar(state.torneo);
  if (state.tablaIdx >= d.tablas.length) state.tablaIdx = 0;

  let contenido = '';
  if (state.vista === 'tabla') contenido = vistaTabla(d);
  else if (state.vista === 'fixture') contenido = vistaFixture(d);
  else if (state.vista === 'resultados') contenido = vistaResultados(d);
  else if (state.vista === 'goleadores') contenido = vistaGoleadores(await cargarJug(state.torneo));
  else if (state.vista === 'planteles') contenido = vistaPlanteles(await cargarJug(state.torneo));
  else if (state.vista === 'juego') contenido = vistaJuego(await cargarJug(state.torneo));

  const sel = await selectores(d);
  $('#contenido').innerHTML = sel + contenido;

  if (state.vista === 'juego') pintarJuego();
}

/* ---------------- eventos ---------------- */
document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-vista]');
  if (tab) { state.vista = tab.dataset.vista; render(); return; }

  const torneo = e.target.closest('[data-torneo]');
  if (torneo) {
    state.torneo = torneo.dataset.torneo;
    state.tablaIdx = 0; state.equipoIdx = 0;
    // Segunda no tiene jugadores: si estás en esas vistas, volvé a Tabla
    if (state.torneo === 'segunda' && (state.vista === 'goleadores' || state.vista === 'planteles')) {
      // se mantiene la vista pero mostrará EmptyState
    }
    render(); return;
  }
  const tabla = e.target.closest('[data-tabla]');
  if (tabla) { state.tablaIdx = Number(tabla.dataset.tabla); render(); return; }

  const torneoR = e.target.closest('[data-torneo-r]');
  if (torneoR) { state.torneoResultados = torneoR.dataset.torneoR; render(); return; }

  const equipo = e.target.closest('[data-equipo]');
  if (equipo) { state.equipoIdx = Number(equipo.dataset.equipo); render(); return; }

  // expandir ficha de jugador
  const pr = e.target.closest('[data-player]');
  if (pr) {
    const det = $(`[data-detail="${pr.dataset.player}"]`);
    const abierto = pr.classList.toggle('is-open');
    pr.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    if (det) det.hidden = !abierto;
    return;
  }

  // expandir detalle de partido (resultados)
  const mr = e.target.closest('[data-match-id]');
  if (mr) {
    const id = mr.dataset.matchId;
    const det = $(`[data-match-detail="${id}"]`);
    const abierto = mr.classList.toggle('is-open');
    if (det) {
      if (abierto && !det.dataset.cargado) {
        cargarPartidos(state.torneo).then((data) => {
          det.innerHTML = detallePartido(data ? data[id] : null);
          det.dataset.cargado = '1';
          det.hidden = false;
        });
      } else {
        det.hidden = !abierto;
      }
    }
    return;
  }

  // acciones del juego
  const jg = e.target.closest('[data-juego]');
  if (jg) {
    const acc = jg.dataset.juego;
    if (acc === 'pista' && juego.reveladas < juego.pistas.length) juego.reveladas += 1;
    else if (acc === 'rendirse') juego.estado = 'rendido';
    else if (acc === 'siguiente') nuevoJugador();
    pintarJuego();
    return;
  }
});

/* submit del formulario de adivinanza */
document.addEventListener('submit', (e) => {
  if (e.target.id === 'form-juego') {
    e.preventDefault();
    intentar($('#guess')?.value || '');
  }
});

/* ---------------- init ---------------- */
(async function init() {
  try {
    const r = await fetch('data/resumen.json');
    const resumen = await r.json();
    $('#updated-at').textContent = 'Actualizado: ' + fmtActualizado(resumen.actualizado);
  } catch { /* sin sello de fecha */ }

  await render();
})();
