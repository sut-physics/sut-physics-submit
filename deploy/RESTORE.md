# แผนรับมือ VM โดน reclaim / disk พัง (Disaster Recovery)

Oracle Always Free อาจดึงเครื่องคืน (idle-reclaim) หรือล็อกบัญชีได้ — แต่**ข้อมูลไม่หาย**
เพราะทุกคืน NAS จะดึง backup ลงมาเก็บไว้ที่ `202.28.43.149` (สำเนา off-site คนละที่กับ VM)
นี่คือขั้นตอนกู้ระบบกลับมาให้ครบ

> 💡 **อยากกู้ขึ้นเร็วโดยไม่ต้อง provision VM ใหม่?** ดู [FALLBACK-NAS.md](FALLBACK-NAS.md) —
> รันชั่วคราวบน NAS ด้วย Docker (แบบเดียวกับ dashboard) ระหว่างหา host ใหม่

> **ทดสอบแล้วจริง** (23 ก.ค. 2026): ดึง backup ที่เข้ารหัสจาก VM → ถอดรหัสด้วยกุญแจไข →
> `integrity_check: ok` · บัญชีครบ · **ไฟล์แนบ byte-identical กับต้นฉบับทุกไฟล์** ·
> ลองใช้กุญแจผิด → `no identity matched any of the recipients` (ถอดไม่ออกจริง)

## backup เก็บอะไรไว้ที่ไหน

**ทุกอย่างถูกเข้ารหัสก่อนออกจาก VM** — ไฟล์ที่กองอยู่บน NAS เปิดไม่ได้ถ้าไม่มีกุญแจไข
```
บน VM (สร้างตี 3 ทุกคืน)                    NAS ดึงลงมาตี 4 → /volume2/submit-backups/
  /var/backups/submit/db/                     db/submit-db-YYYYMMDD-HHMMSS.tar.gz.age
    submit-db-*.tar.gz.age    ← ฐานข้อมูล เก็บ 30 วัน
  /var/backups/submit/storage-enc/            storage/<sha256>.age
    <sha256 ของ path>.age     ← ไฟล์แนบ ทีละไฟล์ (incremental — มีแต่เพิ่ม ไม่ลบ)
```
- ชื่อไฟล์แนบถูก **hash** ไม่ใช่ชื่อจริง → NAS โดนแฮกก็ไม่รู้ว่ามีเอกสารชื่ออะไร
  (ชื่อไฟล์จริงถูก tar ไว้ข้างในก่อนเข้ารหัส ตอนกู้จึงคืน path เดิมให้เองโดยไม่ต้องมีตารางแปลง)
- แยกเป็นไฟล์ๆ แทนก้อนเดียวเพื่อให้ rsync ยัง incremental ได้ (ไม่ต้องดึงใหม่ทั้งก้อนทุกคืน)

## 🔑 กุญแจไข (private key) — สำคัญที่สุด

**`~/submit-backup-key.txt` บนเครื่อง dev · ขึ้นต้นด้วย `AGE-SECRET-KEY-1...`**

- VM ถือแค่ **กุญแจล็อก (public)** ที่ `/opt/pocketbase/scripts/backup-recipient.pub` — เข้ารหัสได้อย่างเดียว ถอดไม่ได้
- **กุญแจไขต้องไม่อยู่บน VM และไม่อยู่บน NAS** → แฮกที่ไหนก็เปิด backup ไม่ออก
- ⚠️ **กุญแจไขหาย = กู้ backup ไม่ได้ถาวร ไม่มีทางแก้** → เก็บอย่างน้อย 2-3 ที่
  (password manager + ที่อื่นที่ไม่ใช่เครื่อง dev เครื่องเดียว)

## สิ่งที่ต้องเก็บไว้ให้ปลอดภัย (นอก VM — กันหายพร้อมเครื่อง)
- **กุญแจไข age** ← ขาดอันนี้อันเดียว backup ทั้งหมดเป็นขยะ
- private key ของ NAS (`submit-nas-pull`) — ตอนนี้อยู่บน NAS ที่เดียว วิธีสร้างใหม่อยู่ใน `note.md`
- โค้ด repo
- PocketBase superuser email/password (จริงๆ ถูก backup ไปกับ data.db อยู่แล้ว — restore มาก็ login ได้)

