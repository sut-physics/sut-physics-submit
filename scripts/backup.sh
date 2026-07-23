#!/usr/bin/env bash
# ============================================================
# Backup รายวัน → Cloudflare R2  (แบบประหยัดพื้นที่ ใช้ได้ยาวๆ ไม่ตันโควตาฟรี)
#
# แยกเป็น 2 ส่วน แทนการ zip ทั้งก้อนทุกวัน:
#   1) ฐานข้อมูล  — online backup (ปลอดภัยแม้ DB กำลังถูกเขียน) → tar.gz → เก็บย้อนหลังหลายวัน
#                   ขนาดเล็กมาก (หลัก MB) เก็บ 30 วันก็ยังไม่กี่ร้อย MB
#   2) ไฟล์แนบ    — rclone copy แบบ incremental (ส่งเฉพาะไฟล์ใหม่ ไม่ส่งซ้ำ ไม่ลบของเก่า)
#                   ไฟล์ของ PocketBase ตั้งชื่อไม่ซ้ำและไม่ถูกแก้ → เหมาะกับ incremental มาก
#
# ทำไมไม่ zip ทั้ง pb_data ทุกวัน: ถ้าไฟล์แนบโต 3GB แล้วเก็บ 14 วัน = 42GB → เกิน R2 ฟรี 10GB
#
# ติดตั้งครั้งเดียว:
#   1) rclone config  → สร้าง remote ชนิด "s3" provider "Cloudflare" ชื่อ r2
#   2) สร้าง /etc/submit-backup.env (chmod 600):
#        PB_DIR=/opt/pocketbase
#        R2_REMOTE=r2:submit-backups
#        DB_RETENTION_DAYS=30
#   3) cron:  0 3 * * *  /opt/pocketbase/scripts/backup.sh >> /var/log/submit-backup.log 2>&1
# ============================================================
set -euo pipefail

ENV_FILE="${SUBMIT_BACKUP_ENV:-/etc/submit-backup.env}"
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

PB_DIR="${PB_DIR:-/opt/pocketbase}"
DATA_DIR="$PB_DIR/pb_data"
: "${R2_REMOTE:?ต้องตั้ง R2_REMOTE (เช่น r2:submit-backups)}"
DB_RETENTION_DAYS="${DB_RETENTION_DAYS:-30}"

TS="$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

log() { echo "[$(date -Is)] $*"; }

# ---------- 1) ฐานข้อมูล ----------
log "online backup ฐานข้อมูล..."
mkdir -p "$TMP/db"
for db in data.db auxiliary.db; do
    [ -f "$DATA_DIR/$db" ] || continue
    python3 - "$DATA_DIR/$db" "$TMP/db/$db" <<'PY'
import sqlite3, sys
src_path, out_path = sys.argv[1], sys.argv[2]
# เปิดแบบ read-only แล้วใช้ .backup API — ได้สำเนาที่ consistent แม้ DB กำลังถูกเขียน (รวม WAL)
src = sqlite3.connect('file:%s?mode=ro' % src_path, uri=True)
dst = sqlite3.connect(out_path)
with dst:
    src.backup(dst)
src.close(); dst.close()
PY
    log "  ✓ $db"
done

ARCHIVE="submit-db-$TS.tar.gz"
tar -czf "$TMP/$ARCHIVE" -C "$TMP/db" .
log "บีบอัดแล้ว: $ARCHIVE ($(du -h "$TMP/$ARCHIVE" | cut -f1))"

log "อัปโหลดฐานข้อมูลขึ้น $R2_REMOTE/db/ ..."
rclone copy "$TMP/$ARCHIVE" "$R2_REMOTE/db/" --s3-no-check-bucket

# ---------- 2) ไฟล์แนบ (incremental) ----------
if [ -d "$DATA_DIR/storage" ]; then
    log "ซิงก์ไฟล์แนบแบบ incremental → $R2_REMOTE/storage/ ..."
    # copy = ส่งเฉพาะไฟล์ที่ยังไม่มีปลายทาง และ 'ไม่ลบ' ของเดิม
    # (ถ้างานถูกลบในระบบ ไฟล์ยังอยู่ใน backup — ตั้งใจ เพื่อกันลบพลาด)
    rclone copy "$DATA_DIR/storage" "$R2_REMOTE/storage" --s3-no-check-bucket --ignore-existing
    log "  ✓ ไฟล์แนบซิงก์แล้ว"
fi

# ---------- 3) ล้างฐานข้อมูลเก่าเกิน retention ----------
log "ลบ snapshot ฐานข้อมูลเก่ากว่า $DB_RETENTION_DAYS วัน..."
rclone delete "$R2_REMOTE/db" --min-age "${DB_RETENTION_DAYS}d" || true

log "เสร็จ ✓  (ฐานข้อมูล: $ARCHIVE | ไฟล์แนบ: incremental)"
