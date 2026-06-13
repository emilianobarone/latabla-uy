#!/usr/bin/env python3
"""
Descarga estadisticas del futbol uruguayo desde los feeds de Sportradar
(el mismo proveedor que usa la seccion "Estadisticas en Vivo" de Supermatch)
y las guarda como JSON limpios en ./data/ para la web app.

No usa navegador: son llamadas HTTP directas, rapidas y livianas.

Uso:
    python3 fetch_stats.py              # descarga todo
    python3 fetch_stats.py --torneo segunda   # solo Segunda Division
"""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import certifi

SSL_CTX = ssl.create_default_context(cafile=certifi.where())

BASE = "https://stats.fn.sportradar.com/supermatch/es/America:Montevideo/gismo"
DATA_DIR = Path(__file__).parent / "data"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

# Torneos uruguayos (categoria Sportradar 57 = Uruguay).
# seasonid = temporada actual; se puede actualizar leyendo config_tree_mini/41/0
# NOTA: en las primeras versiones nos enfocamos SOLO en Primera. Segunda queda
# definida pero sin descargar (jugadores=False y excluida del run por defecto).
TORNEOS = {
    "primera": {"nombre": "Primera División 2026", "seasonid": 139306, "jugadores": True},
    "segunda": {"nombre": "Segunda División 2026", "seasonid": 140446, "jugadores": False},
}

# Mapa de _tid (tournament id dentro de la season) -> fase del torneo.
# Una misma temporada (139306) agrupa Apertura, Intermedio y Clausura.
FASES = {
    57776: "Apertura",
    17126: "Clausura",
    57777: "Intermedio Grupo A",
    60005: "Intermedio Grupo B",
    61457: "Intermedio Final",
}


