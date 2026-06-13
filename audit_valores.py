#!/usr/bin/env python3
"""
Auditoría: compara el valor_tm guardado de cada jugador contra el valor
que muestra su PÁGINA DE PERFIL en Transfermarkt (fuente independiente).
Reporta discrepancias. Read-only (no modifica datos).
"""
import json
import re
import time

import fetch_transfermarkt as tm

data = json.load(open("data/jugadores_primera.json"))
jugadores = [(j, e["nombre"]) for e in data["equipos"] for j in e["jugadores"]
             if j.get("valor_tm") and j.get("tm_id")]

print(f"Auditando {len(jugadores)} jugadores con valor de Transfermarkt...\n")
discrepancias = []
ok = sin_perfil = 0

for i, (j, equipo) in enumerate(jugadores, 1):
    tid = j["tm_id"]
    try:
        perfil = tm.fetch_html(f"https://www.transfermarkt.es/x/profil/spieler/{tid}")
    except Exception as e:
        print(f"  ! perfil {tid} fallo: {e}")
        continue
    m = re.search(r"[Vv]alor de mercado:\s*([\d.,]+\s*(?:mill\.|mil)\s*€)", perfil)
    pv = tm.valor_a_euros(m.group(1)) if m else None
    if pv is None:
        sin_perfil += 1
    elif pv == j["valor_tm"]:
        ok += 1
    else:
        discrepancias.append((equipo, j["nombre"], j["valor_tm"], pv, tid))
    if i % 50 == 0:
        print(f"  {i}/{len(jugadores)}  (ok={ok}, difieren={len(discrepancias)})")
    time.sleep(0.35)

print(f"\n===== RESULTADO =====")
print(f"Coinciden con el perfil: {ok}/{len(jugadores)}")
print(f"Sin valor legible en el perfil: {sin_perfil}")
print(f"Discrepancias: {len(discrepancias)}")
def eur(v):
    return f"€{v/1e6:.2f}M" if v and v >= 1e6 else (f"€{v//1000}k" if v else "—")
for equipo, nombre, guardado, perfil, tid in discrepancias:
    print(f"  {equipo:<20} {nombre:<26} guardado {eur(guardado):>8} | perfil {eur(perfil):>8}  (id {tid})")
