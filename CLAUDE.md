# ระบบส่งงาน (COE Physics) — เวอร์ชันใหม่

สถานะ: **ยังไม่เริ่มเขียนโค้ด** — เอกสารนี้สรุปทุกอย่างที่คุยกันไว้ในเซสชันวางแผน (2026-07-20) เพื่อให้เริ่มงานต่อได้โดยไม่ต้องย้อนถามใหม่

## นี่คือระบบอะไร

รีเมคเว็บ "ส่งงาน" เดิมที่ชื่อ **yipdoc** (เคย deploy อยู่ที่ `yipdoc.vercel.app`) ให้ใหม่ทั้งหมด — เป็นระบบส่งเอกสาร/งานให้ตรวจ ไม่ใช่แชททั่วไป มีแนวคิดหลักคือ:
- ผู้ส่งกรอก **หัวข้อ + รายละเอียด + แนบไฟล์** แล้วเลือก **ผู้รับ (admin คนใดคนหนึ่ง)** จาก dropdown
- ผู้รับตรวจ ตอบกลับได้ (แนบไฟล์/ข้อความ, ตอบได้หลายรอบแบบกระทู้), และเปลี่ยนสถานะงาน
- ทุกคนเห็นได้ว่างานไหน "เสร็จแล้ว" ทันทีจากสถานะ — จุดนี้เป็นจุดเดียวที่คนใช้ชมว่าเว็บเดิมทำได้ดี (แต่ UI เดิมโดยรวม "ดูยาก")

## ทำไมต้องทำใหม่ (บริบทสำคัญ)

เว็บเดิม (yipdoc) มีปัญหาที่ค้นพบระหว่างคุย:
1. **UI ใช้ยาก** — ตารางแบนๆ ไม่มี hierarchy, ไม่มีการจัดกลุ่ม/filter ที่ดี
2. **ไม่กันสิทธิ์การเห็นข้อมูลเลย** — ทดสอบจริงพบว่า login เป็น role `user` ธรรมดา ก็ยังเห็น list เดียวกับ admin ทุกรายการ (น่าจะเป็นบั๊ก ไม่ใช่ตั้งใจ)
3. **ข้อมูลอยู่นอกการควบคุม** — เว็บ deploy บน Vercel (เป็น Next.js), ต่อฐานข้อมูลภายนอกที่ไม่รู้ว่าเป็นบริการอะไร (เดาว่าอาจเป็น Firebase จาก query param `docid` แต่ไม่ยืนยันได้) คนที่สร้างไว้ (**arnon songmoolnak**) ไม่ได้อยู่ในทีมแล้ว **ตอนนี้เข้าถึง/แก้ไข/สำรองข้อมูลเองไม่ได้เลย**

ข้อ 3 คือบทเรียนสำคัญที่สุด — เป็นเหตุผลหลักที่รอบนี้ตัดสินใจ **คุมโครงสร้างพื้นฐานเองทั้งหมด** ไม่ฝากไว้กับบริการที่ไม่ได้เป็นเจ้าของ

## ความสัมพันธ์กับ dashboard เดิม (sut-physics-nas)

**แยกขาดจากกันโดยสิ้นเชิง** ทั้ง repo และ backend:
- ไม่ใช้ PocketBase instance เดียวกับ dashboard (`202.28.43.149:8090`)
- ไม่ share `users` collection — สมัครสมาชิกแยกกันคนละระบบ คนละบัญชี
- ไม่ deploy บน NAS เดิม (`202.28.43.149`) เลย

เหตุผล: กัน downtime ผูกกับ NAS (ถ้า NAS ต้อง reboot/ล่ม ระบบส่งงานจะยังใช้ได้) และไม่อยากผูกกับโครงสร้างเดิมอีกหลังบทเรียนจาก yipdoc — ครั้งนี้อยากให้ทุกอย่างเริ่มจากศูนย์และคุมเองได้เต็มที่ตั้งแต่ต้น

