#!/usr/bin/env bash
# ============================================================
# สร้าง snapshot ไว้ "บน VM" ให้ NAS มาดึงทีหลัง (แบบ pull) — **เข้ารหัสก่อนวางทิ้งไว้**
#
# ทำไมแยกเป็น 2 ขั้น (VM สร้าง snapshot → NAS ดึง) แทนให้ VM ส่งขึ้น NAS เอง:
#   ถ้า VM โดนยึด คนแฮกไม่มี credential ของ NAS → ลบ backup ที่ NAS ไม่ได้
#   (แบบ push ตัว VM ต้องถือกุญแจเขียน NAS = แฮก VM ได้ก็ลบ backup ได้หมด)
#
# ทำไมต้องเข้ารหัส:
#   backup ที่ไปกองอยู่บน NAS มีข้อมูลนิสิตครบ (หัวข้องาน/รายละเอียด/ไฟล์แนบ/อีเมล)
#   NAS โดนแฮก = อ่านได้หมด → เข้ารหัสด้วย `age` แบบกุญแจคู่:
#     - VM ถือแค่ **กุญแจล็อก (public)** เข้ารหัสได้อย่างเดียว ถอดไม่ได้
#     - **กุญแจไข (private)** เก็บนอกทั้ง VM และ NAS
#   → NAS โดนแฮกก็เปิดไม่ออก · VM โดนแฮกก็เปิด backup เก่าไม่ออก
#   ⚠️ กุญแจไขหาย = กู้ backup ไม่ได้ถาวร ต้องเก็บอย่างน้อย 2-3 ที่
#
# ทำอะไร:
#   1) online backup ฐานข้อมูล (consistent แม้ DB ถูกเขียนอยู่ รวม WAL) → tar.gz → เข้ารหัส (.age)
#   2) มิเรอร์ไฟล์แนบแบบเข้ารหัสทีละไฟล์ไว้ที่ storage-enc/ (incremental — ไฟล์เดิมไม่ทำซ้ำ)
#   3) ลบ snapshot ฐานข้อมูลเก่าเกิน retention
#
# ชื่อไฟล์ในมิเรอร์เป็น sha256 ของ path เดิม ไม่ใช่ชื่อไฟล์จริง
#   → NAS โดนแฮกก็ไม่รู้ว่ามีเอกสารชื่ออะไรบ้าง (ชื่อไฟล์จริงบอกหัวข้องานได้)
#   → hash เดิมทุกครั้งสำหรับ path เดิม rsync จึงยัง incremental ได้ตามปกติ
#   path จริงถูก tar ไว้ข้างในก่อนเข้ารหัส → ตอนกู้ไม่ต้องมีตารางแปลงชื่อ
#
# **สำคัญ**: ไฟล์ที่มิเรอร์ไว้แล้วห้ามเข้ารหัสซ้ำ — age สุ่มค่าใหม่ทุกครั้ง ผลลัพธ์จะไม่เหมือนเดิม
#             ทำให้ rsync มองว่าเปลี่ยนแล้วดึงใหม่ทั้งก้อนทุกคืน
#
# ติดตั้ง:  sudo cp snapshot-local.sh /opt/pocketbase/scripts/ && sudo chmod +x ...
#           sudo apt-get install -y age
#           วางกุญแจล็อกไว้ที่ /opt/pocketbase/scripts/backup-recipient.pub (บรรทัดเดียว age1...)
# cron:     0 3 * * *  /opt/pocketbase/scripts/snapshot-local.sh >> /var/log/submit-snapshot.log 2>&1
# กู้คืน:   scripts/restore-decrypt.sh (รันบนเครื่องที่มีกุญแจไข) · ดู deploy/RESTORE.md
# ============================================================
set -euo pipefail

PB_DIR="${PB_DIR:-/opt/pocketbase}"
DATA_DIR="$PB_DIR/pb_data"
OUT_DIR="${OUT_DIR:-/var/backups/submit/db}"
ENC_DIR="${ENC_DIR:-/var/backups/submit/storage-enc}"
RECIPIENT_FILE="${RECIPIENT_FILE:-$PB_DIR/scripts/backup-recipient.pub}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
PULL_USER="${PULL_USER:-ubuntu}"

TS="$(date +%Y%m%d-%H%M%S)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

