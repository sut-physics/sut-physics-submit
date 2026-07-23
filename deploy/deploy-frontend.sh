#!/usr/bin/env bash
# ============================================================
# รับ frontend จาก GitHub Actions แล้ววางลง pb_public/  (รันบน VM เท่านั้น)
#
# ตัวนี้เป็น **forced command** ของ key `deploy` ใน authorized_keys:
#   restrict,command="/opt/pocketbase/scripts/deploy-frontend.sh" ssh-ed25519 AAAA... gh-deploy
#
# ทำไมออกแบบแบบนี้ (แทนที่จะให้ GitHub ssh เข้ามารันคำสั่งเองตรงๆ):
#   secret ใน GitHub มีโอกาสหลุดได้ (คนในองค์กรที่มีสิทธิ์, action ของบุคคลที่สาม, บั๊กของ CI)
#   ถ้า key นั้นเข้า shell ได้เต็มสิทธิ์ + sudo ได้ = หลุดทีเดียวเสียทั้งเครื่อง
#   ล็อกไว้แบบนี้แล้ว key ที่หลุดทำได้อย่างเดียวคือ "เปลี่ยนไฟล์หน้าเว็บ" —
#   เข้า shell ไม่ได้ · sudo ไม่ได้ · อ่าน pb_data/ไฟล์แนบไม่ได้ · แตะ backup ไม่ได้
#
# ไม่ใช้ sudo เลย: pb_public/ ถูกตั้งเป็น deploy:pocketbase (750)
#   → user `deploy` เขียนได้ · user `pocketbase` อ่านได้ผ่าน group · ไม่ต้องให้สิทธิ์ root ใคร
#
# รับข้อมูลทาง stdin เป็น tar.gz (ไม่ใช่ rsync) เพราะ forced command เดียวจบ
# ฝั่งส่ง: tar -czf - index.html css js | ssh deploy@vm
# ============================================================
set -euo pipefail

PUBLIC_DIR="${PUBLIC_DIR:-/opt/pocketbase/pb_public}"
LOG="${LOG:-/var/log/submit-deploy.log}"

log() { echo "[$(date -Is)] $*" | tee -a "$LOG" >&2; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

log "รับ frontend จาก ${SSH_CLIENT%% *}..."

# กางลงที่พักก่อน — ถ้า tar พังจะได้ไม่ทำของจริงพัง
tar -xzf - -C "$TMP"

# ต้องมีไฟล์หลักครบ ไม่งั้นถือว่าส่งมาผิด (กันเว็บกลายเป็นหน้าว่างเพราะ artifact พัง)
[ -f "$TMP/index.html" ] || { log "✗ ไม่มี index.html — ยกเลิก ไม่แตะของจริง"; exit 1; }
[ -d "$TMP/css" ] && [ -d "$TMP/js" ] || { log "✗ ไม่มี css/ หรือ js/ — ยกเลิก"; exit 1; }

# **อย่าใช้ `rsync -a`** — มันเอา permission ของโฟลเดอร์ต้นทางไปทับ $PUBLIC_DIR ด้วย
# ต้นทางมาจาก `mktemp -d` ซึ่งเป็น 700 → pb_public กลายเป็น 700 → user `pocketbase`
# เดินเข้าไปอ่านไฟล์ไม่ได้ เว็บกลายเป็น 404 ทั้งเว็บ (เจอมาแล้ว 23 ก.ค.)
# ใช้ -rlt + --chmod กำหนดสิทธิ์ตายตัวแทน: ไฟล์เว็บเป็นของสาธารณะอยู่แล้ว อ่านได้ไม่เสียหาย
rsync -rlt --delete --chmod=D755,F644 "$TMP/" "$PUBLIC_DIR/"

log "✓ วางแล้ว: $(find "$PUBLIC_DIR" -type f | wc -l) ไฟล์"