แต่ยังคง**สไตล์การเขียนโค้ดแบบเดียวกับ dashboard**: vanilla HTML/CSS/JS ล้วน ไม่มี build step, ใช้ PocketBase JS SDK ผ่าน CDN `<script>` tag ตรงๆ — จะได้ดูแลง่ายด้วยทักษะเดิม

## การตัดสินใจเรื่อง Backend/Hosting (พร้อมเหตุผลที่เทียบมาแล้ว)

### Backend: ยังใช้ PocketBase
เทียบกับ Firebase/Supabase(managed)/Supabase(self-host)/Appwrite/Parse Server/เขียน backend เองล้วนๆ แล้ว — PocketBase ชนะเพราะ:
- Self-host ได้ 100% (ข้อมูลอยู่ในมือเราเสมอ ไม่ซ้ำรอย yipdoc)
- เบาที่สุดในกลุ่ม self-host (Go binary ตัวเดียว + SQLite ในตัว, ใช้ RAM แค่หลักสิบ MB) — ต่างจาก Supabase/Appwrite self-host ที่ต้องรันหลาย container พร้อมกัน (ต้องการ RAM 2GB+ ถึงจะลื่น)
- มี Auth + File storage + Realtime + Admin UI + **Views** (SQL view — ใช้ทำฟีเจอร์นับคิวได้พอดี) ครบในตัว ไม่ต้องต่อบริการเสริม
- มีประสบการณ์ใช้อยู่แล้วจาก dashboard เดิม เรียนรู้เพิ่มแทบเป็นศูนย์
- เขียนเองล้วนๆ ไม่คุ้ม เพราะค่า VPS เท่ากัน แต่ต้องเขียน auth/upload/realtime เองหมด เสี่ยงบั๊ก/ช่องโหว่มากกว่า

### Hosting: Oracle Cloud Always Free tier
เทียบ VPS หลายเจ้า (Vultr, DigitalOcean, Linode, Hetzner, AWS Lightsail, Oracle Free, ผู้ให้บริการไทย) แล้วเลือก **Oracle Cloud Always Free** เพราะตรงโจทย์ "ฟรี + พื้นที่เยอะ + ลื่น" ที่สุด:
- **ฟรีตลอดไป** ไม่ใช่ free trial
- **พื้นที่เก็บข้อมูลได้ถึง 200GB** (block storage ฟรีในแพ็กเกจ)
- **สเปกเกินความจำเป็นมาก**: ARM Ampere 4 core / 24GB RAM ฟรี — PocketBase ใช้ทรัพยากรน้อยมากอยู่แล้ว จะลื่นแน่นอน
- มี region Singapore (latency ต่ำจากไทย)

**ข้อควรระวังที่รู้ไว้ก่อนเริ่ม**:
- หน้า Console ของ Oracle ซับซ้อนกว่า Vultr/DigitalOcean พอสมควร ตอนตั้งค่าแรกอาจงง
- บางช่วง region Singapore อาจ provision Always-Free VM ไม่ได้ทันที (capacity เต็ม) — ต้องลองสร้างใหม่ซ้ำๆ บางคนต้องรอเป็นวันกว่าจะได้คิว ถ้าติดปัญหานี้ค่อยพิจารณา Vultr/DigitalOcean (Singapore, ~$6/เดือน) เป็นแผนสำรอง

### Deploy: PocketBase serve เอง ไม่ใช้ nginx/Vercel/Web Station แยก
PocketBase มี static file server ในตัว (โฟลเดอร์ `pb_public/` ข้าง binary) — เอาไฟล์ frontend (`index.html`, `css/`, `js/`) ไปวางในนั้น เปิด `http://<VM_IP>:8090/` ก็เจอเว็บตรงๆ จาก process เดียว ไม่ต้องมี web server แยกให้ดูแลเพิ่ม

