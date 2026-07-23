#!/usr/bin/env bash
# ============================================================
# กู้คืน PocketBase จาก R2 (ใช้ตอนตั้ง VM ใหม่หลังโดน reclaim หรือ disk พัง)
# คู่กับ backup.sh แบบใหม่: ฐานข้อมูล (tar.gz รายวัน) + ไฟล์แนบ (incremental)
#
# ใช้งาน (บน VM ใหม่ หลังรัน install-pocketbase.sh แล้ว, ในฐานะ root):
#   sudo bash restore.sh                       # ดึงฐานข้อมูลล่าสุด + ไฟล์แนบทั้งหมด
#   sudo bash restore.sh submit-db-2026….tar.gz  # ระบุ snapshot ที่ต้องการ
# ============================================================
set -euo pipefail

ENV_FILE="${SUBMIT_BACKUP_ENV:-/etc/submit-backup.env}"
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

PB_DIR="${PB_DIR:-/opt/pocketbase}"
DATA_DIR="$PB_DIR/pb_data"
PB_USER="${PB_USER:-pocketbase}"
: "${R2_REMOTE:?ต้องตั้ง R2_REMOTE (เช่น r2:submit-backups)}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
log() { echo "[$(date -Is)] $*"; }

# ---------- เลือก snapshot ----------
WANT="${1:-}"
if [ -z "$WANT" ]; then
    # ชื่อไฟล์เป็น submit-db-YYYYMMDD-HHMMSS.tar.gz → เรียงตามชื่อ = เรียงตามเวลา
    WANT="$(rclone lsf "$R2_REMOTE/db" | grep '\.tar\.gz$' | sort | tail -1)"
    [ -n "$WANT" ] || { echo "ไม่พบ snapshot ฐานข้อมูลใน $R2_REMOTE/db"; exit 1; }
fi
log "จะกู้จากฐานข้อมูล: $WANT"

log "ดาวน์โหลด..."
rclone copy "$R2_REMOTE/db/$WANT" "$TMP/"
mkdir -p "$TMP/db" && tar -xzf "$TMP/$WANT" -C "$TMP/db"
log "  ได้ไฟล์: $(ls "$TMP/db" | tr '\n' ' ')"

# ---------- หยุดบริการ + สำรองของเดิมไว้ก่อน ----------
log "หยุด PocketBase"
systemctl stop pocketbase 2>/dev/null || true

if [ -d "$DATA_DIR" ] && [ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]; then
    BK="$PB_DIR/pb_data.old.$(date +%Y%m%d-%H%M%S)"
    log "ย้าย pb_data เดิมไปเก็บที่ $BK (กันพลาด)"
    mv "$DATA_DIR" "$BK"
fi
mkdir -p "$DATA_DIR"

# ---------- วางฐานข้อมูล ----------
cp "$TMP/db"/*.db "$DATA_DIR/"
log "วางฐานข้อมูลแล้ว"

# ---------- ดึงไฟล์แนบกลับ ----------
log "ดึงไฟล์แนบจาก $R2_REMOTE/storage ..."
mkdir -p "$DATA_DIR/storage"
rclone copy "$R2_REMOTE/storage" "$DATA_DIR/storage"
log "  ไฟล์แนบ: $(find "$DATA_DIR/storage" -type f | wc -l) ไฟล์"

chown -R "$PB_USER:$PB_USER" "$DATA_DIR"

# ---------- start ----------
log "start PocketBase"
systemctl start pocketbase
sleep 2
if curl -sf --max-time 5 http://127.0.0.1:8090/api/health >/dev/null; then
    log "restore สำเร็จ ✓ (ตรวจข้อมูลผ่าน Admin UI อีกรอบให้ชัวร์)"
else
    echo "health check ไม่ผ่าน — ดู: journalctl -u pocketbase -n 50"; exit 1
fi