## ขั้นตอนกู้ (เมื่อต้องตั้งเครื่องใหม่)

1. **เอา backup จาก NAS มาที่เครื่องที่มีกุญแจไข** — ก๊อป `/volume2/submit-backups/` (โฟลเดอร์ `db/` + `storage/`)
   ผ่าน File Station หรือ SMB
2. **ถอดรหัส**
   ```bash
   ./scripts/restore-decrypt.sh ~/from-nas ~/restored ~/submit-backup-key.txt
   ```
   ได้ `~/restored/pb_data/` ที่มี `data.db`, `auxiliary.db`, `storage/` ครบ (สคริปต์เช็ค integrity ให้ด้วย)
   > ต้องมีคำสั่ง `age` — `apt install age` หรือโหลด binary จาก github.com/FiloSottile/age
3. **Provision VM ใหม่** — Oracle อีกครั้ง หรือสลับไป VPS อื่น (ดู DEPLOY.md ขั้น 0)
4. **ติดตั้ง PocketBase** — `sudo bash install-pocketbase.sh` (ได้ systemd service กลับมา)
5. **วางข้อมูลกลับ**
   ```bash
   sudo systemctl stop pocketbase
   sudo rsync -a ~/restored/pb_data/ /opt/pocketbase/pb_data/
   sudo chown -R pocketbase:pocketbase /opt/pocketbase/pb_data
   sudo systemctl start pocketbase
   ```
   security rules + ด่านอนุมัติติดมากับ `data.db` เอง ไม่ต้อง import schema ใหม่
6. **วาง `pb_hooks/main.pb.js` กลับ** — ไม่ได้อยู่ใน pb_data ต้องก๊อปจาก repo แล้ว restart
   (ถ้าลืม: ด่านกันยกระดับสิทธิ์ + ระบบลืมรหัสผ่านจะหายไปเงียบๆ)
7. **วาง frontend กลับ** — `pb_public/` ตาม DEPLOY.md ขั้น 2
8. **เปิด Tailscale Funnel ใหม่** — `sudo tailscale funnel --bg 8090` (เครื่องใหม่จะได้ URL `*.ts.net` ใหม่)
9. **ตั้ง backup กลับ** — ก๊อป `snapshot-local.sh` + กุญแจล็อกขึ้น VM ใหม่, ตั้ง cron ตี 3,
   ทำ bind mount + authorized_keys ของ NAS ใหม่ (ดู DEPLOY.md ขั้น 5)
10. `config.js` ใช้ `location.origin` อยู่แล้ว → ไม่ต้องแก้ URL อะไรเลย

เวลารวมกู้กลับ: ~20-30 นาที (ส่วนใหญ่คือรอ provision VM)

## ลดโอกาสโดน reclaim ตั้งแต่แรก
- อัป Oracle เป็น **Pay-As-You-Go** (ยังจ่าย ฿0) — idle-reclaim ใช้กับบัญชี free ล้วนเป็นหลัก
- ให้เครื่องมี activity อยู่บ้าง (PocketBase + Tailscale + cron backup ก็ช่วยให้ไม่ idle 100%)
- **มี backup รายวัน = ต่อให้โดนจริงก็แค่เสียเวลา ไม่เสียข้อมูล**

## ตรวจสุขภาพ backup เป็นระยะ (กัน "backup ที่กู้ไม่ได้")
เดือนละครั้ง รัน `restore-decrypt.sh` กับ backup ล่าสุดแล้วดูว่า `integrity_check: ok` และไฟล์แนบครบ —
backup ที่ไม่เคยทดสอบกู้ = ยังไม่นับว่ามี backup
**และเป็นการเช็คไปในตัวว่ากุญแจไขที่เก็บไว้ยังใช้ได้จริง**
