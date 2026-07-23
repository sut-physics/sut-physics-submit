#!/usr/bin/env bash
# ============================================================
# deploy.sh — สั่งครั้งเดียวจบ: หน้าเว็บ + hooks + schema + สคริปต์ backup + push ขึ้น GitHub
#
# ใช้:
#   ./deploy.sh                      ทำทุกอย่าง (ไม่ push ถ้ายังไม่ได้ commit)
#   ./deploy.sh -m "ข้อความ commit"   commit ทุกอย่างที่แก้ + push + deploy
#   ./deploy.sh frontend             เฉพาะหน้าเว็บ
#   ./deploy.sh hooks schema         เลือกทำเฉพาะบางอย่าง (คั่นด้วยเว้นวรรค)
#   ./deploy.sh --check              ไม่ deploy อะไร แค่ตรวจว่าของบนเครื่องตรงกับ repo ไหม
#
# ขั้นตอนที่มีให้เลือก: git · frontend · hooks · schema · backup · verify
#
# ค่าทั้งหมดอ่านจาก .env (ดู .env.example) — ไม่มีค่าจริงอยู่ในไฟล์นี้
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
step() { echo; echo "${C_DIM}────────────────────────────────────────${C_OFF}"; echo "▶ $*"; }
ok()   { echo "  ${C_OK}✓${C_OFF} $*"; }
warn() { echo "  ${C_WARN}!${C_OFF} $*"; }
die()  { echo "  ${C_ERR}✗ $*${C_OFF}" >&2; exit 1; }

# ---------- อ่าน .env ----------
[ -f .env ] || die "ไม่พบ .env — ก๊อปจาก .env.example แล้วเติมค่าจริงก่อน"
set -a; . ./.env; set +a
: "${VM_HOST:?ไม่มี VM_HOST ใน .env}"
: "${VM_USER:?ไม่มี VM_USER ใน .env}"
: "${VM_SSH_KEY:?ไม่มี VM_SSH_KEY ใน .env}"
: "${PB_URL:?ไม่มี PB_URL ใน .env}"
[ -f "$VM_SSH_KEY" ] || die "ไม่พบ SSH key ที่ $VM_SSH_KEY"

SSH="ssh -i $VM_SSH_KEY -o BatchMode=yes -o ConnectTimeout=15 $VM_USER@$VM_HOST"
SCP="scp -i $VM_SSH_KEY -o BatchMode=yes"

# ---------- แยก argument ----------
COMMIT_MSG=""; CHECK_ONLY=0; STEPS=()
while [ $# -gt 0 ]; do
    case "$1" in
        -m|--message) COMMIT_MSG="${2:?ต้องใส่ข้อความ commit ต่อท้าย -m}"; shift 2 ;;
        --check)      CHECK_ONLY=1; shift ;;
        -h|--help)    sed -n '2,20p' "$0"; exit 0 ;;
        *)            STEPS+=("$1"); shift ;;
    esac
