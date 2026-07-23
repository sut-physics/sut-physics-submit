# คู่มือดูแลระบบ (Operations)

ไฟล์นี้เก็บ **วิธีทำ + ปัญหาที่เคยเจอ** — ไม่มีค่าจริง/รหัสอยู่ในนี้เลย
ค่าจริงทั้งหมดอยู่ใน `.env` (ไม่ขึ้น git · ดูต้นแบบที่ `.env.example`)

```bash
set -a; . ./.env; set +a     # โหลดค่าเข้า shell ก่อนใช้คำสั่งข้างล่าง
```

---

## 1. เข้าเครื่อง VM

```bash
ssh -i "$VM_SSH_KEY" "$VM_USER@$VM_HOST"
```
- key ต้อง `chmod 600` ไม่งั้น ssh ปฏิเสธ
- เครื่องเป็น AMD E2.1.Micro (x86_64) · RAM 956MB + swap 2GB · disk 43GB · Ubuntu 22.04
- swap อยู่ที่ `/swapfile` (ใส่ `/etc/fstab` + `vm.swappiness=10` แล้ว) — RAM น้อย ถ้าไม่มี swap PocketBase ตายตอน build index
- บัญชี Oracle เป็น **Free Trial** (อัป PAYG ไม่ผ่าน บัตรโดนปฏิเสธ) แต่ instance เป็น Always-Free-eligible = ฿0

## 2. PocketBase

ติดตั้งที่ `/opt/pocketbase/` · รันเป็น systemd service ชื่อ `pocketbase` (user `pocketbase`, bind `127.0.0.1:8090`)

```bash
sudo systemctl status pocketbase
sudo systemctl restart pocketbase      # ต้อง restart ทุกครั้งที่แก้ pb_hooks/
sudo journalctl -u pocketbase -n 50
```

**เปลี่ยนรหัส superuser**
```bash
sudo -u pocketbase /opt/pocketbase/pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" 'NEWPASS' --dir=/opt/pocketbase/pb_data
```

**เข้า Admin UI ตอน tunnel ล่ม** (ผ่าน SSH tunnel)
```bash
ssh -i "$VM_SSH_KEY" -L 8090:127.0.0.1:8090 "$VM_USER@$VM_HOST"
# แล้วเปิด http://127.0.0.1:8090/_/
```

**อัป frontend + hooks ขึ้นเครื่อง** (ตอนยังไม่ได้ใช้ GitHub Actions)
```bash
rsync -az --delete -e "ssh -i $VM_SSH_KEY" index.html css js "$VM_USER@$VM_HOST:/tmp/site/"
scp -i "$VM_SSH_KEY" pb_hooks/main.pb.js "$VM_USER@$VM_HOST:/tmp/main.pb.js"
ssh -i "$VM_SSH_KEY" "$VM_USER@$VM_HOST" 'sudo rsync -a --delete /tmp/site/ /opt/pocketbase/pb_public/ \
  && sudo cp /tmp/main.pb.js /opt/pocketbase/pb_hooks/main.pb.js \
  && sudo chown -R pocketbase:pocketbase /opt/pocketbase/pb_public /opt/pocketbase/pb_hooks \
  && sudo systemctl restart pocketbase'
```
> อย่าลืมขยับ `?v=` ท้าย css/js ใน `index.html` ไม่งั้นเบราว์เซอร์ใช้ของเก่า

## 3. HTTPS — Tailscale Funnel

VM **ไม่ได้เปิด port ออกเน็ตเลย** ต่อออกอย่างเดียว → firewall ของ Oracle ไม่ต้องแตะ
TLS เป็น Let's Encrypt ต่ออายุอัตโนมัติ · config persist แล้ว รอด reboot

```bash
sudo tailscale funnel status
sudo tailscale funnel --bg 8090          # เปิดใหม่
sudo tailscale funnel --https=443 off    # ปิด
```

`cloudflared` ติดตั้งค้างไว้บนเครื่อง (v2026.7.2) แต่ **ไม่ได้ใช้** — ถ้าจะย้ายไปโดเมนตัวเองทำตาม DEPLOY.md ขั้น 4A

> ⚠️ **negative DNS cache**: ถ้าใครเปิด URL ก่อน Funnel ถูกเปิด resolver จะจำ NXDOMAIN ไว้ ~5-10 นาที
> (เจอกับ DNS มหาวิทยาลัย `10.10.100.21/.22`) แก้: รอ แล้ว `resolvectl flush-caches` +
> ล้าง DNS ของ Chrome ที่ `chrome://net-internals/#dns` — **ไม่ได้เกิดจากการบล็อก**

## 4. Backup

**รูปแบบ pull**: VM สร้าง snapshot ทิ้งไว้ → NAS มาดึงเอง
VM ไม่มี credential ของ NAS เลย → VM โดนยึดก็ลบ backup ที่ NAS ไม่ได้

**ทุกอย่างถูกเข้ารหัสก่อนวางทิ้งไว้** (age) — รายละเอียด + วิธีกู้ ดู `RESTORE.md`

### ฝั่ง VM
- `scripts/snapshot-local.sh` → `/opt/pocketbase/scripts/` · cron **ตี 3 ทุกคืน** (timezone เครื่อง = Asia/Bangkok)
- log: `/var/log/submit-snapshot.log`
- ผลลัพธ์: `/var/backups/submit/db/*.tar.gz.age` (เก็บ 30 วัน) + `/var/backups/submit/storage-enc/*.age`
- กุญแจล็อก (public) อยู่ที่ `/opt/pocketbase/scripts/backup-recipient.pub`
- bind mount read-only ให้ NAS ดึง (อยู่ใน `/etc/fstab` → รอด reboot):
  ```
  /var/backups/submit/db          → /srv/submit-backup/db
  /var/backups/submit/storage-enc → /srv/submit-backup/storage
  ```
