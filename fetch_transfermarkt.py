#!/usr/bin/env python3
"""
Enriquece data/jugadores_primera.json con el valor de mercado de Transfermarkt.

Sportradar solo trae el valor de ~5% de los jugadores; Transfermarkt los tiene
casi todos. Bajamos el plantel de cada club, parseamos (nombre, valor) y los
emparejamos con nuestros jugadores por nombre DENTRO del mismo club (así el
matching es mucho más seguro).

Uso:
    python3 fetch_transfermarkt.py            # enriquece jugadores_primera.json
    python3 fetch_transfermarkt.py --dry      # no escribe, solo reporta matching
"""

from __future__ import annotations

import argparse
import json
import re
import ssl
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from html import unescape
from pathlib import Path

import certifi

SSL_CTX = ssl.create_default_context(cafile=certifi.where())
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
DATA = Path(__file__).parent / "data"

# Nuestro nombre de equipo -> (slug, id de Transfermarkt). saison_id 2025 = plantel actual.
CLUBS_TM = {
    "Peñarol":                  ("ca-penarol", 861),
    "Nacional":                 ("club-nacional", 866),
    "Defensor Sporting":        ("defensor-sc", 2619),
    "Liverpool":                ("liverpool-fc-montevideo", 10663),
    "Juventud de Las Piedras":  ("juventud-de-las-piedras", 17428),
    "Racing":                   ("racing-club-de-montevideo", 14758),
    "M.C. Torque":              ("montevideo-city-torque", 37535),
    "Albion":                   ("albion-fc", 42149),
    "Boston River":             ("ca-boston-river", 18074),
    "Dep Maldonado":            ("cd-maldonado", 18075),
    "Wanderers":                ("montevideo-wanderers", 2403),
    "Central Español":          ("central-espanol", 10960),
    "Cerro Largo":              ("cerro-largo-fc", 20189),
    "Progreso":                 ("ca-progreso", 17595),
    "Danubio":                  ("danubio-fc", 1306),
    "Cerro":                    ("ca-cerro", 14806),
}
SAISON = 2025


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.lower().strip()


def tokens(nombre: str) -> set[str]:
    """Tokens del nombre (sin tildes, sin comas). 'Lopez, Alvaro' -> {lopez, alvaro}."""
    return {t for t in re.split(r"[\s,]+", norm(nombre)) if len(t) > 1}


def valor_a_euros(txt: str) -> int | None:
    """'3,50 mill. €' -> 3500000 ; '500 mil €' -> 500000."""
    m = re.search(r"([\d.,]+)\s*(mill|mil)", txt)
    if not m:
        return None
    num = float(m.group(1).replace(".", "").replace(",", "."))
    return int(num * (1_000_000 if m.group(2) == "mill" else 1_000))


def fetch_html(url: str) -> str:
    req = urllib.request.Request(url, headers={
        "User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9"})
    with urllib.request.urlopen(req, timeout=30, context=SSL_CTX) as r:
        return r.read().decode("utf-8", "replace")


def fetch_retry(url: str, intentos: int = 4) -> str:
    """fetch_html tolerante a cortes de conexión (devuelve '' si falla todo)."""
    for i in range(intentos):
        try:
            return fetch_html(url)
        except Exception:
            if i == intentos - 1:
                return ""
            time.sleep(1.5)
    return ""


# ---- Segunda pasada: búsqueda por nombre para jugadores sin match ----
# token del club tal como aparece en Transfermarkt (incluye filiales U19/B) y
# tokens negativos para desambiguar (Cerro vs Cerro Largo).
CLUB_TOKENS = {
    "Peñarol": ("penarol", []), "Nacional": ("nacional", []),
    "Defensor Sporting": ("defensor", []), "Liverpool": ("liverpool", []),
    "Juventud de Las Piedras": ("juventud", []), "Racing": ("racing", []),
    "M.C. Torque": ("torque", []), "Albion": ("albion", []),
    "Boston River": ("boston", []), "Dep Maldonado": ("maldonado", []),
    "Wanderers": ("wanderers", []), "Central Español": ("central", []),
    "Cerro Largo": ("cerro largo", []), "Progreso": ("progreso", []),
    "Danubio": ("danubio", []), "Cerro": ("cerro", ["largo"]),
}


def _legible(nombre: str) -> str:
    return f"{nombre.split(',')[1].strip()} {nombre.split(',')[0].strip()}" \
        if "," in nombre else nombre


