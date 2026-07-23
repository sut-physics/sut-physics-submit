# ระบบส่งงาน (COE Physics)

ระบบส่งเอกสาร/งานให้ตรวจ — ผู้ส่งกรอกหัวข้อ + รายละเอียด + แนบไฟล์ เลือกผู้รับ (admin) จาก dropdown,
ผู้รับตรวจ/ตอบกลับแบบกระทู้/เปลี่ยนสถานะได้ ทุกฝ่ายเห็นสถานะทันที มีฟีเจอร์คิวบอกว่าผู้รับแต่ละคนมีงานค้างกี่รายการ
โดย **ไม่เห็นเนื้อหางานของคนอื่น**

รีเมคจากเว็บเดิม (yipdoc) โดยรอบนี้ **คุมโครงสร้างพื้นฐานเองทั้งหมด** — ดูเหตุผล/บทเรียนใน [CLAUDE.md](CLAUDE.md)

## Stack

- **Backend**: PocketBase 0.25.2 (self-host, Go binary + SQLite) — auth + file storage + realtime + views ในตัว
- **Frontend**: vanilla HTML/CSS/JS ไม่มี build step, ต่อผ่าน PocketBase JS SDK ผ่าน CDN
- **Hosting** (v1): **Oracle Cloud Always Free** VM (ฟรีตลอด, ARM Singapore) + **Cloudflare Tunnel** ชี้ `submit.<yourdomain>` (HTTPS อัตโนมัติ, ไม่เปิด port ออกเน็ต) — หรือ **Tailscale Funnel** (`*.ts.net`) ถ้าไม่มีโดเมน. แนะนำอัป Oracle เป็น Pay-As-You-Go เพื่อกัน idle-reclaim (ยังอยู่ใน free limit = ฿0). **หมายเหตุ**: Vercel/serverless ใช้ไม่ได้ เพราะรัน PocketBase (process ค้าง + SQLite disk) ไม่ได้ — นี่คือสาเหตุที่ yipdoc ต้องฝาก DB ภายนอกจนเสียการควบคุม
- **Backup**: cron รายวัน → Cloudflare R2 (ฟรี 10GB) แบบประหยัดพื้นที่ — ฐานข้อมูลเป็น snapshot เล็กๆ เก็บ 30 วัน + ไฟล์แนบซิงก์แบบ incremental (ส่งเฉพาะไฟล์ใหม่) ดู [scripts/backup.sh](scripts/backup.sh) · กู้คืน [scripts/restore.sh](scripts/restore.sh)

## โครงสร้าง

```
index.html          หน้าเดียว: login/signup + list + detail + modal ส่งงานใหม่
css/  variables.css  design tokens (light/dark) — ยกจาก mockup ที่อนุมัติ
      base.css       reset + topbar + ปุ่ม + auth screens
      submit.css     list/detail/stamp/thread/composer/modal
js/   config.js      PB_URL (dev ชี้ localhost; deploy เปลี่ยนเป็น tunnel URL)
      state.js       global: pb, currentUser, listState, STATUS
      auth.js        login/signup/logout + หน้า "รออนุมัติ" (สมัครแล้วต้องรอ santa อนุมัติก่อนส่งงาน)
      submissions.js CRUD + upload + realtime + queue + render list/detail
      admin.js       ปุ่ม/หน้าอนุมัติสมาชิก (เฉพาะ admin)
      app.js         bootstrap (DOMContentLoaded)
pb_hooks/main.pb.js guard ความปลอดภัย: กัน self-approve/self-promote, จำกัด admin แก้ได้แค่ status
pb_schema.json      schema ทั้ง 4 collections (import ได้ผ่าน Admin UI)
scripts/backup.sh   daily backup → Cloudflare R2  ·  scripts/restore.sh  กู้จาก R2
deploy/             install-pocketbase.sh · DEPLOY.md · RESTORE.md
```

## รันในเครื่อง (dev)

