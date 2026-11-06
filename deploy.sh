#!/usr/bin/env bash
# ============================================================
# deploy.sh — สั่งครั้งเดียวจบ: หน้าเว็บ + hooks + schema + push ขึ้น GitHub  (เป้าหมาย: NAS)
#
# ใช้:
#   ./deploy.sh                      ทำทุกอย่าง (ไม่ commit ถ้าไม่ใส่ -m)
#   ./deploy.sh -m "ข้อความ commit"   commit ทุกอย่างที่แก้ + push + deploy
#   ./deploy.sh frontend             เฉพาะหน้าเว็บ
#   ./deploy.sh hooks schema         เลือกทำเฉพาะบางอย่าง (คั่นด้วยเว้นวรรค)
#   ./deploy.sh --check              ไม่ deploy อะไร แค่ตรวจว่าของบน NAS ตรงกับ repo ไหม
#
# ขั้นตอนที่มีให้เลือก: git · frontend · hooks · schema · verify
#
# ต่อ NAS ผ่าน ssh alias (ดู NAS_SSH ใน .env) ด้วยกุญแจ — ไม่มีรหัสผ่านในสคริปต์
# ค่าทั้งหมดอ่านจาก .env (ดู .env.example)
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
: "${NAS_SSH:?ไม่มี NAS_SSH ใน .env (ชื่อ Host ใน ~/.ssh/config)}"
: "${NAS_DIR:?ไม่มี NAS_DIR ใน .env (เช่น /volume2/submit-project)}"
: "${PB_URL:?ไม่มี PB_URL ใน .env}"

