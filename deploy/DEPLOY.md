# Deploy runbook — Oracle Free + Cloudflare Tunnel (โดเมนคุณ) + R2 backup

HTTPS มี 2 แบบให้เลือกในขั้น 4: **A) Cloudflare Tunnel + โดเมนของคุณ** (แนะนำ) หรือ **B) Tailscale Funnel** (ไม่ต้องมีโดเมน)

ทำครั้งเดียวจบ แบ่งเป็นส่วน **[คุณ]** = ทำผ่านหน้าเว็บเอง / **[VM]** = รันคำสั่งบนเครื่อง

---

## ขั้น 0 — [คุณ] Provision Oracle Cloud Always Free VM

1. สมัคร Oracle Cloud (cloud.oracle.com) — เลือก **home region = Singapore** ตอนสมัคร (แก้ทีหลังไม่ได้)
2. **แนะนำ: Upgrade เป็น Pay-As-You-Go** (Billing → Upgrade) — ยังอยู่ใน Always-Free limit = จ่าย ฿0 แต่กัน idle-reclaim/ban. ตั้ง **Budget alert** ที่ $1 กันเผลอ
3. สร้าง Instance:
   - Shape: **Ampere A1 (ARM)** — ใส่ 1 OCPU / 6GB ก็เหลือเฟือ (Always-Free ให้ถึง 4 OCPU/24GB)
   - Image: **Ubuntu 22.04**
   - บันทึก **SSH private key** ที่มันให้ดาวน์โหลด + จด **Public IP**
   - (ถ้า "out of capacity" ให้ลองสร้างซ้ำ/สลับ Availability Domain — ปกติได้ในไม่กี่รอบ)
4. ทดสอบ SSH: `ssh -i <key> ubuntu@<PUBLIC_IP>`

> ไม่ต้องแตะ Security List / เปิด port 8090 — เพราะเข้าผ่าน Cloudflare Tunnel (VM ต่อออกอย่างเดียว)

---

## ขั้น 1 — [VM] ติดตั้ง PocketBase

```bash
# คัดลอกสคริปต์ขึ้น VM แล้วรัน (หรือ git clone repo นี้บน VM)
scp -i <key> deploy/install-pocketbase.sh ubuntu@<IP>:/tmp/
ssh -i <key> ubuntu@<IP> 'sudo bash /tmp/install-pocketbase.sh'
```
สคริปต์จะ: โหลด binary (ตรวจ arch เอง) → ตั้ง systemd (`Restart=always`, bind `127.0.0.1:8090`) → start

จากนั้นสร้าง superuser:
```bash
ssh -i <key> ubuntu@<IP>
sudo -u pocketbase /opt/pocketbase/pocketbase superuser upsert YOU@EXAMPLE.COM 'STRONG_PASS' --dir=/opt/pocketbase/pb_data
```

---

## ขั้น 2 — [VM] วาง frontend + pb_hooks (security guard)

```bash
# จากเครื่อง dev — อัปโหลดไฟล์หน้าเว็บลง pb_public
scp -i <key> -r index.html css js ubuntu@<IP>:/tmp/site/
ssh -i <key> ubuntu@<IP> 'sudo cp -r /tmp/site/* /opt/pocketbase/pb_public/ && sudo chown -R pocketbase:pocketbase /opt/pocketbase/pb_public'

# *** จำเป็น *** ก๊อป pb_hooks (guard กัน self-approve / self-promote / admin ยึดบัญชี)
scp -i <key> pb_hooks/main.pb.js ubuntu@<IP>:/tmp/main.pb.js
ssh -i <key> ubuntu@<IP> 'sudo cp /tmp/main.pb.js /opt/pocketbase/pb_hooks/ && sudo chown -R pocketbase:pocketbase /opt/pocketbase/pb_hooks && sudo systemctl restart pocketbase'
```
> ถ้าไม่วาง `pb_hooks/main.pb.js` = ด่านอนุมัติถูก bypass ได้ (user แอบตั้ง `status:approved` / `role:admin` ให้ตัวเองผ่าน API) — **ห้ามข้าม**

---

## ขั้น 3 — [คุณ] Import schema (ผ่าน SSH tunnel)

Admin UI ผูกกับ `127.0.0.1:8090` (ไม่เปิด public) → เข้าผ่าน SSH tunnel ชั่วคราว:
```bash
ssh -i <key> -L 8090:127.0.0.1:8090 ubuntu@<IP>
# เปิดเบราว์เซอร์: http://127.0.0.1:8090/_/  → login superuser
# Settings → Import collections → วางเนื้อหาไฟล์ pb_schema.json → Review → Confirm
```

---

## ขั้น 4 — [VM] เปิดเว็บออกเน็ตแบบ HTTPS (เลือก A หรือ B)

ทั้งสองแบบ VM **ไม่ต้องเปิด port ออกเน็ต** (ต่อออกอย่างเดียว = ปลอดภัย ไม่ต้องแตะ firewall Oracle)