def feed(path: str) -> dict:
    req = urllib.request.Request(f"{BASE}/{path}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
        return json.loads(r.read().decode("utf-8"))


def get_data(raw: dict) -> dict:
    return raw["doc"][0]["data"]


def fetch_tabla(seasonid: int) -> list[dict]:
    data = get_data(feed(f"stats_season_tables/{seasonid}"))
    tablas = []
    for t in data.get("tables", []):
        filas = []
        for r in t.get("tablerows", []):
            team = r.get("team") or {}
            gf, gc = r.get("goalsForTotal", 0), r.get("goalsAgainstTotal", 0)
            filas.append({
                "pos": r.get("pos"),
                "equipo": team.get("name"),
                "equipo_id": team.get("uid") or team.get("_id"),
                "pj": r.get("total"), "g": r.get("winTotal"),
                "e": r.get("drawTotal"), "p": r.get("lossTotal"),
                "gf": gf, "gc": gc, "dif": (gf or 0) - (gc or 0),
                "pts": r.get("pointsTotal"),
                "cambio_pos": r.get("posChangeTotal"),
            })
        tablas.append({"nombre": t.get("name"), "filas": filas})
    return tablas


def fetch_fixture(seasonid: int) -> list[dict]:
    data = get_data(feed(f"stats_season_fixtures2/{seasonid}/1"))
    partidos = []
    for m in data.get("matches", []):
        teams = m.get("teams", {})
        res = m.get("result", {}) or {}
        time = m.get("time", {}) or {}
        status = m.get("status")
        status_name = status.get("name") if isinstance(status, dict) else None
        jugado = res.get("home") is not None and res.get("away") is not None
        tid = m.get("_tid")
        partidos.append({
            "id": m.get("_id"),
            "fecha": time.get("date"),
            "hora": time.get("time"),
            "uts": time.get("uts"),
            "ronda": m.get("round"),
            "torneo": FASES.get(tid, "Apertura"),
            "local": (teams.get("home") or {}).get("name"),
            "visitante": (teams.get("away") or {}).get("name"),
            "gol_local": res.get("home"),
            "gol_visitante": res.get("away"),
            "jugado": jugado,
            "estado": status_name,
        })
    partidos.sort(key=lambda x: x.get("uts") or 0)
    return partidos


# Estadísticas de match_details que nos interesan (id de tipo -> clave).
DETALLE_TIPOS = {
    "110": "posesion",
    "125": "tiros_arco",
    "126": "tiros_fuera",
    "171": "tiros_bloqueados",
    "124": "corners",
    "120": "faltas",
    "123": "offsides",
    "127": "atajadas",
    "40":  "amarillas",
    "50":  "rojas",
}


def fetch_partido_detalle(matchid: int) -> dict | None:
    """Estadísticas de un partido (posesión, tiros, córners, etc.)."""
    data = get_data(feed(f"match_details/{matchid}"))
    vals = data.get("values") or {}
    out: dict = {}
    for tid, clave in DETALLE_TIPOS.items():
        v = vals.get(tid)
        if not isinstance(v, dict):
            continue
        val = v.get("value") or {}
        h, a = val.get("home"), val.get("away")
        if h is None and a is None:
            continue
        out[clave] = {"home": h, "away": a}
    return out or None


def fetch_partidos(fixture: list[dict]) -> dict:
    """Baja el detalle de cada partido jugado. Una llamada por partido."""
    import time as _time
    jugados = [p for p in fixture if p.get("jugado") and p.get("id")]
    detalles: dict = {}
    ok = 0
    for i, p in enumerate(jugados, 1):
        try:
            det = fetch_partido_detalle(p["id"])
            if det:
                detalles[str(p["id"])] = det
                ok += 1
        except Exception as e:
            print(f"  ! detalle {p['id']} fallo: {e}")
        if i % 25 == 0:
            print(f"  detalle de partidos: {i}/{len(jugados)}…")
        _time.sleep(0.25)
    print(f"  detalle de partidos: {ok}/{len(jugados)} con estadísticas")
    return detalles


def _edad(birth_uts: int | None) -> int | None:
    if not birth_uts:
        return None
    from datetime import datetime as _dt
    return int((_dt.now(timezone.utc).timestamp() - birth_uts) // (365.25 * 86400))


def fetch_jugadores(seasonid: int, equipos: list[dict]) -> dict:
    """Plantel + estadisticas por jugador para cada equipo de la temporada.

    Usa stats_teamplayer_facts/<teamid>/<seasonid>. Devuelve:
      {"equipos": [{id, nombre, jugadores: [...]}], "goleadores": [...], "asistencias": [...]}
    """
    import time as _time

    out_equipos = []
    todos: list[dict] = []
    for eq in equipos:
        tid, nombre = eq["equipo_id"], eq["equipo"]
        try:
            data = get_data(feed(f"stats_teamplayer_facts/{tid}/{seasonid}"))
        except Exception as e:
            print(f"  ! jugadores {nombre} fallo: {e}")
            continue
        jugadores = []
        for pid, p in (data or {}).items():
            info = p.get("player") or {}
            tot = (p.get("stats") or {}).get("total") or {}
            pos = info.get("primaryposition") or info.get("position") or {}
            rojas = (tot.get("red_cards") or 0) + (tot.get("yellowred_cards") or 0)
            jugadores.append({
                "id": info.get("_id"),
                "nombre": info.get("name"),
                "dorsal": info.get("shirtnumber"),
                "posicion": pos.get("name"),
                "pos_tipo": pos.get("_type"),
                "edad": _edad((info.get("birthdate") or {}).get("uts")),
                "nacionalidad": (info.get("nationality") or {}).get("name"),
                "altura": info.get("height"),
                "pie": info.get("foot"),
                "valor_mercado": info.get("marketvalue"),
                "equipo": nombre,
                "equipo_id": tid,
                "pj": tot.get("matches", 0),
                "titular": tot.get("started", 0),
                "goles": tot.get("goals", 0),
                "asistencias": tot.get("assists", 0),
                "amarillas": tot.get("yellow_cards", 0),
                "rojas": rojas,
                "minutos": tot.get("minutes_played", 0),
                "tiros": tot.get("total_shots", 0),
                "tiros_al_arco": tot.get("shots_on_goal", 0),
                "goles_cabeza": tot.get("goals_by_header", 0),
                "penales": tot.get("penalties", 0),
            })
        orden_pos = {"G": 0, "D": 1, "M": 2, "F": 3}
        jugadores.sort(key=lambda j: (orden_pos.get(j["pos_tipo"], 9),
                                      int(j["dorsal"]) if (j["dorsal"] or "").isdigit() else 999))
        out_equipos.append({"id": tid, "nombre": nombre, "jugadores": jugadores})
        todos.extend(jugadores)
        print(f"  {nombre}: {len(jugadores)} jugadores")
        _time.sleep(0.4)

    goleadores = sorted([j for j in todos if j["goles"]],
                        key=lambda j: (-j["goles"], -j["asistencias"], j["minutos"]))
    asistencias = sorted([j for j in todos if j["asistencias"]],
                         key=lambda j: (-j["asistencias"], -j["goles"], j["minutos"]))
    return {"equipos": out_equipos, "goleadores": goleadores[:40], "asistencias": asistencias[:40]}


def fetch_forma(seasonid: int) -> list[dict]:
    """Ultimos resultados (racha) por equipo."""
    data = get_data(feed(f"stats_season_lastx/{seasonid}"))
    equipos = []
    for team in data.get("teams", []) if isinstance(data.get("teams"), list) else []:
        equipos.append(team)
    # El feed a veces devuelve dict {teamid: {...}}
    teams = data.get("teams")
    if isinstance(teams, dict):
        for tid, t in teams.items():
            nombre = (t.get("team") or {}).get("name") if isinstance(t.get("team"), dict) else None
            equipos.append({"equipo_id": tid, "equipo": nombre or t.get("name"), "forma": t.get("form") or t.get("matches")})
    return equipos


def main() -> int:
    ap = argparse.ArgumentParser()
    # Por defecto solo Primera (foco de las primeras versiones). Segunda se
    # baja explícitamente con --torneo segunda o --torneo todos.
    ap.add_argument("--torneo", choices=list(TORNEOS) + ["todos"], default="primera")
    ap.add_argument("--sin-detalle", action="store_true",
                    help="No bajar el detalle por partido (más rápido)")
    args = ap.parse_args()

    DATA_DIR.mkdir(exist_ok=True)
    keys = list(TORNEOS) if args.torneo == "todos" else [args.torneo]
    resumen = {"actualizado": datetime.now(timezone.utc).isoformat(), "torneos": {}}

    for k in keys:
        cfg = TORNEOS[k]
        sid = cfg["seasonid"]
        print(f"[{k}] {cfg['nombre']} (season {sid})")
        out: dict = {"nombre": cfg["nombre"], "seasonid": sid}
        try:
            out["tablas"] = fetch_tabla(sid)
            n = sum(len(t["filas"]) for t in out["tablas"])
            print(f"  tabla: {len(out['tablas'])} tabla(s), {n} equipos")
        except Exception as e:
            print(f"  ! tabla fallo: {e}")
            out["tablas"] = []
        try:
            out["fixture"] = fetch_fixture(sid)
            jugados = sum(1 for p in out["fixture"] if p["jugado"])
            print(f"  fixture: {len(out['fixture'])} partidos ({jugados} jugados)")
        except Exception as e:
            print(f"  ! fixture fallo: {e}")
            out["fixture"] = []
        try:
            out["forma"] = fetch_forma(sid)
        except Exception as e:
            print(f"  ! forma fallo: {e}")
            out["forma"] = []

        if cfg.get("jugadores") and out["tablas"]:
            # Equipos desde la tabla anual ("Overall") si existe, si no la primera
            tabla_base = next((t for t in out["tablas"] if "Overall" in (t["nombre"] or "")),
                              out["tablas"][0])
            print(f"  jugadores de {len(tabla_base['filas'])} equipos...")
            jug = fetch_jugadores(sid, tabla_base["filas"])
            (DATA_DIR / f"jugadores_{k}.json").write_text(
                json.dumps(jug, ensure_ascii=False, indent=1))
            n_jug = sum(len(e["jugadores"]) for e in jug["equipos"])
            print(f"  jugadores: {n_jug} en {len(jug['equipos'])} equipos -> jugadores_{k}.json")

        # Detalle por partido (posesión, tiros, córners…) solo donde pedimos
        # jugadores (Primera). Es la parte más lenta: una llamada por partido.
        if cfg.get("jugadores") and out.get("fixture") and not args.sin_detalle:
            det = fetch_partidos(out["fixture"])
            (DATA_DIR / f"partidos_{k}.json").write_text(
                json.dumps(det, ensure_ascii=False, indent=1))
            print(f"  detalle: {len(det)} partidos -> partidos_{k}.json")

        (DATA_DIR / f"{k}.json").write_text(
            json.dumps(out, ensure_ascii=False, indent=1))
        resumen["torneos"][k] = {
            "nombre": cfg["nombre"],
            "equipos": sum(len(t["filas"]) for t in out["tablas"]),
            "partidos": len(out["fixture"]),
        }

    (DATA_DIR / "resumen.json").write_text(
        json.dumps(resumen, ensure_ascii=False, indent=1))
    print(f"\nListo. Archivos en {DATA_DIR}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
