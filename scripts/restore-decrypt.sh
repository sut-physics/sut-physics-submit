#!/usr/bin/env bash
# ============================================================
# ถอดรหัส backup ที่ดึงมาจาก NAS ให้กลับเป็นไฟล์ใช้งานได้
# **รันบนเครื่องที่มีกุญแจไข (private key) เท่านั้น** — ห้ามรันบน VM หรือ NAS
#
# ใช้:
#   ./restore-decrypt.sh <โฟลเดอร์ backup> <โฟลเดอร์ผลลัพธ์> [ไฟล์กุญแจไข]
#
#   เช่น (หลังก๊อป /volume2/submit-backups จาก NAS มาไว้ที่ ~/from-nas):
#   ./restore-decrypt.sh ~/from-nas ~/restored ~/submit-backup-key.txt
#
# โฟลเดอร์ backup ต้องมีหน้าตาแบบที่ NAS ดึงมา:
#   <backup>/db/submit-db-*.tar.gz.age        (เลือกไฟล์ล่าสุดให้อัตโนมัติ)
#   <backup>/storage/<ชื่อผู้ส่ง>/<sha256>.age  (ไฟล์แนบ แยกโฟลเดอร์ตามคนส่ง ชื่อไฟล์เป็น hash)
#
# ผลลัพธ์:
#   <out>/pb_data/data.db  auxiliary.db
#   <out>/pb_data/storage/...  (คืน path เดิมให้เอง — path จริงถูก tar ไว้ข้างในตอนเข้ารหัส)
#
# เอาไปใช้ต่อ: ก๊อป <out>/pb_data/ ทับ pb_data ของ PocketBase ตัวใหม่ แล้วสตาร์ท
# (ดูขั้นตอนเต็มใน deploy/RESTORE.md)
# ============================================================
set -euo pipefail

SRC="${1:?ต้องระบุโฟลเดอร์ backup ที่ดึงมาจาก NAS}"
OUT="${2:?ต้องระบุโฟลเดอร์ผลลัพธ์}"
KEY="${3:-$HOME/submit-backup-key.txt}"

command -v age >/dev/null || { echo "ไม่พบคำสั่ง age — ติดตั้งก่อน (apt install age หรือโหลด binary จาก github.com/FiloSottile/age)"; exit 1; }
[ -s "$KEY" ] || { echo "ไม่พบกุญแจไขที่ $KEY"; exit 1; }

mkdir -p "$OUT/pb_data/storage"

# ---------- ฐานข้อมูล: เอา snapshot ล่าสุด ----------
DB_ARCHIVE="$(ls -1 "$SRC"/db/submit-db-*.tar.gz.age 2>/dev/null | sort | tail -1 || true)"
[ -n "$DB_ARCHIVE" ] || { echo "ไม่พบ snapshot ฐานข้อมูลใน $SRC/db/"; exit 1; }
echo "ฐานข้อมูล: $(basename "$DB_ARCHIVE")"
age -d -i "$KEY" "$DB_ARCHIVE" | tar -xzf - -C "$OUT/pb_data"

# ---------- ไฟล์แนบ: ถอดทีละไฟล์ แล้ว untar คืน path เดิม ----------
# -r เพราะไฟล์อยู่ในโฟลเดอร์ย่อยตามชื่อผู้ส่ง (รองรับ backup เก่าที่วางแบนๆ ด้วย)
n=0
if [ -d "$SRC/storage" ]; then
    while IFS= read -r -d '' f; do
        age -d -i "$KEY" "$f" | tar -xzf - -C "$OUT/pb_data/storage"
        n=$((n + 1))
    done < <(find "$SRC/storage" -name '*.age' -type f -print0)
fi
echo "ไฟล์แนบ: ถอดแล้ว $n ไฟล์"

# ---------- ตรวจความสมบูรณ์ ----------
if command -v sqlite3 >/dev/null; then
    echo "integrity_check: $(sqlite3 "$OUT/pb_data/data.db" 'PRAGMA integrity_check;')"
else
    python3 - "$OUT/pb_data/data.db" <<'PY'
import sqlite3, sys
c = sqlite3.connect(sys.argv[1])
print("integrity_check:", c.execute("PRAGMA integrity_check;").fetchone()[0])
print("บัญชีในระบบ:", c.execute("select count(*) from users").fetchone()[0], "คน")
c.close()
PY
fi

echo "เสร็จ ✓ ผลลัพธ์อยู่ที่ $OUT/pb_data"
