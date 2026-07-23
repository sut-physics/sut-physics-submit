# 📍 เราอยู่ตรงไหน / ต่อไปทำอะไร

> ไฟล์สถานะ อัปเดตทุกครั้งที่คืบหน้า — เปิดไฟล์นี้ไฟล์เดียวก็รู้ว่าเหลืออะไร
> อัปเดตล่าสุด: **2026-07-23 17:45** — ระบบใช้งานจริงแล้ว · backup เข้ารหัส · ขึ้น GitHub + auto-deploy

---

# 🚀 สรุปสำหรับ session ใหม่ (อ่านแค่นี้ก็พอ)

| | |
|---|---|
| เว็บ | **https://submit.tail42c76d.ts.net/** (ทดสอบจากมือถือ 5G นอกมหาวิทยาลัยแล้ว ✓) |
| Admin UI | https://submit.tail42c76d.ts.net/_/ (superuser — รหัสอยู่ใน **Google Password Manager** + `.env`) |
| repo | https://github.com/sut-physics/sut-physics-submit (private) |
| VM | `ssh -i "$VM_SSH_KEY" "$VM_USER@$VM_HOST"` — ค่าอยู่ใน `.env` · วิธีดูแลทั้งหมดอยู่ใน `deploy/OPERATIONS.md` |
| **deploy** | **`./deploy.sh -m "ข้อความ"`** = commit+push+อัปทุกอย่าง+ตรวจผล · `./deploy.sh --check` = ตรวจเฉยๆ |
| Backup | ตี 3 VM สร้าง snapshot **เข้ารหัส (age)** → ตี 4 NAS ดึงลง `/volume2/submit-backups/` |
| กุญแจไข backup | `~/submit-backup-key.txt` + **Google Password Manager** (`backup-age-key`) — หายทั้งคู่ = กู้ backup ไม่ได้ถาวร |
| บัญชีในระบบ | `santa` (admin) · `member1` (user) |

### ⏭️ เหลืออะไร

**คุณ (santa) ทำเอง — ผมทำแทนไม่ได้**
1. **บอก kobdai (เจ้าของ NAS)** เรื่อง scheduled task + NAS ต่อออกไป Oracle ตี 4 ทุกคืน
   — เขากังวลเรื่องความปลอดภัยมากเพราะ NAS โดนพยายามแฮกตลอด ถ้าไปเจอ log เองจะดูเหมือนโดนบุกรุก
2. **แก้ `note.md` ของ repo dashboard เดิม** (`/home/santa/Workspace/sut-physics-nas/note.md`)
   → เก็บรหัส NAS **เก่าที่ใช้ไม่ได้แล้ว** (เสียเวลากับมันไปรอบนึงวันที่ 23 ก.ค.)
3. **สำเนากุญแจ age ที่สาม** (กระดาษ/USB) — ตอนนี้อยู่ 2 ที่ ทั้งคู่ผูกกับเครื่อง/บัญชี Google เดียว
   ถ้าเข้าบัญชี Google ไม่ได้ = เสียทั้งกุญแจ backup และรหัส superuser พร้อมกัน
4. เปิด 2-Step Verification ของบัญชี Google (ตอนนี้บัญชีเดียวเปิดได้ทุกอย่าง)

**สั่งผมได้เลย**
5. **เช็ค cron ตี 3 คืนแรก** — สคริปต์ backup ตัวเข้ารหัส**ยังไม่เคยรันอัตโนมัติเลยสักครั้ง**
   (ที่ผ่านมาสั่งรันเองทั้งหมด) พรุ่งนี้เปิด `/var/log/submit-snapshot.log` + `pull.log` ฝั่ง NAS ดูสักครั้ง
6. **ตั้ง admin คนที่สอง** — ยังไม่ได้ทำ ถ้าตั้ง `member1` จะได้เช็คตัวนับคิวแบบหลาย admin ไปด้วย
7. ~~backlog v2~~ ✅ ทำแล้ว 3 ใน 4 (ดูหัวข้อด้านล่าง) — เหลือ **โดเมนตัวเอง** ที่ต้องมีโดเมนก่อนถึงทำได้
8. อัป `scripts/nas-pull.sh` ตัวใหม่ทับบน NAS (แก้บรรทัดนับ snapshot ที่ขึ้น 0 — **แค่ log ผิด ไม่กระทบการทำงาน**)

---