done
[ ${#STEPS[@]} -eq 0 ] && STEPS=(git frontend hooks schema backup verify)
has() { for s in "${STEPS[@]}"; do [ "$s" = "$1" ] && return 0; done; return 1; }

echo "เป้าหมาย: $VM_USER@$VM_HOST  ($PB_URL)"
echo "จะทำ:     ${STEPS[*]}${COMMIT_MSG:+  · commit: \"$COMMIT_MSG\"}"
[ $CHECK_ONLY -eq 1 ] && echo "${C_WARN}โหมด --check: ตรวจอย่างเดียว ไม่แก้อะไรบนเครื่อง${C_OFF}"

$SSH true 2>/dev/null || die "ต่อ VM ไม่ได้ ($VM_HOST) — เช็คเน็ต/คีย์/เครื่องเปิดอยู่ไหม"

# ============================================================
# 1) git — commit + push
# ============================================================
if has git; then
    step "git"
    if [ -n "$(git status --porcelain)" ]; then
        if [ -n "$COMMIT_MSG" ] && [ $CHECK_ONLY -eq 0 ]; then
            git add -A
            git commit -q -m "$COMMIT_MSG

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
            ok "commit: $COMMIT_MSG"
        else
            warn "มีไฟล์ที่แก้แล้วยังไม่ commit — ข้ามขั้น git (ใส่ -m \"...\" ถ้าอยากให้ commit ให้)"
            git status --short | sed 's/^/      /'
        fi
    fi
    AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo 0)
    if [ "$AHEAD" -gt 0 ] && [ $CHECK_ONLY -eq 0 ]; then
        git push -q origin main && ok "push แล้ว ($AHEAD commit)"
        warn "GitHub Actions จะ deploy หน้าเว็บซ้ำอีกรอบใน ~15 วิ — ผลลัพธ์เหมือนกัน ไม่เสียหาย"
    elif [ "$AHEAD" -gt 0 ]; then
        warn "มี $AHEAD commit ที่ยังไม่ push"
    else
        ok "git ตรงกับ origin แล้ว"
    fi
fi

# ============================================================
# 2) frontend — index.html + css/ + js/ → pb_public/
# ============================================================
if has frontend; then
    step "frontend → pb_public/"

    # ขยับ ?v= ให้เป็น hash ของเนื้อ css+js อัตโนมัติ — กันเบราว์เซอร์ใช้ไฟล์เก่าค้าง
    # (เนื้อไม่เปลี่ยน = hash เดิม = ไม่มี diff ให้รก) hash จาก css/js เท่านั้น ไม่รวม index.html
    # ไม่งั้นจะไล่กันเองไม่จบ เพราะ ?v= ฝังอยู่ใน index.html
    NEWV=$(cat css/*.css js/*.js | sha256sum | head -c 8)
    CURV=$(grep -oE 'variables\.css\?v=[a-z0-9]+' index.html | head -1 | sed 's/.*v=//')
    if [ "$NEWV" != "$CURV" ]; then
        if [ $CHECK_ONLY -eq 1 ]; then
            warn "?v= ยังเป็น $CURV แต่เนื้อ css/js เปลี่ยนเป็น $NEWV แล้ว"
        else
            sed -i -E "s/\?v=[a-z0-9]+/?v=$NEWV/g" index.html
            ok "ขยับ ?v= : $CURV → $NEWV"
        fi
    else
        ok "?v= ตรงกับเนื้อไฟล์แล้ว ($CURV)"
    fi

    if [ $CHECK_ONLY -eq 0 ]; then
        tar -czf /tmp/_fe.tgz index.html css js
        $SCP /tmp/_fe.tgz "$VM_USER@$VM_HOST:/tmp/_fe.tgz" >/dev/null
        rm -f /tmp/_fe.tgz
        # ต้องคืนเจ้าของเป็น deploy:deploy — ไม่งั้น GitHub Actions (ล็อกอินเป็น deploy)
        # จะเขียนทับไฟล์ที่ root เป็นเจ้าของไม่ได้ในรอบถัดไป
        $SSH 'set -e
            rm -rf /tmp/_fe && mkdir -p /tmp/_fe && tar -xzf /tmp/_fe.tgz -C /tmp/_fe
            [ -f /tmp/_fe/index.html ] || { echo "ไม่มี index.html"; exit 1; }
            sudo rsync -rlt --delete --chmod=D755,F644 /tmp/_fe/ /opt/pocketbase/pb_public/
            sudo chown -R deploy:deploy /opt/pocketbase/pb_public
            rm -rf /tmp/_fe /tmp/_fe.tgz
            echo "  วางแล้ว $(find /opt/pocketbase/pb_public -type f | wc -l) ไฟล์"'
        ok "อัปหน้าเว็บแล้ว"
    fi
fi

# ============================================================
# 3) hooks — pb_hooks/main.pb.js (restart PocketBase เฉพาะตอนไฟล์เปลี่ยน)
# ============================================================
if has hooks; then
    step "pb_hooks → VM"
    LOCAL_SUM=$(sha256sum pb_hooks/main.pb.js | cut -d' ' -f1)
    REMOTE_SUM=$($SSH 'sudo sha256sum /opt/pocketbase/pb_hooks/main.pb.js 2>/dev/null | cut -d" " -f1' || echo none)
    if [ "$LOCAL_SUM" = "$REMOTE_SUM" ]; then
        ok "hooks บนเครื่องตรงกับ repo แล้ว (ไม่ต้อง restart)"
    elif [ $CHECK_ONLY -eq 1 ]; then
        warn "hooks บนเครื่อง **ไม่ตรง** กับ repo — ต้อง deploy"
    else
        node --check pb_hooks/main.pb.js 2>/dev/null || die "pb_hooks/main.pb.js syntax ไม่ผ่าน — ยังไม่อัป"
        $SCP pb_hooks/main.pb.js "$VM_USER@$VM_HOST:/tmp/_hooks.js" >/dev/null
        $SSH 'sudo cp /tmp/_hooks.js /opt/pocketbase/pb_hooks/main.pb.js \
            && sudo chown pocketbase:pocketbase /opt/pocketbase/pb_hooks/main.pb.js \
            && rm -f /tmp/_hooks.js && sudo systemctl restart pocketbase && sleep 2 \
            && systemctl is-active pocketbase'
        ok "อัป hooks + restart PocketBase แล้ว"
    fi
fi

# ============================================================
# 4) schema — pb_schema.json → PocketBase
# ============================================================
if has schema; then
    step "schema → PocketBase"
    : "${PB_SUPERUSER_EMAIL:?ไม่มี PB_SUPERUSER_EMAIL ใน .env}"
    : "${PB_SUPERUSER_PASSWORD:?ไม่มี PB_SUPERUSER_PASSWORD ใน .env}"
    TOKEN=$(curl -s -X POST "$PB_URL/api/collections/_superusers/auth-with-password" \
        -H 'Content-Type: application/json' \
        -d "{\"identity\":\"$PB_SUPERUSER_EMAIL\",\"password\":\"$PB_SUPERUSER_PASSWORD\"}" \
        | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
    [ -n "$TOKEN" ] || die "login superuser ไม่ผ่าน — เช็ค PB_SUPERUSER_* ใน .env"

    if [ $CHECK_ONLY -eq 1 ]; then
        curl -s "$PB_URL/api/collections?perPage=100" -H "Authorization: $TOKEN" \
          | python3 -c '
import sys,json
live={c["name"] for c in json.load(sys.stdin)["items"] if not c["name"].startswith("_")}
want={c["name"] for c in json.load(open("pb_schema.json"))}
print("     บนเครื่อง:", ", ".join(sorted(live)))
print("     ใน repo  :", ", ".join(sorted(want)))
print("     ขาดหาย   :", ", ".join(sorted(want-live)) or "ไม่มี")'
    else
        CODE=$(curl -s -o /tmp/_imp -w '%{http_code}' -X PUT "$PB_URL/api/collections/import" \
            -H "Authorization: $TOKEN" -H 'Content-Type: application/json' \
            -d "{\"collections\": $(cat pb_schema.json), \"deleteMissing\": false}")
        [ "$CODE" = "204" ] || die "import schema ไม่ผ่าน (HTTP $CODE): $(head -c 300 /tmp/_imp)"
        rm -f /tmp/_imp
        ok "import schema แล้ว"
        warn "deleteMissing=false → **ไม่ลบ field เก่าที่เอาออกจาก pb_schema.json แล้ว**"
        warn "  ถ้าต้องลบ field ต้อง PATCH /api/collections/<ชื่อ> เองทีละอัน (เจอมาแล้วกับ password_resets)"
    fi
fi

# ============================================================
# 5) backup — สคริปต์ snapshot + กุญแจล็อก age
# ============================================================
if has backup; then
    step "สคริปต์ backup → VM"
    : "${BACKUP_RECIPIENT:?ไม่มี BACKUP_RECIPIENT ใน .env}"
    LOCAL_SUM=$(sha256sum scripts/snapshot-local.sh | cut -d' ' -f1)
    REMOTE_SUM=$($SSH 'sudo sha256sum /opt/pocketbase/scripts/snapshot-local.sh 2>/dev/null | cut -d" " -f1' || echo none)
    if [ "$LOCAL_SUM" = "$REMOTE_SUM" ] && [ $CHECK_ONLY -eq 0 ]; then
        ok "snapshot-local.sh ตรงกับ repo แล้ว"
    elif [ $CHECK_ONLY -eq 1 ]; then
        [ "$LOCAL_SUM" = "$REMOTE_SUM" ] && ok "snapshot-local.sh ตรงกัน" || warn "snapshot-local.sh **ไม่ตรง** กับ repo"
    else
        bash -n scripts/snapshot-local.sh || die "snapshot-local.sh syntax ไม่ผ่าน"
        $SCP scripts/snapshot-local.sh "$VM_USER@$VM_HOST:/tmp/_snap.sh" >/dev/null
        $SSH "sudo install -m 755 /tmp/_snap.sh /opt/pocketbase/scripts/snapshot-local.sh && rm -f /tmp/_snap.sh"
        ok "อัป snapshot-local.sh แล้ว"
    fi
    # กุญแจล็อก (public) — ไม่ลับ แต่ต้องตรงกับกุญแจไขที่เก็บไว้ ไม่งั้นกู้ backup ไม่ได้
    REMOTE_REC=$($SSH 'sudo cat /opt/pocketbase/scripts/backup-recipient.pub 2>/dev/null | tr -d "[:space:]"' || echo "")
    if [ "$REMOTE_REC" = "$BACKUP_RECIPIENT" ]; then
        ok "กุญแจล็อก age ตรงกับ .env"
    elif [ $CHECK_ONLY -eq 1 ]; then
        warn "กุญแจล็อกบน VM **ไม่ตรง** กับ BACKUP_RECIPIENT ใน .env"
    else
        echo "$BACKUP_RECIPIENT" | $SSH 'sudo tee /opt/pocketbase/scripts/backup-recipient.pub >/dev/null && sudo chmod 644 /opt/pocketbase/scripts/backup-recipient.pub'
        ok "อัปกุญแจล็อก age แล้ว"
        warn "เปลี่ยนกุญแจล็อกแล้ว → backup เก่ายังต้องใช้กุญแจไข **อันเดิม** ถอด อย่าทิ้ง"
    fi
    # deploy-frontend.sh (forced command ของ GitHub Actions)
    if [ $CHECK_ONLY -eq 0 ]; then
        LS=$(sha256sum deploy/deploy-frontend.sh | cut -d' ' -f1)
        RS=$($SSH 'sudo sha256sum /usr/local/bin/deploy-frontend.sh 2>/dev/null | cut -d" " -f1' || echo none)
        if [ "$LS" != "$RS" ]; then
            $SCP deploy/deploy-frontend.sh "$VM_USER@$VM_HOST:/tmp/_dfe.sh" >/dev/null
            $SSH "sudo install -m 755 -o root -g root /tmp/_dfe.sh /usr/local/bin/deploy-frontend.sh && rm -f /tmp/_dfe.sh"
            ok "อัป deploy-frontend.sh (ตัวที่ GitHub Actions เรียก) แล้ว"
        else
            ok "deploy-frontend.sh ตรงกับ repo แล้ว"
        fi
    fi
fi

# ============================================================
# 6) verify — เช็คว่าของจริงใช้ได้ ไม่ใช่แค่ "คำสั่งไม่ error"
# ============================================================
if has verify; then
    step "ตรวจผล"
    for p in / /js/app.js /css/submit.css /api/health; do
        code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$PB_URL$p")
        [ "$code" = "200" ] && ok "$p → $code" || { echo "  ${C_ERR}✗ $p → $code${C_OFF}"; FAIL=1; }
    done

    # hooks ทำงานอยู่จริงไหม — ถ้า pb_hooks หายไป route นี้จะ 404 แทนที่จะเป็น 400
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$PB_URL/api/pwreset/request" \
        -H 'Content-Type: application/json' -d '{"username":"__ไม่มีคนนี้__}"}')
    if [ "$code" = "400" ]; then ok "pb_hooks ทำงานอยู่ (route ลืมรหัสผ่านตอบ 400 ตามคาด)"
    else echo "  ${C_ERR}✗ pb_hooks อาจไม่ได้โหลด — /api/pwreset/request ตอบ $code (ควรเป็น 400)${C_OFF}"; FAIL=1; fi

    # ?v= ที่เสิร์ฟจริง ตรงกับเนื้อไฟล์ไหม (กันเบราว์เซอร์กินของเก่า)
    LIVEV=$(curl -s --max-time 25 "$PB_URL/" | grep -oE 'variables\.css\?v=[a-z0-9]+' | head -1 | sed 's/.*v=//')
    WANTV=$(cat css/*.css js/*.js | sha256sum | head -c 8)
    [ "$LIVEV" = "$WANTV" ] && ok "?v= บนเว็บตรงกับเนื้อไฟล์ ($LIVEV)" || warn "?v= บนเว็บ=$LIVEV แต่เนื้อไฟล์=$WANTV"

    echo
    [ "${FAIL:-0}" = "1" ] && die "มีบางอย่างไม่ผ่าน — ดูบรรทัดสีแดงด้านบน"
    echo "${C_OK}เรียบร้อย — ระบบใช้งานได้ปกติ${C_OFF}  $PB_URL"
fi