log() { echo "[$(date -Is)] $*"; }

command -v age >/dev/null || { log "ไม่พบคำสั่ง age — ติดตั้งด้วย: sudo apt-get install -y age"; exit 1; }
[ -s "$RECIPIENT_FILE" ] || { log "ไม่พบกุญแจล็อกที่ $RECIPIENT_FILE — backup ที่ไม่เข้ารหัสถือว่าไม่ผ่าน"; exit 1; }
RECIPIENT="$(tr -d '[:space:]' < "$RECIPIENT_FILE")"

mkdir -p "$OUT_DIR" "$ENC_DIR"

# ---------- 1) ฐานข้อมูล ----------
log "online backup ฐานข้อมูล..."
mkdir -p "$TMP/db"
for db in data.db auxiliary.db; do
    [ -f "$DATA_DIR/$db" ] || continue
    python3 - "$DATA_DIR/$db" "$TMP/db/$db" <<'PY'
import sqlite3, sys
src_path, out_path = sys.argv[1], sys.argv[2]
# เปิด read-only + ใช้ .backup API — ได้สำเนาที่ consistent แม้ DB กำลังถูกเขียน (รวม WAL)
src = sqlite3.connect('file:%s?mode=ro' % src_path, uri=True)
dst = sqlite3.connect(out_path)
with dst:
    src.backup(dst)
src.close(); dst.close()
PY
    log "  ✓ $db"
done

ARCHIVE="submit-db-$TS.tar.gz.age"
tar -czf - -C "$TMP/db" . | age -r "$RECIPIENT" -o "$TMP/$ARCHIVE"
mv "$TMP/$ARCHIVE" "$OUT_DIR/$ARCHIVE"
chown "$PULL_USER" "$OUT_DIR/$ARCHIVE" 2>/dev/null || true
chmod 640 "$OUT_DIR/$ARCHIVE"
log "snapshot: $OUT_DIR/$ARCHIVE ($(du -h "$OUT_DIR/$ARCHIVE" | cut -f1))"

# ชี้ไฟล์ล่าสุดไว้ ให้หยิบง่ายเวลากู้
ln -sfn "$ARCHIVE" "$OUT_DIR/latest.tar.gz.age"

# ---------- 2) ไฟล์แนบ (มิเรอร์แบบเข้ารหัส, incremental) ----------
STORAGE="$DATA_DIR/storage"
added=0
if [ -d "$STORAGE" ]; then
    log "มิเรอร์ไฟล์แนบแบบเข้ารหัส..."
    while IFS= read -r -d '' f; do
        rel="${f#$STORAGE/}"
        h="$(printf '%s' "$rel" | sha256sum | cut -d' ' -f1)"
        out="$ENC_DIR/$h.age"
        [ -f "$out" ] && continue     # มีแล้ว = ห้ามทำซ้ำ (ดูหมายเหตุหัวไฟล์)
        tar -czf - -C "$STORAGE" "$rel" | age -r "$RECIPIENT" -o "$out.part"
        mv "$out.part" "$out"
        chown "$PULL_USER" "$out" 2>/dev/null || true
        chmod 640 "$out"
        added=$((added + 1))
    done < <(find "$STORAGE" -type f -print0)
fi
chown "$PULL_USER" "$ENC_DIR" 2>/dev/null || true
chmod 750 "$ENC_DIR"
log "  ✓ ไฟล์แนบ: เพิ่มใหม่ $added ไฟล์ (มิเรอร์รวม $(find "$ENC_DIR" -name '*.age' | wc -l) ไฟล์, $(du -sh "$ENC_DIR" | cut -f1))"

# ---------- 3) เก็บกวาด ----------
# ลบเฉพาะ snapshot ฐานข้อมูล — ไฟล์แนบในมิเรอร์ไม่ลบ (งานที่ถูกลบในระบบยังกู้ได้ กันลบพลาด)
log "ลบ snapshot เก่ากว่า $RETENTION_DAYS วัน..."
find "$OUT_DIR" -name 'submit-db-*.tar.gz.age' -type f -mtime "+$RETENTION_DAYS" -print -delete || true

log "เสร็จ ✓ (มี $(find "$OUT_DIR" -name 'submit-db-*.tar.gz.age' | wc -l) snapshot เก็บอยู่)"