## ✅ เสร็จแล้ว (Phase 1 — build + test local ครบ)
- แอปเต็มระบบ: login/signup, list, detail, ส่งงาน, ตอบกลับกระทู้, เปลี่ยนสถานะ, realtime, คิว
- **ด่านอนุมัติสมาชิก**: สมัคร→pending→admin/santa อนุมัติ→ใช้งานได้ (กัน self-approve/self-promote ด้วย `pb_hooks`)
- Schema (`pb_schema.json`) + security ทดสอบผ่านหมด (permission 24/24, hook 9/9, backup/restore ของจริง)
- Deploy artifacts พร้อม: `deploy/install-pocketbase.sh`, `deploy/DEPLOY.md`, `deploy/RESTORE.md`, `scripts/backup.sh`, `scripts/restore.sh`, `.github/workflows/deploy-frontend.yml`
- Stack เคาะแล้ว: Oracle Free VM + Tailscale Funnel + backup ลง NAS = ฟรี ฿0
  (**เดิมวางแผนใช้ Cloudflare R2 แต่เปลี่ยนเป็น NAS วันที่ 23 ก.ค. เพราะไม่อยากผูกบัตร** —
  `scripts/backup.sh` เวอร์ชัน R2 ยังเก็บไว้เผื่ออยากกลับไปใช้ แต่ **ตอนนี้ไม่ได้ใช้แล้ว**
  ตัวที่ใช้จริงคือ `scripts/snapshot-local.sh` (บน VM) + `scripts/nas-pull.sh` (บน NAS))
- Backup แบบประหยัด (DB snapshot เล็ก + ไฟล์แนบ incremental) — ทดสอบวงจร backup→restore ครบแล้ว

### 🆕 backlog v2 — ทำแล้ว 3 ใน 4 (23 ก.ค.)
**1. ส่งต่อผู้รับ (reassign)** — ผู้รับปัจจุบันเลือกผู้ตรวจคนใหม่ได้ในหน้า detail
- `updateRule` เดิม (`recipient = @request.auth.id`) กันคนอื่นส่งต่ออยู่แล้ว · hook เติมสิ่งที่ rule เขียนไม่ได้:
  ผู้รับคนใหม่ต้อง **เป็น admin + approved** และ **ห้ามเป็นเจ้าของงานเอง** (ไม่งั้นกลายเป็นตรวจงานตัวเอง)
- ส่งต่อแล้วคนเดิม**หลุดสิทธิ์ทันที** (404) → UI ปิดหน้า detail + โหลดรายการใหม่ ไม่งั้นค้างหน้าที่กดอะไรก็ error

**2. ปิดใช้งาน user (แทนการลบ)** — `status: disabled`
- **`users.authRule = status != "disabled"`** → login ไม่ได้ (403)
- **hook เรียก `refreshTokenKey()` ตอนถูกปิด** → token ที่ออกไปแล้ว**ตายทันที** (401)
  ⚠️ ถ้าไม่ทำข้อนี้ `authRule` กันได้แค่ login ใหม่ คนที่เปิดแท็บค้างไว้ยังทำงานต่อได้อีกเป็นสัปดาห์
- เหตุผลที่ต้อง "ปิด" ไม่ใช่ "ลบ": **PocketBase ลบ user ที่มีงานผูกอยู่ไม่ได้เลย**
  (`Failed to delete record. Make sure that the record is not part of a required relation reference`)

**3. admin ตั้ง admin คนอื่นได้** — ไม่ต้องรบกวน superuser แล้ว
- admin เลื่อน **user ธรรมดา** ขึ้นเป็น admin ได้ · เปิด-ปิดใช้งาน user ธรรมดาได้
- **ของตัวเองแก้ไม่ได้** (403) กันเลื่อนขั้น/อนุมัติตัวเอง
- **แตะบัญชี admin ด้วยกันไม่ได้** (403) — ถอดสิทธิ์/ปิดใช้งาน/ตั้งรหัสให้ admin ต้องผ่าน **superuser ที่ Admin UI**
  เหตุผล: ตอนแรกเปิดให้ทำได้ แล้วทดสอบพบว่า **admin คนหนึ่งล็อก admin อีกคนออกจากระบบได้ รวมถึงเจ้าของระบบเอง**
  → ปิดทางนั้นวันที่ 23 ก.ค. · UI ไม่โชว์ปุ่มบนแถวของ admin แล้ว ขึ้นข้อความบอกแทน
  (กู้ได้เสมอผ่าน superuser — ทดสอบยืนยันว่า superuser แก้กลับได้ 200)
- `role`/`status` เป็น field แบบ text ไม่ใช่ select → hook ตรวจค่าที่ยอมรับได้เอง
  ไม่งั้นใส่ค่ามั่วได้ แล้วเงื่อนไขอย่าง `role = "admin"` ทั่วระบบจะเพี้ยน