## Requirements ที่ยืนยันแล้ว (สรุปสั้น)

| หัวข้อ | ข้อสรุป |
|---|---|
| ใครเห็นเรื่องไหนได้ | เฉพาะ `sender` (คนส่ง) กับ `recipient` (admin ที่ถูกเลือก) เท่านั้น — admin คนอื่นไม่เห็น |
| เลือกผู้รับยังไง | Dropdown รายชื่อ admin ตอนส่งงานใหม่ทุกครั้ง (ยังไม่รองรับ reassign ทีหลังใน v1) |
| ใครเป็น admin ได้ | ทุกคนสมัครเป็น role ธรรมดาก่อนเสมอ เจ้าของระบบ (santa) ไปตั้งเองทีหลังผ่าน PocketBase Admin UI |
| ด่านอนุมัติสมาชิก (แก้ decision เดิม 2026-07-20) | **สมัครแล้วต้องรออนุมัติก่อนส่งงานได้** (`status: pending` → `approved`). เดิมตั้งใจให้ใช้ได้ทันที แต่พบช่องโหว่: ใครมีลิงก์ก็สมัครแล้วยิงงานมั่วใส่ admin ได้ → เพิ่มด่านอนุมัติ. **ใครอนุมัติได้: santa (Admin UI) + admin ทุกคน (ปุ่ม "รออนุมัติ" ในแอป)**. บังคับ server-side 3 ชั้น: (1) `users.createRule` กัน client ตั้ง approved/admin ตอนสมัคร, (2) `pb_hooks/main.pb.js` กัน user แอบ approve/promote ตัวเอง + จำกัด admin แก้ได้แค่ status ของคนอื่น, (3) submissions createRule เช็ค `status = approved`. **pb_hooks จำเป็นมาก — ถ้าไม่มี ด่านถูก bypass ได้** |
| Realtime | ใช้ `pb.collection(...).subscribe()` ให้ข้อความ/ตอบกลับใหม่ขึ้นเองไม่ต้อง refresh |
| สถานะงาน | 4 แบบ: รอตรวจ (queue) / กำลังตรวจ (review) / เสร็จสิ้น (complete) / ตีกลับแก้ไข (returned) — เปลี่ยนได้เฉพาะ recipient ของเรื่องนั้น |
| คิวงาน (ฟีเจอร์ใหม่ที่คุยเพิ่ม) | ผู้ส่งเห็นได้ว่า admin แต่ละคนมีงานค้างกี่รายการ (ตอนเลือกผู้รับ) และตัวเองอยู่คิวลำดับที่เท่าไหร่ (ในหน้า detail) — **ไม่เห็นเนื้อหางานของคนอื่น** เห็นแค่จำนวน |

## Mockup UI (อนุมัติแล้ว)

ทำ mockup แบบ interactive ไว้แล้วเป็น Artifact: **https://claude.ai/code/artifact/e9842300-82f2-4ab4-a86a-63880c7247e3**

มี 2 หน้าหลัก:
1. **List view** — ledger-style, stat tiles สรุปจำนวนแต่ละสถานะ, filter คลิกกรองได้, ค้นหาได้
2. **Detail view** — มี "ตรา" (stamp) วงกลมแสดงสถานะมุมขวาบน (ให้ความรู้สึกเอกสารราชการ), เปลี่ยนสถานะจากปุ่ม segmented, ส่วนตอบกลับเป็นกระทู้ (thread) ตอบได้หลายรอบ

**ยังไม่มีในมockup**: หน้า "ส่งงานใหม่" (ปุ่มยังไม่ผูก action) — ต้องสร้างเพิ่มตอน implement จริง พร้อม dropdown เลือก recipient + เลขงานค้าง

โค้ดต้นทางของ mockup อยู่ที่เครื่อง dev เดิม (`/tmp/.../scratchpad/submit-mockup.html` ของเซสชันที่ทำ) — ถ้าไฟล์นั้นหายไปแล้ว ใช้ลิงก์ Artifact ข้างบนดูโครงสร้าง/สไตล์แทนได้ (เปิดดู view-source ได้เพราะเป็น self-contained HTML)

