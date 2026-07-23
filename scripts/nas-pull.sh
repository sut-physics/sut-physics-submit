#!/bin/sh
# ============================================================
# ดึง backup ของระบบส่งงานจาก Oracle VM ลงมาเก็บที่ NAS  (รันบน NAS เท่านั้น)
#
# ทำไมให้ NAS "ดึง" แทนให้ VM "ส่ง":
#   VM ไม่มี credential ของ NAS เลย → ถ้า VM โดนยึด คนแฮกลบ backup ที่ NAS ไม่ได้
#   (แบบ push ตัว VM ต้องถือกุญแจเขียน NAS = แฮก VM ได้ก็ลบ backup ได้หมด)
#
# กุญแจที่ใช้ถูกล็อกไว้ที่ฝั่ง VM แล้ว (rrsync -ro):
#   อ่านได้เฉพาะ /srv/submit-backup · เขียนไม่ได้ · รันคำสั่งอื่นไม่ได้ · ออกนอกโฟลเดอร์ไม่ได้
#
# ติดตั้งบน NAS — ทำผ่านหน้าเว็บ DSM ล้วนๆ ได้ ไม่ต้องใช้ SSH:
#   1) Control Panel → Shared Folder → Create → ชื่อ `submit-backups` (บน volume2)
#   2) File Station → อัปโหลด 2 ไฟล์ลงในโฟลเดอร์นั้น: `nas-pull.sh` + `submit-nas-pull` (private key)
#   3) Control Panel → Task Scheduler → Create → Scheduled Task → User-defined script
#      User: root · ทุกวัน 04:00 (หลัง VM สร้าง snapshot ตอนตี 3)
#      คำสั่ง: sh /volume2/submit-backups/nas-pull.sh
#
# สคริปต์ตั้ง permission ของ key ให้เองตอนเริ่ม (ไฟล์ที่อัปผ่าน File Station จะ perm กว้างเกินไป
# ซึ่ง ssh จะปฏิเสธไม่ยอมใช้) → เลยไม่ต้อง chmod เองผ่าน SSH
#
# ไฟล์ที่ดึงมา **เข้ารหัสไว้ทั้งหมด** (age) — NAS ถือแต่ของที่เปิดไม่ออก ต้องใช้กุญแจไขที่เก็บนอก NAS
# กู้คืน: ดู RESTORE.md — รัน scripts/restore-decrypt.sh บนเครื่องที่มีกุญแจไข
# ============================================================

VM_HOST="${VM_HOST:-161.118.215.176}"
# ใช้ port 443 ไม่ใช่ 22 — เครือข่ายที่ NAS อยู่บล็อก SSH ขาออก (port 22) ทำให้เจอ
# "No route to host" ฝั่ง VM เลยเปิดทาง 443 ให้ redirect เข้า sshd (เฉพาะ IP ของ NAS)
VM_PORT="${VM_PORT:-443}"
VM_USER="${VM_USER:-ubuntu}"
DEST="${DEST:-/volume2/submit-backups}"
SSH_KEY="${SSH_KEY:-$DEST/submit-nas-pull}"
KNOWN_HOSTS="${KNOWN_HOSTS:-$DEST/known_hosts}"
LOG="${LOG:-$DEST/pull.log}"

# ssh ปฏิเสธ key ที่คนอื่นอ่านได้ — ไฟล์ที่อัปผ่าน File Station มักเป็น 777/644 เลยต้องรัดให้แคบก่อน
[ -f "$SSH_KEY" ] && chmod 600 "$SSH_KEY" 2>/dev/null

# ปักหมุด host key ของ VM ไว้ในไฟล์ข้างๆ แทนการใช้ ~/.ssh/known_hosts
# (Task Scheduler ของ DSM ไม่ตั้ง HOME ให้ → ssh หา known_hosts ไม่เจอ)
# ยังกัน MITM ได้เต็มที่ ต่างจากการปิด StrictHostKeyChecking ทิ้ง
SSH_CMD="ssh -i $SSH_KEY -p $VM_PORT -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$KNOWN_HOSTS -o ConnectTimeout=20"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

mkdir -p "$DEST/db" "$DEST/storage"
log "===== เริ่มดึง backup จาก $VM_HOST ====="

# --- 1) snapshot ฐานข้อมูล ---
# ไม่ใส่ --delete: VM ลบของเก่าเกิน 30 วันไปแล้ว แต่ NAS เก็บย้อนหลังได้ยาวกว่า (ไฟล์เล็กมาก ~20KB)
if rsync -az --timeout=120 -e "$SSH_CMD" "$VM_USER@$VM_HOST:db/" "$DEST/db/" >> "$LOG" 2>&1; then
    log "  ✓ ฐานข้อมูล ($(ls -1 "$DEST/db"/submit-db-* 2>/dev/null | wc -l) snapshot)"
else
    log "  ✗ ดึงฐานข้อมูลไม่สำเร็จ (exit $?)"
    exit 1
fi

# --- 2) ไฟล์แนบ (incremental) ---
# ไม่ใส่ --delete เช่นกัน: งานที่ถูกลบในระบบ ไฟล์ยังอยู่ใน backup (ตั้งใจ กันลบพลาด)
if rsync -az --timeout=600 --ignore-existing -e "$SSH_CMD" "$VM_USER@$VM_HOST:storage/" "$DEST/storage/" >> "$LOG" 2>&1; then
    log "  ✓ ไฟล์แนบ ($(find "$DEST/storage" -type f 2>/dev/null | wc -l) ไฟล์, รวม $(du -sh "$DEST/storage" 2>/dev/null | cut -f1))"
else
    log "  ✗ ดึงไฟล์แนบไม่สำเร็จ (exit $?)"
    exit 1
fi

log "===== เสร็จ ✓ ใช้พื้นที่รวม $(du -sh "$DEST" 2>/dev/null | cut -f1) ====="

# ตัด log ไม่ให้โตไม่หยุด (เก็บ 2000 บรรทัดล่าสุด)
tail -n 2000 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG"