- หน้า "จัดการสมาชิก" tab แรกเปลี่ยนจาก "สมาชิกใหม่" เป็น **"สมาชิก"** — เห็นทุกคนในระบบพร้อมป้ายสถานะ
  ปุ่มขึ้นตามสถานะแต่ละคน (อนุมัติ / ปิด-เปิดใช้งาน / ตั้ง-ถอดผู้ดูแล) · **ตัวเองไม่มีปุ่ม**
  ป้ายตัวเลขบน tab = จำนวนคนรออนุมัติ (ไม่ใช่จำนวนสมาชิกทั้งหมด)

ทดสอบ 15/15 บน PocketBase local + ยืนยัน authRule/hooks บน production แล้ว · **ยังไม่ได้กดผ่าน UI จริง**

**4. โดเมนตัวเอง — ยังทำไม่ได้** ต้องมีโดเมนก่อน (ซื้อ/ขอจากมหาลัย) แล้วค่อยชี้ DNS มาที่ Funnel
หรือย้ายไป `cloudflared` ที่ติดตั้งค้างไว้บน VM แล้ว (ดู DEPLOY.md ขั้น 4A)

### 🚀 `./deploy.sh` — สั่งครั้งเดียวจบ (23 ก.ค.)
`./deploy.sh -m "ข้อความ"` = commit + push + อัป frontend/hooks/schema/สคริปต์ backup + ตรวจผล
`./deploy.sh --check` = ตรวจอย่างเดียวว่าของบนเครื่องตรงกับ repo ไหม · เลือกทำทีละขั้นก็ได้
- **ปิดช่องโหว่ที่ลืม `pb_hooks` ได้** — เดิมต้อง scp มือทุกครั้ง ลืมเมื่อไหร่ ด่านความปลอดภัยหายเงียบๆ
  โดยเว็บยังทำงานปกติ ไม่มี error เตือน · ตอนนี้ verify ยิง `/api/pwreset/request` เช็คว่า hooks โหลดอยู่จริง
- ขยับ `?v=` ให้เองจาก hash ของ css/js (เนื้อไม่เปลี่ยน = ไม่มี diff รก) — **ต้องทำก่อนขั้น git**
  ไม่งั้น commit ไปแล้วค่อยแก้ index.html จะเหลือไฟล์ค้างทุกครั้ง (เจอตอนรันจริงรอบแรก)
- restart PocketBase เฉพาะตอน hooks เปลี่ยนจริง (เทียบ sha256) — ไม่ restart ทิ้งๆ ขว้างๆ
- คืนเจ้าของ `pb_public` เป็น `deploy:deploy` เสมอ ไม่งั้น GitHub Actions เขียนทับไม่ได้รอบถัดไป

### 🐙 ขึ้น GitHub + auto-deploy แล้ว (23 ก.ค.)
**repo: https://github.com/sut-physics/sut-physics-submit (private)**
- push ไฟล์ `index.html`/`css/`/`js/` ขึ้น `main` → **deploy เองภายใน ~15 วินาที** (ทดสอบผ่านแล้ว)
- **ค่าจริงย้ายมาอยู่ที่ `.env`** (ไม่ขึ้น git) · ต้นแบบ `.env.example` (ขึ้น git)
  · วิธีดูแลระบบทั้งหมดย้ายมา `deploy/OPERATIONS.md` (ไม่มีค่าจริงสักตัว ใช้ `$VM_HOST` แทน)
  ⚠️ pattern `.env*` ใน .gitignore กิน `.env.example` ไปด้วย ต้องมี `!.env.example` ต่อท้าย
- **key ที่ฝากไว้ใน GitHub ไม่ใช่ key ที่เข้า VM ได้เต็มสิทธิ์** — สร้าง user `deploy` (ไม่มี sudo)
  ล็อก key ด้วย `restrict,command="/usr/local/bin/deploy-frontend.sh"`
  → secret หลุดก็ทำได้แค่เปลี่ยนไฟล์หน้าเว็บ · เข้า shell ไม่ได้ · อ่าน `pb_data`/ไฟล์แนบไม่ได้ (ทดสอบยิงจริงแล้วทุกเคส)
  `/opt/pocketbase` เป็น `o+x` (เดินผ่านได้ list ไม่ได้) · `pb_public` เป็น `deploy:pocketbase`