def _meta_perfil(html: str) -> dict | None:
    m = re.search(r'<meta name="description" content="([^"]+)"', html)
    if not m:
        return None
    desc = unescape(m.group(1))
    o: dict = {}
    ma = re.search(r",\s*(\d+),\s*(.+?)\s*➤\s*([^,➤]+)", desc)
    if ma:
        o["edad"] = int(ma.group(1))
        o["pais"] = ma.group(2).strip()
        o["club"] = ma.group(3).strip()
    mv = re.search(r"[Vv]alor de mercado:\s*([\d.,]+\s*(?:mill\.|mil)\s*€)", desc)
    o["valor"] = valor_a_euros(mv.group(1)) if mv else None
    return o


def _historial_clubes(pid: str) -> list[str]:
    j = fetch_retry(f"https://www.transfermarkt.es/ceapi/transferHistory/list/{pid}")
    return [norm(c.encode().decode("unicode_escape"))
            for c in re.findall(r'"clubName":"([^"]*)"', j)]


def _buscar_ids(nombre: str) -> list[str]:
    h = fetch_retry("https://www.transfermarkt.es/schnellsuche/ergebnis/"
                    f"schnellsuche?query={urllib.parse.quote(nombre)}")
    ids: list[str] = []
    for m in re.finditer(r"/profil/spieler/(\d+)\"", h):
        if m.group(1) not in ids:
            ids.append(m.group(1))
    return ids[:6]


def _club_coincide(nombre_club: str, equipo: str) -> bool:
    tok, negs = CLUB_TOKENS.get(equipo, ("", []))
    c = norm(nombre_club)
    return bool(tok) and tok in c and not any(n in c for n in negs)


def buscar_valor_faltante(jugador: dict, equipo: str) -> tuple[int, str] | None:
    """Busca el jugador en TM por nombre y acepta el valor SOLO si su club
    actual es el nuestro (juvenil/filial) o nuestro club está en su historial
    de carrera (préstamo/transferencia). Verifica nacionalidad y edad."""
    for pid in _buscar_ids(_legible(jugador["nombre"])):
        meta = _meta_perfil(fetch_retry(f"https://www.transfermarkt.es/x/profil/spieler/{pid}"))
        time.sleep(0.2)
        if not meta or not meta.get("valor"):
            continue
        nac = (not jugador.get("nacionalidad") or not meta.get("pais")
               or norm(jugador["nacionalidad"]) == norm(meta["pais"]))
        ed = (not jugador.get("edad") or not meta.get("edad")
              or abs(jugador["edad"] - meta["edad"]) <= 1)
        if not (nac and ed):
            continue
        if _club_coincide(meta.get("club", ""), equipo) or \
                any(_club_coincide(c, equipo) for c in _historial_clubes(pid)):
            return meta["valor"], pid
        time.sleep(0.2)
    return None


def parse_kader(html: str) -> list[tuple[str, int, str]]:
    """Devuelve [(nombre, valor_euros, spieler_id)] de la tabla de plantel."""
    jugadores = []
    # Cada fila de jugador empieza con un <td class="posrela"> que contiene
    # el link al perfil con el nombre. La cortamos en filas por ese marcador.
    filas = re.split(r'<td class="posrela">', html)
    for fila in filas[1:]:
        mid = re.search(r'/profil/spieler/(\d+)', fila)
        # El nombre es el texto justo después del link de perfil. NO exigir que
        # termine en </a>: los capitanes tienen un <span> de ícono adentro del
        # link, lo que antes los hacía saltear.
        mnom = re.search(r'/profil/spieler/\d+"[^>]*>\s*([^<]+)', fila)
        if not mnom or not mid:
            continue
        nombre = unescape(mnom.group(1)).strip()
        # El valor de mercado es la celda dedicada `rechts hauptlink`, NO el
        # primer número con "€" del chunk (puede haber valores extra: récord
        # histórico, etc.). Lo verificamos contra la página de perfil: coincide.
        mval = re.search(
            r'class="rechts hauptlink"[^>]*>\s*(?:<a[^>]*>)?\s*([\d.,]+\s*(?:mill\.|mil)\s*€)',
            fila)
        valor = valor_a_euros(mval.group(1)) if mval else None
        if nombre:
            jugadores.append((nombre, valor, mid.group(1)))
    return jugadores