## Schema ที่ต้องสร้างบน PocketBase instance ใหม่

### `submissions`
| field | type |
|---|---|
| topic | text, required |
| description | text |
| sender | relation → users, single, required |
| recipient | relation → users, single, required |
| status | select: `queue` / `review` / `complete` / `returned`, default `queue` |
| file | file, single |

Rules:
- List/View: `sender = @request.auth.id || recipient = @request.auth.id`
- Create: `@request.auth.id != "" && @request.auth.status = "approved" && sender = @request.auth.id`
- Update: `recipient = @request.auth.id`
- Delete: `sender = @request.auth.id || recipient = @request.auth.id`

Dropdown รายชื่อ admin ตอนส่ง: `pb.collection('users').getFullList({filter: 'role = "admin"'})`
> **แก้จากแผนเดิม**: PB 0.25 default users list/view rule = `id = @request.auth.id` (เห็นแค่ตัวเอง ไม่ใช่ "เปิดให้ทุกคน" อย่างที่เข้าใจตอนวางแผน) → ต้องตั้ง list/view rule = `@request.auth.id != ""` ไม่งั้น dropdown ว่าง. และเพิ่ม `createRule = @request.body.role = "user" && @request.body.status = "pending"` เพื่อบังคับด่านอนุมัติ + กัน client ตั้ง role/status เอง. ทั้งหมดอยู่ใน `pb_schema.json` แล้ว (อย่ายึด default)

### `submission_queue` — PocketBase **View** collection (ใหม่ สำหรับฟีเจอร์คิว)
ปัญหาที่แก้: PocketBase rule เป็น record-level ไม่ใช่ field-level ถ้าให้คนอื่นเห็นแถว submission ที่ตัวเองไม่เกี่ยวจะเห็นทุก field (topic/description/ไฟล์) ไปด้วย เลยต้องแยกเป็น View ที่ SELECT เฉพาะคอลัมน์ไม่อ่อนไหว:

```sql
SELECT id, recipient, status, created FROM submissions
```

Rule: List/View = `@request.auth.id != ""` (อ่านได้ทุกคนที่ login เพราะไม่มีข้อมูลอ่อนไหว)

ใช้ 2 จุด:
1. ตอนเลือก recipient ในฟอร์มส่งงานใหม่ — นับแถวที่ `recipient = <admin นั้น> && status ใน (queue, review)`
2. หน้า detail/list ของผู้ส่ง — นับแถว `recipient` เดียวกัน + `status` ใน (queue, review) + `created` น้อยกว่าของเรา → "อยู่ก่อนหน้าอีก N รายการ"

### `submission_replies`
| field | type |
|---|---|
| submission | relation → submissions, single, required |
| author | relation → users, single, required |
| message | text |
| file | file, single |

Rules:
- List/View: `submission.sender = @request.auth.id || submission.recipient = @request.auth.id`
- Create: `@request.auth.id != "" && @request.auth.status = "approved" && author = @request.auth.id && (submission.sender = @request.auth.id || submission.recipient = @request.auth.id)`
- Update: ล็อค (Superusers only)
- Delete: `author = @request.auth.id`

## โครงสร้าง repo ที่วางแผนไว้

```
index.html       — หน้าเดียว: login / signup + list view + detail view + ฟอร์มส่งงานใหม่ (ยังไม่มีใน mockup)
css/
  variables.css   — โทนสีจาก mockup (indigo/amber/teal/green/red)
  base.css        — ปรับจาก dashboard
  submit.css      — สไตล์ list/detail/thread/composer จาก mockup
js/
  config.js       — PB_URL ชี้ instance ใหม่บน Oracle VM (คนละค่ากับ dashboard)
  state.js        — global `pb`, currentUser, filter state
  auth.js         — login/signup/logout + หน้า "รออนุมัติ" (สมัครแล้ว status=pending ต้องรอ santa อนุมัติก่อนใช้งาน; มีปุ่ม "ตรวจสอบสถานะอีกครั้ง" ที่ authRefresh)
  submissions.js  — CRUD กับ submissions/submission_replies + realtime subscribe
  app.js          — bootstrap (DOMContentLoaded)
```