- Secrets ที่ตั้งไว้: `VM_HOST` `VM_USER=deploy` `VM_SSH_KEY` `PB_URL`
- token ของ `gh` ต้องมี scope **`workflow`** ไม่งั้น push ไฟล์ใน `.github/workflows/` ไม่ได้
  (`gh auth refresh -h github.com -s workflow`)

> 🐞 **กับดัก: `rsync -a` เอา permission ของโฟลเดอร์ต้นทางไปทับปลายทางด้วย**
> ต้นทางมาจาก `mktemp -d` (mode 700) → `pb_public` กลายเป็น 700 → user `pocketbase`
> เดินเข้าไปอ่านไม่ได้ → **เว็บ 404 ทั้งเว็บ** ทั้งที่ไฟล์อยู่ครบและ `/api/health` ยัง 200
> แก้ด้วย `rsync -rlt --delete --chmod=D755,F644` (ไม่ใช่ `-a`)

### 🔐 เข้ารหัส backup แล้ว (23 ก.ค.)
ไฟล์ที่กองอยู่บน NAS **เปิดไม่ได้ถ้าไม่มีกุญแจไข** — NAS โดนแฮกก็อ่านข้อมูลนิสิตไม่ได้
- ใช้ `age` แบบกุญแจคู่ · VM ถือแค่ **กุญแจล็อก (public)** ที่ `/opt/pocketbase/scripts/backup-recipient.pub`
- **กุญแจไข (private) อยู่ที่ `~/submit-backup-key.txt` บนเครื่อง dev เท่านั้น** — ไม่เคยไปแตะ VM เลย
  (สร้างด้วย age binary ที่โหลดมาไว้ในโฟลเดอร์ชั่วคราว เพราะติดตั้งบนเครื่อง dev ไม่ได้ sudo ต้องใส่รหัส)
  ⚠️ **หาย = กู้ backup ไม่ได้ถาวร** → ยังต้องเก็บสำรองอีก 2-3 ที่ ← **ค้างอยู่**
- ฐานข้อมูล: `submit-db-*.tar.gz.age` · ไฟล์แนบ: มิเรอร์ใหม่ที่ `/var/backups/submit/storage-enc/`
  เข้ารหัสทีละไฟล์ ชื่อเป็น **sha256 ของ path** (NAS ไม่รู้ด้วยซ้ำว่ามีเอกสารชื่ออะไร)
  path จริง tar ไว้ข้างใน → กู้แล้วคืนโครงเดิมเองโดยไม่ต้องมีตารางแปลงชื่อ
- **เปลี่ยน bind mount**: `/srv/submit-backup/storage` ชี้ไป `storage-enc` แทน `pb_data/storage` (แก้ `/etc/fstab` แล้ว)
  → **ฝั่ง NAS ไม่ต้องแตะอะไรเลย** สคริปต์เดิมดึงได้ตามปกติ ได้ของที่เข้ารหัสมาแทน
- **ห้ามเข้ารหัสไฟล์ที่มิเรอร์ไว้แล้วซ้ำ** — age สุ่มค่าใหม่ทุกครั้ง ผลจะไม่เหมือนเดิม rsync จะดึงใหม่ทั้งก้อนทุกคืน
  (สคริปต์ข้ามไฟล์ที่มีอยู่แล้ว · ทดสอบยืนยัน: รันซ้ำ = เพิ่ม 0 ไฟล์ ไฟล์เดิมไม่ถูกแตะ)
- ทดสอบครบวงจรแล้ว: ดึงแบบเดียวกับ NAS → ถอดรหัส → `integrity_check: ok` · บัญชีครบ ·
  **ไฟล์แนบ byte-identical กับต้นฉบับทุกไฟล์** · กุญแจผิดถอดไม่ออกจริง · ลบไฟล์ที่ถอดออกมาด้วย `shred` แล้ว
- snapshot เก่าที่ยังไม่ได้เข้ารหัสบน VM ถูก `shred` ทิ้งแล้ว
- **⚠️ ค้าง: ลบไฟล์ plaintext เก่าบน NAS** — `--ignore-existing` ไม่ลบของเก่าให้
  ต้องลบ `/volume2/submit-backups/db/*.tar.gz` (ไม่มี `.age`) กับ `/volume2/submit-backups/storage/pbc_*/` เอง
- ไฟล์ใหม่: `scripts/restore-decrypt.sh` · `deploy/RESTORE.md` เขียนใหม่หมด (ของเดิมยังพูดถึง R2 ที่เลิกใช้แล้ว)