def tokens_en_comun(set1: set[str], set2: set[str]) -> int:
    """Cuenta tokens compartidos tolerando variantes de tipeo (Petrik/Petryk).
    Asigna cada token de un lado al mejor del otro (una sola vez)."""
    s2 = list(set2)
    usados, n = set(), 0
    for t in set1:
        mejor, mejor_i = 0.0, None
        for i, u in enumerate(s2):
            if i in usados:
                continue
            r = 1.0 if t == u else SequenceMatcher(None, t, u).ratio()
            if r > mejor:
                mejor, mejor_i = r, i
        if mejor >= 0.82:   # iguales o casi (1 letra de diferencia en un apellido)
            n += 1
            usados.add(mejor_i)
    return n


def emparejar(nuestros: list[dict], tm: list[tuple[str, int, str]]) -> dict:
    """Empareja UNO-A-UNO por solapamiento de tokens (difuso) dentro del club.
    Cada jugador de Transfermarkt se usa una sola vez.
    Devuelve {id_jugador: (valor, spieler_id)}."""
    tm_list = [(tokens(n), v, tid) for n, v, tid in tm if v is not None]
    # Candidatos (score, id_nuestro, indice_tm, valor, tm_id) que superan el umbral.
    cands = []
    for j in nuestros:
        jt = tokens(j["nombre"])
        for idx, (tt, val, tid) in enumerate(tm_list):
            inter = tokens_en_comun(jt, tt)
            if inter == 0:
                continue
            score = inter / max(len(jt), len(tt))
            if inter >= 2 or score >= 0.5:   # apellido+nombre, o mitad de tokens
                cands.append((score, j["id"], idx, val, tid))
    cands.sort(key=lambda x: -x[0])
    res, usados_j, usados_tm = {}, set(), set()
    for score, jid, idx, val, tid in cands:
        if jid in usados_j or idx in usados_tm:
            continue
        res[jid] = (val, tid)
        usados_j.add(jid)
        usados_tm.add(idx)
    return res


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="No escribir, solo reportar")
    ap.add_argument("--sin-busqueda", action="store_true",
                    help="Saltear la 2da pasada de búsqueda por nombre (más rápido)")
    args = ap.parse_args()

    path = DATA / "jugadores_primera.json"
    data = json.loads(path.read_text())

    total_match = total_jug = 0
    for eq in data["equipos"]:
        nombre = eq["nombre"]
        cfg = CLUBS_TM.get(nombre)
        if not cfg:
            print(f"  ! sin mapeo TM: {nombre}")
            continue
        slug, vid = cfg
        url = f"https://www.transfermarkt.es/{slug}/kader/verein/{vid}/saison_id/{SAISON}/plus/1"
        tm = None
        for intento in range(3):
            try:
                tm = parse_kader(fetch_html(url))
                if tm:
                    break
            except Exception as e:
                if intento == 2:
                    print(f"  ! {nombre} fallo tras 3 intentos: {e}")
                time.sleep(2)
        if not tm:
            print(f"  ! {nombre}: sin datos, se mantiene lo anterior")
            continue
        valores = emparejar(eq["jugadores"], tm)
        n = 0
        for j in eq["jugadores"]:
            par = valores.get(j["id"])
            if par and par[0]:
                j["valor_tm"] = par[0]
                j["tm_id"] = par[1]   # para verificar el valor en su perfil
                n += 1
        total_match += n
        total_jug += len(eq["jugadores"])
        print(f"  {nombre:<24} TM:{len(tm):>2} jugadores · emparejados {n}/{len(eq['jugadores'])}")
        time.sleep(1.5)

    print(f"\nEmparejados (por plantel): {total_match}/{total_jug}")

    # Segunda pasada: búsqueda por nombre para los que quedaron sin valor
    # (juveniles en el equipo B, préstamos, transferencias de mitad de año).
    if not args.sin_busqueda:
        faltan = [(j, e["nombre"]) for e in data["equipos"]
                  for j in e["jugadores"] if not j.get("valor_tm")]
        print(f"\nBúsqueda por nombre para {len(faltan)} sin valor...")
        nuevos = 0
        for j, equipo in faltan:
            res = buscar_valor_faltante(j, equipo)
            if res:
                j["valor_tm"], j["tm_id"] = res
                nuevos += 1
                print(f"  + {_legible(j['nombre']):<26} {equipo:<18} €{res[0]:>8}")
            time.sleep(0.3)
        total_match += nuevos
        print(f"\nRecuperados por búsqueda: {nuevos}")

    print(f"Total con valor de Transfermarkt: {total_match}/{total_jug}")
    if not args.dry:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=1))
        print(f"Guardado: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
