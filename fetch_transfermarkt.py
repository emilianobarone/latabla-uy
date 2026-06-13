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
import urllib.request
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


def parse_kader(html: str) -> list[tuple[str, int]]:
    """Devuelve [(nombre, valor_euros)] de la tabla de plantel."""
    jugadores = []
    # Cada fila de jugador empieza con un <td class="posrela"> que contiene
    # el link al perfil con el nombre. La cortamos en filas por ese marcador.
    filas = re.split(r'<td class="posrela">', html)
    for fila in filas[1:]:
        mnom = re.search(r'/profil/spieler/\d+"[^>]*>([^<]+)</a>', fila)
        if not mnom:
            continue
        nombre = unescape(mnom.group(1)).strip()
        mval = re.search(r'([\d.,]+\s*(?:mill\.|mil)\s*€)', fila)
        valor = valor_a_euros(mval.group(1)) if mval else None
        if nombre:
            jugadores.append((nombre, valor))
    return jugadores


def emparejar(nuestros: list[dict], tm: list[tuple[str, int]]) -> dict:
    """Empareja UNO-A-UNO por solapamiento de tokens dentro del club.
    Cada jugador de Transfermarkt se usa una sola vez. Devuelve {id_jugador: valor}."""
    tm_list = [(tokens(n), v) for n, v in tm if v is not None]
    # Candidatos (score, id_nuestro, indice_tm, valor) que superan el umbral.
    cands = []
    for j in nuestros:
        jt = tokens(j["nombre"])
        for idx, (tt, val) in enumerate(tm_list):
            inter = len(jt & tt)
            if inter == 0:
                continue
            score = inter / max(len(jt), len(tt))
            if inter >= 2 or score >= 0.5:   # apellido+nombre, o mitad de tokens
                cands.append((score, j["id"], idx, val))
    cands.sort(key=lambda x: -x[0])
    res, usados_j, usados_tm = {}, set(), set()
    for score, jid, idx, val in cands:
        if jid in usados_j or idx in usados_tm:
            continue
        res[jid] = val
        usados_j.add(jid)
        usados_tm.add(idx)
    return res


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="No escribir, solo reportar")
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
            if j["id"] in valores and valores[j["id"]]:
                j["valor_tm"] = valores[j["id"]]
                n += 1
        total_match += n
        total_jug += len(eq["jugadores"])
        print(f"  {nombre:<24} TM:{len(tm):>2} jugadores · emparejados {n}/{len(eq['jugadores'])}")
        time.sleep(1.5)

    print(f"\nEmparejados: {total_match}/{total_jug} jugadores con valor de Transfermarkt")
    if not args.dry:
        path.write_text(json.dumps(data, ensure_ascii=False, indent=1))
        print(f"Guardado: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