SSH="ssh -o BatchMode=yes -o ConnectTimeout=15 $NAS_SSH"
RSYNC_SSH="ssh -o BatchMode=yes -o ConnectTimeout=15"

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
[ ${#STEPS[@]} -eq 0 ] && STEPS=(git frontend hooks schema verify)
has() { for s in "${STEPS[@]}"; do [ "$s" = "$1" ] && return 0; done; return 1; }

echo "เป้าหมาย: $NAS_SSH:$NAS_DIR  ($PB_URL)"
echo "จะทำ:     ${STEPS[*]}${COMMIT_MSG:+  · commit: \"$COMMIT_MSG\"}"
[ $CHECK_ONLY -eq 1 ] && echo "${C_WARN}โหมด --check: ตรวจอย่างเดียว ไม่แก้อะไรบน NAS${C_OFF}"

# ต่อ NAS ไม่ได้ = หยุดก่อนแก้อะไร (ไม่ลองซ้ำ — กัน DSM บล็อก IP)
$SSH true 2>/dev/null || die "ต่อ NAS ไม่ได้ ($NAS_SSH) — เช็คว่าเน็ตมหาวิทยาลัยใช้ได้ / กุญแจ SSH ยังอยู่ใน authorized_keys / IP ไม่โดน DSM บล็อก"

# ---------- ขยับ ?v= ก่อนทุกอย่าง ----------
# ต้องทำ **ก่อน** ขั้น git ไม่งั้น commit ไปแล้วค่อยแก้ index.html → เหลือไฟล์ค้างทุกครั้ง
# hash จาก css/js เท่านั้น ไม่รวม index.html เพราะ ?v= ฝังอยู่ในนั้น จะไล่กันเองไม่จบ
# เนื้อไม่เปลี่ยน = hash เดิม = ไม่มี diff ให้รก
if has frontend; then
    NEWV=$(cat css/*.css js/*.js | sha256sum | head -c 8)
    CURV=$(grep -oE 'variables\.css\?v=[a-z0-9]+' index.html | head -1 | sed 's/.*v=//')
    if [ "$NEWV" != "$CURV" ]; then
        if [ $CHECK_ONLY -eq 1 ]; then
            echo; warn "?v= ยังเป็น $CURV แต่เนื้อ css/js เปลี่ยนเป็น $NEWV แล้ว"
        else
            sed -i -E "s/\?v=[a-z0-9]+/?v=$NEWV/g" index.html
            echo; ok "ขยับ ?v= : $CURV → $NEWV  ${C_DIM}(จะติดไปกับ commit ด้วย)${C_OFF}"
        fi
    fi
fi

# ============================================================
# 1) git — commit + push
# ============================================================
if has git; then
    step "git"
    if [ -n "$(git status --porcelain)" ]; then
        if [ -n "$COMMIT_MSG" ] && [ $CHECK_ONLY -eq 0 ]; then
            git add -A
            git commit -q -m "$COMMIT_MSG

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
            ok "commit: $COMMIT_MSG"
        else
            warn "มีไฟล์ที่แก้แล้วยังไม่ commit — ข้ามขั้น git (ใส่ -m \"...\" ถ้าอยากให้ commit ให้)"
            git status --short | sed 's/^/      /'
        fi
    fi
    AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo 0)
    if [ "$AHEAD" -gt 0 ] && [ $CHECK_ONLY -eq 0 ]; then
        git push -q origin main && ok "push แล้ว ($AHEAD commit)"
    elif [ "$AHEAD" -gt 0 ]; then
        warn "มี $AHEAD commit ที่ยังไม่ push"
    else
        ok "git ตรงกับ origin แล้ว"
    fi
fi

# ============================================================
# 2) frontend — index.html + css/ + js/ → NAS pb_public/
# ============================================================
if has frontend; then
    step "frontend → NAS pb_public/"
    # --delete ลบไฟล์แปลกปลอมใน pb_public ด้วย (ทุกอย่างในนั้นถูกเสิร์ฟสู่สาธารณะ)
    # ไม่ส่ง perms/owner: NAS ใช้ ACL อยู่แล้ว ปล่อยให้เป็นตามโฟลเดอร์ปลายทาง
    FLAGS="-rlt --omit-dir-times --delete --itemize-changes"
    [ $CHECK_ONLY -eq 1 ] && FLAGS="$FLAGS --dry-run"
    OUT=$(rsync $FLAGS --rsync-path=/usr/bin/rsync -e "$RSYNC_SSH" --exclude='.DS_Store' \
        index.html css js "$NAS_SSH:$NAS_DIR/pb_public/" 2>&1) || die "rsync หน้าเว็บไม่ผ่าน: $OUT"
    # rsync ซ้อนโฟลเดอร์ต้นทางหลายอัน --delete จะไม่แตะของนอกรายการ → เช็คไฟล์เกินแยกต่างหาก
    EXTRA=$($SSH "cd $NAS_DIR/pb_public && find . -type f ! -name index.html ! -path './css/*' ! -path './js/*' ! -path './@eaDir/*'") 
    CHG=$(echo "$OUT" | grep -c '^[<>c]' || true)
    if [ $CHECK_ONLY -eq 1 ]; then
        [ "$CHG" -eq 0 ] && ok "หน้าเว็บบน NAS ตรงกับ repo" || warn "หน้าเว็บบน NAS **ไม่ตรง** กับ repo ($CHG ไฟล์ต่างกัน)"
    else
        ok "อัปหน้าเว็บแล้ว ($CHG ไฟล์เปลี่ยน)"
    fi
    if [ -n "$EXTRA" ]; then
        warn "มีไฟล์เกินใน pb_public/ ที่ไม่ใช่ของแอป (เสิร์ฟสู่สาธารณะอยู่):"
        echo "$EXTRA" | sed 's/^/      /'
        [ $CHECK_ONLY -eq 0 ] && warn "  ลบเองถ้าไม่ต้องการ:  ssh $NAS_SSH 'rm $NAS_DIR/pb_public/<ชื่อไฟล์>'"
    fi
fi

# ============================================================
# 3) hooks — pb_hooks/main.pb.js (PocketBase 0.25 รีโหลดเองเมื่อไฟล์เปลี่ยน ไม่ต้อง restart)
# ============================================================
if has hooks; then
    step "pb_hooks → NAS"
    LOCAL_SUM=$(sha256sum pb_hooks/main.pb.js | cut -d' ' -f1)
    REMOTE_SUM=$($SSH "sha256sum $NAS_DIR/pb_hooks/main.pb.js 2>/dev/null | cut -d' ' -f1" || echo none)
    if [ "$LOCAL_SUM" = "$REMOTE_SUM" ]; then
        ok "hooks บน NAS ตรงกับ repo แล้ว"
    elif [ $CHECK_ONLY -eq 1 ]; then
        warn "hooks บน NAS **ไม่ตรง** กับ repo — ต้อง deploy"
    else
        node --check pb_hooks/main.pb.js 2>/dev/null || die "pb_hooks/main.pb.js syntax ไม่ผ่าน — ยังไม่อัป"
        rsync -t --rsync-path=/usr/bin/rsync -e "$RSYNC_SSH" pb_hooks/main.pb.js "$NAS_SSH:$NAS_DIR/pb_hooks/main.pb.js" || die "อัป hooks ไม่ผ่าน"
        ok "อัป hooks แล้ว — PocketBase รีโหลดเอง (ขั้น verify จะเช็คว่าโหลดจริง)"
        sleep 3
    fi
fi

# ============================================================
# 4) schema — pb_schema.json → PocketBase (ผ่าน HTTPS ไม่ต้อง SSH)
# ============================================================
if has schema; then
    step "schema → PocketBase"
    : "${PB_SUPERUSER_EMAIL:?ไม่มี PB_SUPERUSER_EMAIL ใน .env}"
    : "${PB_SUPERUSER_PASSWORD:?ไม่มี PB_SUPERUSER_PASSWORD ใน .env}"
    TOKEN=$(curl -s -X POST "$PB_URL/api/collections/_superusers/auth-with-password" \
        -H 'Content-Type: application/json' \
        -d "{\"identity\":\"$PB_SUPERUSER_EMAIL\",\"password\":\"$PB_SUPERUSER_PASSWORD\"}" \
        | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
    [ -n "$TOKEN" ] || die "login superuser ไม่ผ่าน — เช็ค PB_SUPERUSER_* ใน .env (ต้องเป็นของ instance บน NAS)"

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
# 5) verify — เช็คว่าของจริงใช้ได้ ไม่ใช่แค่ "คำสั่งไม่ error"
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