### ปรับเพิ่มรอบล่าสุด (23 ก.ค.)
- **เปลี่ยนรหัสผ่านเองได้แล้ว** — อยู่ใน **dropdown ที่ชื่อตัวเองมุมขวาบน** (เมนู: เปลี่ยนรหัสผ่าน / ออกจากระบบ)
  + ลิงก์ในหน้ารออนุมัติ · (ไม่ต้องแก้ rule/hook — server บังคับขอรหัสเดิมอยู่แล้ว) · deploy ขึ้น VM แล้ว
  ทดสอบบน PocketBase local ยืนยัน: ไม่ใส่รหัสเดิม/ใส่ผิด → 400 · **admin ตั้งรหัสให้คนอื่นไม่ได้** (ยึดบัญชีไม่ได้)
  ยังไม่ได้กดผ่าน UI จริง ← รวมอยู่ในรอบทดสอบข้อ 4
- **"ลืมรหัสผ่าน" — ผู้ดูแลตั้งรหัสให้เป็นรายคน แล้วไปบอกเจ้าตัวเอง** (ไม่ต้องใช้ SMTP/อีเมลจริง)
  ผู้ใช้กรอก username → คำขอโผล่ในกล่อง **"จัดการสมาชิก" tab "รหัสผ่าน"** → admin ตั้งรหัสให้ →
  admin คัดลอกรหัสไปบอกเจ้าตัว → เจ้าตัว login แล้วเปลี่ยนรหัสเองที่เมนูชื่อตัวเอง
  - **`Physics0Sut` ไม่ใช่รหัสจริง** เป็นแค่**ค่าตั้งต้นในช่องกรอก** ไว้กันคิดไม่ออก
    **ต้องแก้ก่อนถึงกดได้** (ปุ่มสีเทา + **server ปฏิเสธถ้าส่งค่านั้นมาตรงๆ** ไม่ว่าพิมพ์เล็กหรือใหญ่)
    → ทุกบัญชีได้รหัสไม่ซ้ำกัน · มีปุ่ม **"สุ่ม"** เติมเลข 4 หลักต่อท้ายให้ (`Physics0Sut4821`)
    → **จุดอ่อน "รหัสกลางที่ทุกคนรู้" หายไปทั้งหมด** ค่านี้จะไม่มีวันไปอยู่ใน DB จริงสักบัญชี
  - collection **`password_resets`** — client อ่านได้เฉพาะ admin, สร้าง/แก้ทำผ่าน hook เท่านั้น
  - 2 custom routes: `/api/pwreset/request` (ไม่ต้อง login) · `/api/pwreset/set` (admin)
    (ต้องเป็น custom route เพราะ PocketBase บังคับขอรหัสเดิมเสมอ คนที่ลืมรหัสจึงใช้ API ปกติไม่ได้)
  - **บัญชี role=admin ทำทางนี้ไม่ได้ทั้งขอและตั้งให้** → superuser ตั้งที่ Admin UI (กัน admin ยึดบัญชีกันเอง)
  - คำขอหมดอายุ 24 ชม. · 1 บัญชีค้างได้ทีละ 1 (ยื่นซ้ำ = ทับของเก่า) · ตั้งรหัสแล้วคำขอถูกลบจากคิวอัตโนมัติ
  - ⚠️ ใครก็ยื่นคำขอในนามคนอื่นได้ → **admin ต้องยืนยันกับเจ้าตัวก่อนตั้งรหัสให้เสมอ**
  - ทดสอบ 11/11 บน local + ยืนยัน 2 เคสบน production · ยังไม่ได้กดผ่าน UI จริง
  - ค่าตั้งต้นอยู่ 2 ที่ ต้องแก้ให้ตรงกัน: `PW_PLACEHOLDER` ใน `js/admin.js` + `"physics0sut"` ใน `pb_hooks/main.pb.js`
- **กล่อง "จัดการสมาชิก" มี 2 tab** (มีป้ายตัวเลขทั้งคู่): **สมาชิกใหม่** / **รหัสผ่าน**
  tab รหัสผ่านเป็น**ฟอร์มเดียว** — คำขอที่ค้างแสดงเป็น "ชิป" ด้านบน กดแล้วเด้งไปเลือกคนนั้นในฟอร์มให้
  (เดิมแยก 3 tab แล้วงง เพราะ "คำขอ" กับ "ตั้งรหัสให้" คืองานเดียวกัน)
- **ตัวเลขบนปุ่มรออนุมัติเด้งเองแล้ว** — subscribe realtime `users` + `password_resets`
  (เดิมนับแค่ตอน login ครั้งเดียว → admin ไม่รู้เลยว่ามีคนขอ จนกว่าจะ refresh หน้าเว็บ)