### แบบ A — Cloudflare Tunnel + โดเมนของคุณ (แนะนำ เพราะมีโดเมนแล้ว)

ครั้งเดียว: เพิ่มโดเมนเข้า Cloudflare (dashboard → Add site → ย้าย nameserver มาที่ Cloudflare, ฟรี)

```bash
# บน VM
ARCH=$(uname -m | grep -q aarch64 && echo arm64 || echo amd64)
curl -L -o cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$ARCH.deb"
sudo dpkg -i cloudflared.deb

cloudflared tunnel login                         # authorize โดเมนใน browser
cloudflared tunnel create submit                 # ได้ <TUNNEL_ID> + credentials json
cloudflared tunnel route dns submit submit.<yourdomain>   # ผูก subdomain
```
สร้าง `/etc/cloudflared/config.yml`:
```yaml
tunnel: submit
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: submit.<yourdomain>
    service: http://127.0.0.1:8090
  - service: http_status:404
```
ติดตั้งเป็น service (auto-start ข้าม reboot):
```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```
เปิด `https://submit.<yourdomain>/` — เจอเว็บผ่าน HTTPS (Cloudflare ออก TLS ให้อัตโนมัติ)

### แบบ B — Tailscale Funnel (ถ้าไม่อยากใช้โดเมน/Cloudflare)

ได้ URL `https://<ชื่อเครื่อง>.<tailnet>.ts.net` โดยไม่ต้องมีโดเมน
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up                    # authorize ใน browser
sudo tailscale funnel --bg 8090      # เปิด public เข้า 127.0.0.1:8090
sudo tailscale funnel status         # ดู URL ที่ได้
```
(ครั้งแรกต้องเปิด HTTPS Certificates + Funnel ใน Tailscale admin console ตามลิงก์ที่ CLI พิมพ์ให้)

---

## ขั้น 5 — [VM] ตั้ง PB_URL ให้ตรง tunnel + backup → R2

1. แก้ `js/config.js` → `PB_URL = 'https://submit.<yourdomain>'` (หรือ URL ที่ได้จากขั้น 4) แล้วอัปโหลด `pb_public/js/config.js` ใหม่
   (frontend served จาก origin เดียวกับ tunnel — แนะนำตั้ง `PB_URL = location.origin` จะได้ใช้ค่าเดียวทั้ง local/prod ไม่ต้องแก้ทุกครั้ง)
2. Backup: ทำตามหัวไฟล์ [../scripts/backup.sh](../scripts/backup.sh) — `rclone config` (remote R2), สร้าง `/etc/submit-backup.env`, ใส่ cron:
   ```bash
   sudo crontab -e
   # 0 3 * * *  /opt/pocketbase/scripts/backup.sh >> /var/log/submit-backup.log 2>&1
   ```
   backup แยก 2 ส่วนเพื่อไม่ให้ตันโควตา R2 ฟรีเมื่อไฟล์แนบเยอะขึ้น:
   - **ฐานข้อมูล** — online backup (consistent แม้ DB ถูกเขียนอยู่, รวม WAL) → tar.gz เล็กๆ เก็บย้อนหลัง 30 วัน
   - **ไฟล์แนบ** — `rclone copy` แบบ incremental ส่งเฉพาะไฟล์ใหม่ ไม่ส่งซ้ำ ไม่ลบของเก่า

   ต้องมี `python3` บนเครื่อง (Ubuntu มีมาให้อยู่แล้ว) — ไม่ต้องลง sqlite3 เพิ่ม

> **โดน reclaim / disk พังทำยังไง**: ดู [RESTORE.md](RESTORE.md) — ดึง backup ล่าสุดจาก R2 มากู้ด้วย
> `sudo bash scripts/restore.sh` (ทดสอบแล้วกู้ข้อมูล+ไฟล์อัปโหลดกลับครบ)

---

## ขั้น 6 — Verification (ตามแผน ข้อ 6-7)

- [ ] เปิด `https://submit.<yourdomain>/` (URL จากขั้น 4) จากเน็ตภายนอก (มือถือ 4G ไม่ใช่ WiFi เดียวกัน) — ใช้งานได้
- [ ] ยืนยัน `http://<IP>:8090` เข้าจากภายนอก **ไม่ได้** (port ไม่เปิด — ดีแล้ว)
- [ ] สมัคร 2 บัญชี, ตั้ง 1 เป็น admin ผ่าน Admin UI, ส่งงาน–ตอบกลับ–เปลี่ยนสถานะ–realtime ครบ
- [ ] **ทดสอบ restore**: ดึง backup ล่าสุดจาก R2 → กางใส่ PocketBase เปล่า → ข้อมูลครบ (พิสูจน์ว่ากู้คืนได้จริง)

---

## เก็บ credential ให้ปลอดภัย (อย่าให้หลุดแบบ note.md เดิม)
VM IP · SSH key · PB superuser pass · Cloudflare token · R2 key — เก็บใน password manager **อย่า commit ลง repo**
