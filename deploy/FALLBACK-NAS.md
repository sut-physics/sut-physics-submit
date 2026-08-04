# แผนสำรอง: ย้ายระบบส่งงานมารันบน NAS (เมื่อ Oracle ใช้ไม่ได้)

เอกสารนี้ใช้ตอน **Oracle ล่ม / โดน reclaim / ไม่อยากใช้ Oracle แล้ว** — ย้ายมารันบน NAS
(`202.28.43.149`) แทน โดยใช้ **Docker Compose** แบบเดียวกับ dashboard ที่รันอยู่แล้วที่ `:8088`

> **นี่คือ cold standby** — ไม่ได้รันคู่ตลอด เตรียมของไว้ วันไหนต้องใช้จริงค่อยทำตามนี้
> เวลารวม ~20-30 นาที (ส่วนใหญ่รอ copy/ถอดรหัส backup)

> ⚠️ **ข้อควรรู้เรื่อง redundancy**: ปกติ NAS ทำหน้าที่เก็บ **backup** ของระบบ พอย้ายระบบมา
> **รัน**บน NAS ด้วย = ตัวจริงกับ backup อยู่เครื่องเดียวกัน (single point of failure).
> เพราะงั้นถ้าใช้ NAS เป็นตัวหลักยาวๆ **ต้องหาที่เก็บ backup ใหม่ที่ไม่ใช่ NAS** (ดูหัวข้อท้ายไฟล์)

---

## ต้องมีอะไรก่อนเริ่ม
- **เครื่อง dev** ที่มีกุญแจไข age → `~/submit-backup-key.txt` (ถอดรหัส backup ได้เฉพาะเครื่องนี้)
- คำสั่ง `age` บนเครื่อง dev (`apt install age` หรือ binary จาก github.com/FiloSottile/age)
- เข้า NAS ได้ (File Station / SMB / SSH) — dashboard รันบน NAS ด้วย Docker อยู่แล้ว = Container Manager พร้อมใช้
- repo นี้ (เอา `pb_public` = index/css/js + `pb_hooks/main.pb.js` ไปวาง)

---

## ขั้นตอน

### 1. กู้ข้อมูลจาก backup (ทำบน "เครื่อง dev" เท่านั้น — ที่เดียวที่มีกุญแจไข)
backup ที่ NAS เข้ารหัสไว้ทั้งหมด ต้องถอดบนเครื่องที่มี private key ก่อน

```bash
# ก๊อป backup จาก NAS มาเครื่อง dev (ผ่าน SMB/File Station) → ได้โฟลเดอร์ db/ + storage/
#   ที่มาบน NAS: /volume2/submit-backups/
# สมมติก๊อปมาไว้ที่ ~/from-nas

cd /home/santa/Workspace/sut-physics-submit
./scripts/restore-decrypt.sh ~/from-nas ~/restored ~/submit-backup-key.txt
# ได้ ~/restored/pb_data/ (data.db, auxiliary.db, storage/) + เช็ค integrity_check ให้เอง
```

ต้องเห็น `integrity_check: ok` และจำนวนบัญชีถูกต้อง ถึงจะไปต่อ

### 2. เตรียมโฟลเดอร์แอปบน NAS
สร้างโฟลเดอร์ **แยกจากโฟลเดอร์ backup** (`/volume2/submit-backups/` อย่าเอาไปปน) เช่น
`/volume2/coe-submit/` แล้วเอา 4 อย่างไปวางข้างใน:

```
/volume2/coe-submit/
  docker-compose.fallback.yml   ← ก๊อปจาก deploy/docker-compose.fallback.yml ใน repo
  pb_data/                      ← ก๊อปทั้งโฟลเดอร์จาก ~/restored/pb_data/
  pb_public/                    ← index.html + css/ + js/ จาก repo (ไฟล์หน้าเว็บ)
  pb_hooks/                     ← main.pb.js จาก repo  ⚠️ ห้ามลืม
```

> **`pb_hooks` สำคัญมาก** — ถ้าไม่วาง ระบบยังเปิดได้ แต่ **ด่านอนุมัติสมาชิก / กัน self-promote /
> ระบบลืมรหัสผ่าน หายเงียบๆ ไม่มี error เตือน** (บทเรียนเดียวกับตอนลืม scp hooks บน VM)

**เรื่องสิทธิ์ไฟล์**: compose **ไม่ตั้ง `user:`** (รันเป็น root) → เขียนโฟลเดอร์ที่ mount ได้เลย
ไม่ต้อง chown · ถ้าเผลอตั้ง `user: "1000:1000"` แล้วเจอ `mkdir /pb_data: permission denied` วน crash
= โฟลเดอร์ที่ extract มาใหม่ไม่ให้ uid 1000 เขียน → เอา `user:` ออก (ยืนยันจริงบน Synology 4 ส.ค.)

