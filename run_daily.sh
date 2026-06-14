#!/bin/bash
# Corrida diaria de LaTabla.uy: baja datos de Sportradar + valores de
# Transfermarkt y publica (git push) si hubo cambios.
# Ejecutado por launchd (com.emilianobarone.latabla-daily.plist).
# NO tiene relación con las tareas de las 02:55 (Supermatch) ni 03:00 (PawUp).

set -u
export PATH="/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

DIR="/Users/emilianobarone24/Desktop/FutbolUY"
PY="/Library/Frameworks/Python.framework/Versions/3.14/bin/python3"
GIT="/usr/bin/git"
LOG_DIR="$DIR/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/daily.log"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"

cd "$DIR" || { echo "[$STAMP] ERROR: no se pudo cd a $DIR" >> "$LOG"; exit 1; }

# 1) Datos de Sportradar (Primera División)
"$PY" fetch_stats.py > "$LOG_DIR/last-fetch_stats.log" 2>&1
RC1=$?

# 2) Valores de mercado de Transfermarkt (plantel + búsqueda)
"$PY" fetch_transfermarkt.py > "$LOG_DIR/last-fetch_tm.log" 2>&1
RC2=$?

# 3) Publicar SOLO si cambiaron los datos
CAMBIOS="$("$GIT" status --porcelain data/)"
if [ -n "$CAMBIOS" ]; then
  "$GIT" add -A data/
  "$GIT" commit -q -m "Actualización automática de datos ($STAMP)"
  "$GIT" push -q origin main > "$LOG_DIR/last-push.log" 2>&1
  RC3=$?
  MSG="datos actualizados y publicados"
else
  RC3=0
  MSG="sin cambios en los datos"
fi

echo "[$STAMP] fetch_stats=$RC1 fetch_tm=$RC2 push=$RC3 :: $MSG" >> "$LOG"

# Notificación de macOS
if [ "$RC1" = "0" ] && [ "$RC2" = "0" ] && [ "$RC3" = "0" ]; then
  /usr/bin/osascript -e "display notification \"$MSG\" with title \"LaTabla.uy actualizada\"" 2>/dev/null || true
else
  /usr/bin/osascript -e "display notification \"Revisar logs (rc $RC1/$RC2/$RC3)\" with title \"LaTabla.uy: error\"" 2>/dev/null || true
fi

exit 0