อ้างอิงโค้ดจาก dashboard เดิม (`sut-physics-nas` repo, path เดิม `/home/santa/Workspace/sut-physics-nas`) ได้ที่:
- `js/documents.js` — pattern อัปโหลดไฟล์ผ่าน SDK ตรงๆ (`pb.collection(...).create(formData)`) ใช้ได้เลยเพราะ field เป็น single-file เหมือนกัน (ไม่ต้องใช้ raw-fetch workaround แบบ `procurement.js` ซึ่งมีไว้แก้ปัญหาเฉพาะ multi-file field)
- `js/auth.js` — pattern login/signup/logout, การแปลง username→email ปลอมสำหรับ PocketBase auth

## ขั้นตอน Deploy (เมื่อพร้อม implement จริง)

1. สมัคร/provision Oracle Cloud Always Free VM (Ampere ARM, region Singapore) — ต้องทำเองผ่านหน้าเว็บ Oracle
2. ติดตั้ง PocketBase บน VM (โหลด binary ARM64 จาก GitHub release ของ `pocketbase/pocketbase`) ตั้งเป็น systemd service ให้ auto-restart ตอนเครื่อง reboot
3. สร้าง 3 collections (`submissions`, `submission_replies`) + 1 view (`submission_queue`) ตาม schema ข้างบน
4. Build ไฟล์ frontend แล้ววางใน `pb_public/` ข้าง binary — เปิด `http://<VM_IP>:8090/` เจอเว็บตรงๆ
5. เปิด firewall/security list ของ Oracle Cloud ให้ port 8090 (หรือ 80/443 ถ้าจะตั้ง reverse proxy + TLS ทีหลัง) เข้าถึงจากนอกได้
6. เก็บ credential (VM IP, SSH key, PocketBase superuser password) ให้ปลอดภัย — อย่าให้หลุดแบบที่เคยเกิดกับ dashboard เดิม (note.md หลุด ต้อง rotate รหัสทั้งหมดมาแล้วครั้งหนึ่ง)

## Verification เมื่อ implement เสร็จ

1. Login ด้วย account ทดสอบอย่างน้อย 2 คน (sender ปกติ + admin ที่ตั้งเอง)
2. ส่งเอกสารเลือก recipient — เช็คว่า admin ที่ถูกเลือกเห็น แต่ admin คนอื่นไม่เห็น
3. ตอบกลับในกระทู้ได้, เปลี่ยนสถานะได้ (เฉพาะ recipient)
4. เปิด 2 browser tab พร้อมกัน เช็ค realtime ไม่ต้อง refresh
5. เช็คเลขคิว/ตำแหน่งคิวถูกต้องเมื่อมีหลายรายการค้างอยู่ที่ admin คนเดียวกัน
6. ทดสอบผ่าน `http://<VM_IP>:8090/` จริงจากอินเทอร์เน็ตภายนอก (ไม่ใช่แค่ localhost บนเครื่อง dev)

## สิ่งที่ยังไม่ตัดสินใจ / ทำทีหลังได้

- Reassign recipient หลังส่งไปแล้ว (v1 ยังไม่รองรับ)
- TLS/HTTPS (v1 ใช้ http ตรงๆ ผ่าน port 8090 ก่อนได้ ค่อยตั้ง reverse proxy ทีหลังถ้าต้องการ)
- ชื่อโดเมนของตัวเอง (v1 ใช้ IP ตรงๆ ได้ก่อน)