> 🐞 **กับดักใหญ่ที่เจอ — PocketBase SDK auto-cancellation** (ทำให้ dropdown ขึ้น "โหลดไม่สำเร็จ")
> SDK **ยกเลิก request เก่าอัตโนมัติเมื่อ method+URL ซ้ำกัน** → query หลายอันที่ยิง**คอลเลกชันเดียวกัน
> พร้อมกัน จะฆ่ากันเองเหลือแค่อันสุดท้าย** โดยขึ้น error ว่า `The request was autocancelled`
> พิสูจน์แล้วด้วยสคริปต์ Node: ไม่ตั้ง key → query แรกล้มเหลว / ตั้ง key แยก → ผ่านทั้งคู่
> **แก้แล้วทุกจุด** ด้วยการใส่ `requestKey` แยก — จุดที่โดนคือ:
> - `loadSetPwUsers` ชนกับ `loadPendingLists` (ทั้งคู่ query `users`) ← ต้นเหตุที่เลือกผู้ใช้ไม่ได้
> - `refreshPendingCount` ชนกับทั้งสองอันข้างบน
> - **`getAdminQueueCount` ชนกับตัวเอง** เพราะยิงทีละ admin ในลูป → **ตัวนับคิวจะพังทันทีที่มี admin 2 คนขึ้นไป**
>   (ตอนนี้มี admin คนเดียวเลยไม่เห็นอาการ) ใช้ `requestKey: 'queueCount_' + adminId`
> **เขียนโค้ดเพิ่มต่อจากนี้ ถ้ายิง query ซ้อนกันบนคอลเลกชันเดียวกัน ต้องตั้ง `requestKey` เสมอ**

> **กับดักที่เจอตอนเขียน pb_hooks (จดกันลืม)**: PocketBase รัน handler แต่ละตัวใน runtime แยก
> **มองไม่เห็นตัวแปร/ฟังก์ชันที่ประกาศนอก handler** — ดึงค่าคงที่ออกไปเป็นตัวแปรร่วมแล้วพังทันที
> และ error ที่ได้เป็น 400 `"Something went wrong..."` เฉยๆ ไม่บอกสาเหตุ ไม่ขึ้น log ด้วย

### ปรับเพิ่มรอบก่อนหน้า (21 ก.ค.)
- **กำหนดส่ง (deadline)**: เลือกจากปฏิทินตอนส่งงาน + คอลัมน์ในตาราง — เลยกำหนดแล้วยังไม่เสร็จ = แดงกะพริบ, ใกล้ครบ (≤2 วัน) = ส้ม, เสร็จแล้วเงียบ
- วันที่ส่งแสดง**เวลา**ด้วย · เปลี่ยนป้ายสถานะเป็น "รอดำเนินการ / กำลังดำเนินการ"
- **ตัวกรองทิศทาง** (ที่ได้รับ / ที่ฉันส่ง) + หัวคอลัมน์ปรับตามรายการอัตโนมัติ · เอา stat tiles ที่ซ้ำซ้อนออก
- admin **ส่งงานให้ตัวเองไม่ได้แล้ว** (กันทั้ง UI และ createRule)
- แก้บั๊ก token ค้างจาก instance เก่าทำให้เข้าแอปไม่ได้ (`checkLogin` ยืนยันกับ server ก่อน)
- `config.js` รองรับทั้ง VS Code Go Live (:5500), file://, และ production อัตโนมัติ

## 🎯 ได้ VM แล้ว! (23 ก.ค. 04:28) — กำลัง deploy อยู่
**Oracle Cloud VM สร้างสำเร็จหลังรันสคริปต์วนกดข้ามคืน** (ดู `~/oci-retry/`)
- **Public IP: `161.118.215.176`** · shape ที่ได้จริง = **AMD E2.1.Micro (x86_64, RAM 956MB, disk 43GB)** (ไม่ใช่ A1 — A1 เต็มตลอด)
- OS: Ubuntu 22.04.5 LTS · เน็ตออกได้ (IGW ทำงาน) · ทดสอบ SSH เข้าได้แล้ว
- **SSH: `ssh -i ~/Downloads/ssh-key-2026-07-22.key ubuntu@161.118.215.176`** (chmod 600 key แล้ว)
- OCI CLI ตั้งค่าเสร็จ (`~/.oci/config` + API key) — ใช้สั่งงาน VM ได้
- บัญชียัง **Free Trial** (ไม่ได้อัป PAYG — บัตรโดนปฏิเสธ) แต่ instance เป็น Always-Free-eligible = ฿0

