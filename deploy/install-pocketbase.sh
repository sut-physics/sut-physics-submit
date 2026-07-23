#!/usr/bin/env bash
# ============================================================
# ติดตั้ง PocketBase เป็น systemd service บน VM (Ubuntu/Debian)
# รันบน VM ในฐานะ root:  sudo bash install-pocketbase.sh
#
# - bind 127.0.0.1:8090 เท่านั้น (ไม่เปิด port ออกเน็ต — เข้าผ่าน Cloudflare Tunnel)
# - auto-restart ตอนเครื่อง reboot / process ล่ม
# ============================================================
set -euo pipefail

PB_VERSION="0.25.2"
PB_DIR="/opt/pocketbase"
PB_USER="pocketbase"

# ตรวจ arch (Oracle Ampere = arm64; fallback amd64)
case "$(uname -m)" in
  aarch64|arm64) ARCH="arm64" ;;
  x86_64)        ARCH="amd64" ;;
  *) echo "arch ไม่รองรับ: $(uname -m)"; exit 1 ;;
esac
echo "==> arch = $ARCH, PocketBase $PB_VERSION"

# dependencies
apt-get update -y >/dev/null
apt-get install -y unzip curl >/dev/null

# user + dir
id -u "$PB_USER" >/dev/null 2>&1 || useradd --system --home "$PB_DIR" --shell /usr/sbin/nologin "$PB_USER"
mkdir -p "$PB_DIR/pb_public" "$PB_DIR/pb_data" "$PB_DIR/pb_hooks"

# download binary
ZIP="pocketbase_${PB_VERSION}_linux_${ARCH}.zip"
URL="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${ZIP}"
echo "==> ดาวน์โหลด $URL"
curl -sL -o "/tmp/$ZIP" "$URL"
unzip -o -q "/tmp/$ZIP" -d "$PB_DIR"
chmod +x "$PB_DIR/pocketbase"
rm -f "/tmp/$ZIP"

# systemd unit
cat > /etc/systemd/system/pocketbase.service <<EOF
[Unit]
Description=PocketBase (ระบบส่งงาน COE Physics)
After=network.target

[Service]
Type=simple
User=$PB_USER
Group=$PB_USER
LimitNOFILE=4096
ExecStart=$PB_DIR/pocketbase serve --http=127.0.0.1:8090
WorkingDirectory=$PB_DIR
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

chown -R "$PB_USER:$PB_USER" "$PB_DIR"

systemctl daemon-reload
systemctl enable pocketbase >/dev/null 2>&1
systemctl restart pocketbase
sleep 2

if curl -sf --max-time 5 http://127.0.0.1:8090/api/health >/dev/null; then
  echo "==> PocketBase รันแล้ว (127.0.0.1:8090) ✓"
else
  echo "==> health check ไม่ผ่าน — ดู: journalctl -u pocketbase -n 50"; exit 1
fi

echo ""
echo "ขั้นต่อไป (รันบน VM):"
echo "  1) สร้าง superuser:"
echo "       sudo -u $PB_USER $PB_DIR/pocketbase superuser upsert YOU@EXAMPLE.COM 'STRONG_PASSWORD' --dir=$PB_DIR/pb_data"
echo "  2) วางไฟล์ frontend (index.html, css/, js/) ลง $PB_DIR/pb_public/"
echo "     + ก๊อป pb_hooks/main.pb.js ลง $PB_DIR/pb_hooks/ (จำเป็น! คือ guard กัน self-approve/self-promote)"
echo "     แล้ว restart: sudo systemctl restart pocketbase"
echo "  3) import pb_schema.json ผ่าน Admin UI (เข้าผ่าน SSH tunnel — ดู DEPLOY.md ขั้น 3)"
echo "  4) ตั้ง Cloudflare Tunnel (DEPLOY.md ขั้น 4)"