### 3. สตาร์ท container
บน NAS (ผ่าน SSH หรือ Container Manager → import compose):
```bash
cd /volume2/coe-submit
docker compose -f docker-compose.fallback.yml up -d
docker logs -f submit-fallback     # ดูว่าขึ้นปกติ ไม่มี migrate/permission error
```
เปิดทดสอบที่ **http://202.28.43.149:8091/** — ควรเห็นหน้า login และ login superuser ที่ `/_/` ได้

### 4. เช็คว่า hooks + frontend โหลดจริง (สำคัญ)
- เปิด `http://202.28.43.149:8091/` เห็นหน้าเว็บ = `pb_public` ทำงาน
- ยิงเช็ค hooks:
  ```bash
  curl -s -X POST http://202.28.43.149:8091/api/pwreset/request \
    -H 'Content-Type: application/json' -d '{"username":"__nope__"}'
  # ต้องได้ response จาก custom route (ไม่ใช่ 404) = pb_hooks โหลดอยู่
  ```
  ถ้าได้ **404** = hooks ไม่ถูกโหลด → เช็คว่า `./pb_hooks` mount เข้า `/pb_hooks` จริงไหม
  ถ้ายังไม่ติด เพิ่ม flag ชัดๆ ใน compose ที่ key `command:`
  `["serve","--http=0.0.0.0:8090","--dir=/pb_data","--publicDir=/pb_public","--hooksDir=/pb_hooks"]`

### 5. URL — เลือก 1 ใน 2

**ก. เร็ว (emergency-only):** ใช้ `http://202.28.43.149:8091/` ไปเลย
- ข้อดี: ไม่ต้องตั้งอะไรเพิ่ม · ข้อเสีย: URL กาก + เป็น http ไม่มี TLS + ต้องเข้าจากในเครือข่ายที่ถึง NAS ได้

**ข. URL สวย + HTTPS (แนะนำถ้าจะใช้ยาว):** Tailscale Funnel บน NAS — ทริกเดียวกับที่ Oracle ใช้
- Synology มี **Tailscale** ใน Package Center → ติดตั้ง → login เข้า **tailnet เดิม**
- เปิด Funnel ชี้ port 8091:
  ```bash
  tailscale funnel --bg 8091
  ```
- ได้ URL `<ชื่อ-nas>.tailXXXXX.ts.net` + Let's Encrypt อัตโนมัติ **โดยไม่ต้องเปิด port ออกเน็ต**
  (ต่อออกอย่างเดียวผ่าน :443 — เครือข่ายมหาลัยไม่ต้องแตะ firewall เหมือน backup pull ที่ทำงานอยู่)
- โบนัส: แก้ URL กากของ dashboard `:8088` ไปในตัวได้เลยถ้าอยาก

> `js/config.js` ใช้ `location.origin` อยู่แล้ว → เปิดจาก URL ไหนก็ต่อ PocketBase ถูกตัวเอง
> **ไม่ต้องแก้โค้ดอะไรเลย** ไม่ว่าจะใช้ทาง ก. หรือ ข.

### 6. บอกผู้ใช้ URL ใหม่
URL จะไม่เหมือน Oracle (`submit.tail42c76d.ts.net`) เพราะเป็นคนละเครื่อง — แจ้ง santa/yip/สมาชิก
(ถ้าในอนาคตมีโดเมนตัวเอง จะชี้ DNS มาที่เครื่องไหนก็ได้ ผู้ใช้ไม่ต้องจำ URL ใหม่ทุกครั้ง)

---

## หลังกู้ขึ้น NAS แล้ว — อย่าลืมเรื่อง backup
ตอนนี้ตัวจริงอยู่บน NAS = **ห้ามให้ backup อยู่บน NAS ที่เดียว** ไม่งั้นพังทีเดียวหมดทั้งคู่
เลือกอย่างน้อย 1:
- ก๊อป `pb_data/` ออกไปเครื่องอื่น/cloud เป็นระยะ (เข้ารหัสก่อนถ้าออก cloud — ใช้ `age` กุญแจล็อกเดิม)
- ตั้ง snapshot อัตโนมัติแบบที่ VM เคยทำ แต่ให้ปลายทางเป็นเครื่องอื่น ไม่ใช่ NAS ตัวเอง
- อย่างน้อยที่สุด: ดึง `pb_data/` มาเครื่อง dev เก็บไว้ทุกสองสามวันระหว่างที่รันบน NAS

## กลับไป Oracle/VPS เมื่อพร้อม
NAS เป็นแค่ที่พักชั่วคราว — พอตั้ง VM ใหม่ได้ ให้ทำตาม [RESTORE.md](RESTORE.md) (provision + systemd)
โดยใช้ `pb_data` ชุดล่าสุดจาก NAS เป็นต้นทาง แล้วปิด container fallback บน NAS
```bash
docker compose -f docker-compose.fallback.yml down
```
