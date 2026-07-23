# 🔐 Credentials & สิ่งที่ต้องจำ — TEMPLATE

> **นี่คือ template — ห้ามใส่รหัสจริงในไฟล์นี้** (`note.example.md` ถูก commit ขึ้น git)
>
> วิธีใช้: `cp note.example.md note.md` แล้วกรอกรหัสจริงใน `note.md`
> (`note.md` ถูก `.gitignore` ไว้แล้ว → push ขึ้น GitHub ไม่ได้ กันหลุดแบบ dashboard เดิม)
>
> **ดีที่สุด**: เก็บรหัสจริงใน **password manager** (Bitwarden/1Password/KeePass) — ไฟล์นี้ใช้แค่เป็น
> "สารบัญ" ว่ามีอะไรบ้าง + อยู่ที่ entry ไหน. อย่าเก็บรหัสจริงไว้ที่เดียวบน VM หรือในไฟล์เดียว.

---

## 1. Oracle Cloud VM
- Public IP: `<IP>`
- SSH user: `ubuntu`
- SSH private key: `<path ไฟล์ key / หรือ entry ใน password manager>`  ← **ไฟล์นี้คือกุญแจเข้าเครื่อง อย่าหาย/อย่าหลุด**
- Oracle account login: `<เก็บใน password manager>`

## 2. PocketBase superuser (santa — เข้า Admin UI `/_/`)
- Email: `<email>`
- Password: `<เก็บใน password manager>`
- รีเซ็ตได้ด้วย: `sudo -u pocketbase /opt/pocketbase/pocketbase superuser upsert EMAIL NEWPASS --dir=/opt/pocketbase/pb_data`

## 3. HTTPS tunnel
### ถ้าใช้ Cloudflare Tunnel (มีโดเมน)
- Cloudflare account login: `<password manager>`
- Domain: `submit.<yourdomain>`
- Domain registrar login: `<password manager>`
- Tunnel credentials file (บน VM): `/root/.cloudflared/<TUNNEL_ID>.json`  ← สำรองไว้ด้วย
### ถ้าใช้ Tailscale Funnel (ไม่มีโดเมน)
- Tailscale account login: `<password manager>`
- URL ที่ได้: `https://<machine>.<tailnet>.ts.net`

## 4. Backup → Cloudflare R2
- R2 Access Key ID: `<password manager>`
- R2 Secret Access Key: `<password manager>`
- R2 endpoint: `https://<accountid>.r2.cloudflarestorage.com`
- Bucket name: `<bucket>`
- ค่าเหล่านี้ไปอยู่ใน `/etc/submit-backup.env` บน VM (chmod 600) — ดู scripts/backup.sh

## 5. GitHub (repo + auto-deploy)
- Repo URL: `<url>`
- Actions Secrets ที่ตั้งไว้: `VM_HOST`, `VM_USER`, `VM_SSH_KEY` (ตั้งใน repo Settings → Secrets)

---

## ✅ Checklist ตอน deploy จริง (ทำแล้วติ๊ก)
- [ ] จด Public IP + เซฟ SSH key (นอก VM)
- [ ] ตั้ง PocketBase superuser + จดรหัส
- [ ] ตั้ง tunnel (Cloudflare/Tailscale) — จด URL + สำรอง credentials file
- [ ] ตั้ง R2 + `/etc/submit-backup.env` + ทดสอบ backup ขึ้นจริง
- [ ] ก๊อป `pb_hooks/` ขึ้น VM + restart (ไม่งั้นด่านอนุมัติ bypass ได้)
- [ ] ตั้ง GitHub Secrets
- [ ] **ย้ายรหัสจริงทั้งหมดเข้า password manager แล้วลบออกจากที่อื่น**

## 🔁 ถ้าสงสัยว่ารหัสหลุด (เหมือน note.md เดิม)
rotate ทันที: PB superuser pass → SSH key → R2 keys → Cloudflare/Tailscale token → GitHub secrets