### ✅ ขั้น 1-3 เสร็จแล้ว (23 ก.ค.) — server พร้อมใช้งาน รอแค่เปิดออกเน็ต
- [x] **ขั้น 1**: swap 2GB (`/swapfile`, ใส่ `/etc/fstab` + `vm.swappiness=10`) → PocketBase 0.25.2 amd64
      ที่ `/opt/pocketbase/` เป็น systemd service (`Restart=always`, bind `127.0.0.1:8090`) → superuser `ts.khumwong@gmail.com`
- [x] **ขั้น 2**: อัป frontend (index/css/js) ลง `pb_public/` + **`pb_hooks/main.pb.js`** ลง `pb_hooks/` แล้ว restart
- [x] **ขั้น 3**: import `pb_schema.json` ผ่าน API (`PUT /api/collections/import`) — ครบ 4 collections
      (`users`, `submissions`, `submission_replies`, `submission_queue`) rules ตรงกับไฟล์ทุกข้อ
- [x] **ทดสอบ security บนเครื่องจริงแล้ว**: สมัคร→ได้ `role=user status=pending` · สมัครแอบตั้ง admin/approved → 400 ·
      self-approve → 403 · self-promote → 403 · pending ส่งงาน → 400 · แก้ชื่อตัวเอง → 200 (ลบ user ทดสอบแล้ว)
- [x] `js/config.js` ใช้ `location.origin` อยู่แล้ว → ไม่ต้องแก้ตอนได้โดเมน
- [x] เขียน `note.md` (VM IP, SSH key path, รหัส superuser) — **ยังต้องย้ายรหัสเข้า password manager**

### 🌐 ขั้น 4 เสร็จแล้ว — **เว็บออนไลน์แล้ว**
## 👉 https://submit.tail42c76d.ts.net/
- ใช้ **Tailscale Funnel** (ไม่ใช่ Cloudflare — เลือกตอน 23 ก.ค. เพราะไม่ต้องยุ่งกับโดเมน/nameserver)
- TLS Let's Encrypt อัตโนมัติ · VM ไม่ได้เปิด port ออกเน็ตเลย (ต่อออกอย่างเดียว = firewall Oracle ไม่ต้องแตะ)
- `tailscaled` + `pocketbase` enable แล้วทั้งคู่ + funnel config persist → **รอด reboot**
- Admin UI: https://submit.tail42c76d.ts.net/_/ (login superuser — ดู `note.md`)
- `cloudflared` ติดตั้งค้างไว้บน VM แต่ไม่ได้ใช้ — อยากย้ายไปโดเมนตัวเองทีหลังก็ทำตาม DEPLOY.md ขั้น 4A ได้

**ทดสอบ end-to-end ผ่าน URL จริงแล้ว ผ่านหมด**: สมัคร 2 บัญชี → superuser ตั้ง admin/approve →
user เห็น dropdown admin → ส่งงานพร้อมไฟล์แนบ → admin เห็น (admin คนอื่นเห็น 0 รายการ / อ่านตรงๆ ได้ 404) →
คิวโชว์เฉพาะ id/recipient/status/created (ไม่รั่ว topic/description/file) → ตอบกลับ → admin เปลี่ยนสถานะ 200 /
sender เปลี่ยนเอง 404 → ดาวน์โหลดไฟล์แนบ 200 · ล้างข้อมูลทดสอบหมดแล้ว (cascade delete สะอาด ไม่มีไฟล์ค้าง)

**บัญชีจริง**: `santa` สมัครแล้ว → superuser ตั้งเป็น `role=admin`, `status=approved` เรียบร้อย (23 ก.ค.)
(field `name` ยังว่าง — แก้ได้ที่ Admin UI ถ้าอยากให้โชว์ชื่อจริงแทน username)

> ⚠️ **negative DNS cache**: ถ้าใครเปิด URL ก่อน Funnel ถูกเปิด resolver จะจำ NXDOMAIN ไว้ 5 นาที
> (เจอมาแล้วกับ DNS มหาวิทยาลัย `10.10.100.21/.22` — ตัวหนึ่งค้างนานถึง ~10 นาที)
> แก้: รอ แล้ว `resolvectl flush-caches` + ล้าง DNS ของ Chrome ที่ `chrome://net-internals/#dns`
> **ไม่ได้เกิดจากการบล็อก** — campus DNS resolve `hello.ts.net` ได้ปกติ