- กุญแจของ NAS ใน `~ubuntu/.ssh/authorized_keys` ล็อกด้วย
  `restrict,command="/usr/bin/rrsync -ro /srv/submit-backup"`
  → ทดสอบแล้ว: อ่าน backup ได้ · รันคำสั่งอื่นไม่ได้ · เขียนกลับไม่ได้ · ออกนอกโฟลเดอร์ไม่ได้

### ⚠️ NAS ต่อ port 22 ไม่ได้ → ใช้ port 443
เครือข่ายที่ NAS อยู่ **บล็อก SSH ขาออก** → `No route to host` ทุกครั้ง
(เครื่อง dev อยู่คนละวง ต่อ 22 ได้ปกติ — **อย่าเอาไปสรุปว่า NAS ก็ต่อได้**)

แก้โดย:
- **Oracle security list** (`Default Security List for submit-vcn`): เพิ่ม ingress TCP **443 จาก IP ของ NAS เท่านั้น**
- **บน VM**: iptables redirect `443 → 22` เฉพาะ `ens3` (ไม่ยุ่ง `tailscale0` ที่ใช้ 443 อยู่)
  persist ด้วย systemd unit `ssh443-redirect.service`
  ```bash
  sudo iptables -t nat -S PREROUTING
  sudo systemctl status ssh443-redirect
  ```

### ฝั่ง NAS (Synology DSM)
- Shared Folder `submit-backups` (volume2, เปิด data checksum)
- ไฟล์ในนั้น: `nas-pull.sh` · `submit-nas-pull` (private key) · `known_hosts` · `pull.log`
- Task Scheduler: task `backup for submit system` · **User = `root`** · Daily **04:00**
  · คำสั่ง `sh /volume2/submit-backups/nas-pull.sh`

**4 ด่านที่เจอกว่าจะผ่าน — จดไว้กันลืมตอนตั้งเครื่องใหม่**
1. DSM Task Scheduler ไม่ default เป็น root → ต้องเลือก `root` เอง ไม่งั้นเขียนไฟล์ไม่ได้
2. เครือข่ายของ NAS บล็อก SSH ขาออก (port 22) → ต้องใช้ 443 (ดูข้างบน)
3. Task Scheduler ไม่ตั้ง `HOME` → ssh หา `~/.ssh/known_hosts` ไม่เจอ → ปักหมุดไฟล์ข้างสคริปต์แทน
4. ssh ของ DSM ขอ host key แบบ **ECDSA** → `known_hosts` ต้องมีครบ 3 ชนิด (ed25519/ecdsa/rsa)
   ไม่งั้นขึ้น "REMOTE HOST IDENTIFICATION HAS CHANGED" ทั้งที่ไม่ได้โดน MITM
   ```bash
   ssh -i "$VM_SSH_KEY" "$VM_USER@$VM_HOST" \
     'cat /etc/ssh/ssh_host_{ed25519,ecdsa,rsa}_key.pub' \
     | awk -v h="[$VM_HOST]:$NAS_SSH_PORT" 'NF{print h" "$1" "$2}'
   ```

**private key ของ NAS อยู่บน NAS ที่เดียว ไม่มีสำเนาสำรอง** — ถ้าหายต้องสร้างคู่ใหม่
```bash
ssh-keygen -t ed25519 -N '' -C submit-nas-pull -f ~/.ssh/submit-nas-pull
# เอา .pub ต่อท้าย authorized_keys บน VM (ต้องมี restrict + rrsync ครบ):
#   restrict,command="/usr/bin/rrsync -ro /srv/submit-backup" ssh-ed25519 AAAA... submit-nas-pull
# แล้วอัป private key ขึ้น $NAS_SHARE ผ่าน File Station + ลบจากเครื่อง dev ด้วย shred
```

### วิธี debug ฝั่ง NAS จากข้างนอก (มองไม่เห็นเครื่อง NAS)
NAS เสิร์ฟเว็บที่ `$NAS_WEB` = `/volume2/coe-dashboard/` → ให้ task เขียน log ลงที่นั่นแล้วอ่านผ่านเว็บ
**ใช้เสร็จลบทิ้งทุกครั้ง** เพราะโฟลเดอร์นั้นเปิดสาธารณะ
```
sh -x /volume2/submit-backups/nas-pull.sh > /volume2/coe-dashboard/pull-debug.txt 2>&1
cat /volume2/submit-backups/pull.log >> /volume2/coe-dashboard/pull-debug.txt
```

## 5. ถ้าสงสัยว่ารหัสหลุด — rotate ตามลำดับนี้
1. PocketBase superuser password
2. SSH key ของ VM (สร้างใหม่ + แทนที่ใน `authorized_keys` + อัป GitHub Secret)
3. key ของ NAS (`submit-nas-pull`)
4. Tailscale auth key / token
5. GitHub Actions secrets
6. **กุญแจ age**: สร้างคู่ใหม่ → เปลี่ยน `backup-recipient.pub` บน VM → backup รอบใหม่จะใช้กุญแจใหม่
   **แต่ backup เก่ายังต้องใช้กุญแจเก่าถอด → อย่าทิ้งกุญแจเก่าจนกว่าจะเลิกเก็บ backup ชุดนั้น**