```bash
# 1) โหลด PocketBase binary (ตาม arch เครื่อง) จาก github.com/pocketbase/pocketbase/releases
# 2) สร้าง superuser
./pocketbase superuser upsert you@example.com yourpassword
# 3) เริ่ม server
./pocketbase serve --http=127.0.0.1:8090
# 4) เปิด http://127.0.0.1:8090/_/  → Settings → Import collections → วางไฟล์ pb_schema.json
# 5) วางไฟล์ frontend (index.html, css/, js/) ไว้ใน pb_public/ ข้าง binary
# 6) เปิด http://127.0.0.1:8090/  ใช้งานได้เลย (config.js ชี้ 127.0.0.1:8090 อยู่แล้ว)
```

> **สำคัญ**: `pb_schema.json` ตั้ง `users` list/view rule เป็น `@request.auth.id != ""` แล้ว
> (PB 0.25 default ให้เห็นแค่ตัวเอง ซึ่งจะทำให้ dropdown เลือกผู้รับว่าง) — email ยังถูกซ่อนอัตโนมัติ

## อนุมัติสมาชิก + ตั้งผู้รับ (admin)

สมัครใหม่ทุกคนได้ `role: user`, `status: pending` เสมอ (บังคับ server-side) — **ต้องรออนุมัติก่อนส่งงาน**
คนหลงเข้ามาสมัครมั่วจะค้างที่ pending ส่งอะไรไม่ได้จนกว่าจะอนุมัติ

**อนุมัติได้ 2 ทาง:**
- **admin ทุกคน** — กดปุ่ม "รออนุมัติ" ใน topbar ของแอป → เห็นรายชื่อ pending → กด "อนุมัติ" (ผู้ใช้กด "ตรวจสอบสถานะอีกครั้ง" เข้าได้เลย ไม่ต้อง login ใหม่)
- **santa** — Admin UI → collection `users` → แก้ `status` เป็น `approved`

**ตั้งเป็นผู้รับงาน (admin)**: เฉพาะ santa ทำใน Admin UI → แก้ `role` เป็น `admin` (admin ตั้ง admin คนอื่นไม่ได้ — กันด้วย pb_hooks)

> **สำคัญ**: การกันสิทธิ์ระดับ field อยู่ใน `pb_hooks/main.pb.js` (กัน user แอบ approve/ตั้ง admin ตัวเอง, จำกัด admin แก้ได้แค่ status). ตอน deploy **ต้องก๊อป pb_hooks ขึ้น VM ด้วย** ไม่งั้นด่านถูก bypass

## Deploy (production)

ดูขั้นตอนเต็มใน [deploy/DEPLOY.md](deploy/DEPLOY.md) — สรุป: Oracle Cloud Always Free VM (ARM, Singapore) →
PocketBase เป็น systemd service ([deploy/install-pocketbase.sh](deploy/install-pocketbase.sh)) → import `pb_schema.json` →
วาง frontend ใน `pb_public/` → **Cloudflare Tunnel** ชี้ `submit.<yourdomain>` (HTTPS อัตโนมัติ, ไม่ต้องแตะ
firewall Oracle) — หรือ Tailscale Funnel ถ้าไม่มีโดเมน → แก้ `js/config.js` `PB_URL` → ตั้ง cron `scripts/backup.sh` → R2

โครงยังฟรี ฿0 (Oracle VM + Cloudflare Tunnel/Tailscale + R2 backup ฟรีหมด) — ค่าใช้จ่ายเดียวคือโดเมนที่คุณมีอยู่แล้ว.
รับมือ VM โดน reclaim: [deploy/RESTORE.md](deploy/RESTORE.md)

## Schema (สรุป)

- **submissions**: topic, description, sender→users, recipient→users, status(queue/review/complete/returned), file
- **submission_replies**: submission→submissions, author→users, message, file
- **submission_queue** (view): `SELECT id, recipient, status, created FROM submissions` — เปิดให้คน login นับคิวได้โดยไม่เห็นเนื้อหา

Rules สำคัญ: เห็น submission ได้เฉพาะ `sender` หรือ `recipient`; เปลี่ยนสถานะได้เฉพาะ `recipient`