### ✅ ขั้น 5-6 เสร็จแล้ว (backup + verification)
- [x] **ขั้น 5 ฝั่ง VM**: เปลี่ยนจาก R2 → **backup ลง NAS แทน** (23 ก.ค. — user ไม่อยากผูกบัตร)
      แบบ **pull**: NAS ดึงจาก VM (VM ไม่ถือ credential ของ NAS → แฮก VM แล้วลบ backup ไม่ได้)
      `scripts/snapshot-local.sh` + cron ตี 3 + bind mount ro + กุญแจล็อกด้วย `rrsync -ro` — ทดสอบครบแล้ว
      (กู้ไฟล์ backup ออกมาเช็ค `integrity_check: ok` + เห็นบัญชี santa ครบ)
- [x] **ขั้น 5 ฝั่ง NAS**: เสร็จแล้ว — ทดสอบดึงจริงผ่าน 23 ก.ค. 12:11 (`เสร็จ ✓` ใน pull.log,
      ฝั่ง VM เห็นต่อเข้ามา 2 ครั้งจาก `202.28.43.149`)
      **หมายเหตุ**: ใช้ NAS เป็น "ที่เก็บ backup" เฉยๆ ไม่ได้ผูก uptime ของระบบส่งงานกับ NAS
      (NAS ล่ม = แค่ backup วันนั้นข้าม เว็บยังใช้ได้ปกติ) — ไม่ขัดกับ decision เดิมใน CLAUDE.md
      **ยังไม่ใช้ R2 แล้ว** → `scripts/backup.sh` (เวอร์ชัน R2) ยังเก็บไว้เผื่ออยากกลับไปใช้

      **4 ด่านที่เจอกว่าจะผ่าน (จดไว้กันลืมตอน setup เครื่องใหม่)**:
      1. DSM Task Scheduler ไม่ default เป็น root → ต้องเลือก `root` เอง ไม่งั้นเขียนไฟล์ไม่ได้
      2. เครือข่ายของ NAS **บล็อก SSH ขาออก (port 22)** → ต้องใช้ **443** (ดู note.md)
      3. Task Scheduler ไม่ตั้ง `HOME` → ssh หา `~/.ssh/known_hosts` ไม่เจอ → ปักหมุดไฟล์ข้างสคริปต์แทน
      4. ssh ของ DSM ขอ host key แบบ **ECDSA** → `known_hosts` ต้องมีครบ 3 ชนิด ไม่งั้นขึ้นเตือน MITM หลอก
- [x] **ขั้น 6**: บัญชี `santa` = admin + approved · เปิดจากมือถือ **5G นอกมหาวิทยาลัยได้จริง** ✓
- [x] **ทดสอบ restore เต็มวงจร** (23 ก.ค. 12:2x): แกะ `latest.tar.gz` ใส่ PocketBase เปล่า →
      รันที่ port 8091 → login superuser ได้ → ครบ 4 collections → บัญชี `santa` (admin/approved) อยู่ครบ →
      **security rules ติดมาด้วย** (ด่านอนุมัติไม่หายตอนกู้) · ลบ instance ทดสอบแล้ว ระบบจริงไม่กระทบ
- [x] **private key ของ NAS อยู่บน NAS ที่เดียวแล้ว** — ลบออกจากเครื่อง dev + ssh-agent + สำเนาใน scratchpad
      ทั้งหมดด้วย `shred` (23 ก.ค.) **ไม่มีสำเนาสำรอง** — ถ้าหายต้องสร้างใหม่ (วิธีอยู่ใน `note.md`)
- [ ] ย้ายรหัส superuser จาก `note.md` เข้า password manager แล้วลบบรรทัดนั้น ← **ยังค้าง**

## 🔮 ทำทีหลังได้ (backlog v2 — ยังไม่จำเป็น)
- Reassign ผู้รับหลังส่งไปแล้ว
- "ปิดใช้งาน" user (disable แทนลบ — เก็บประวัติ)
- ให้ admin ตั้ง admin คนอื่นได้ (ตอนนี้เฉพาะ santa)
- verify email จริง / จำกัด domain ตอนสมัคร (ตอนนี้ใช้ username→fake email)
- GitHub Actions ให้ deploy `pb_hooks` อัตโนมัติด้วย (ตอนนี้ frontend อย่างเดียว, hook อัปมือ)
- โดเมนสวยของตัวเอง (ถ้าอยากเลิกใช้ `*.ts.net`)

## 🧪 อยากลอง local ระหว่างรอ
demo scratchpad หยุดไปแล้ว — รันใหม่ได้ตาม [README.md](README.md) หัวข้อ "รันในเครื่อง (dev)"
(บัญชีทดสอบ: `somchai`/`duangjai`/`prasert` รหัส `password123`)
