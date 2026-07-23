/// <reference path="../pb_data/types.d.ts" />

// ============================================================
// ป้องกันการยกระดับสิทธิ์ผ่าน API บน collection `users`
// (rule ของ PocketBase เป็น record-level ไม่ใช่ field-level — hook นี้เติมการกันระดับ field)
//
// กันได้ 3 อย่าง:
//   1. ห้ามทุกคน (นอกจาก superuser) เปลี่ยน `role`  → กันตั้ง admin ให้ตัวเอง/คนอื่น
//   2. ห้าม user แอบ approve ตัวเอง (เปลี่ยน `status` ของตัวเอง) → ด่านอนุมัติไม่ถูก bypass
//   3. admin อนุมัติคนอื่นได้เฉพาะการแก้ `status` — แก้ field อ่อนไหวอื่นของคนอื่นไม่ได้
//      (กัน admin เปลี่ยน email/username ของคนอื่นเพื่อยึดบัญชี)
//
// superuser (santa ผ่าน Admin UI) ข้ามทั้งหมด ทำได้ทุกอย่างตามปกติ
// ============================================================
onRecordUpdateRequest((e) => {
    if (e.hasSuperuserAuth()) {
        e.next()
        return
    }

    const auth = e.requestInfo().auth
    const rec = e.record
    const orig = rec.original()
    const isAdmin = !!auth && auth.get("role") === "admin"
    const editingSelf = !!auth && auth.id === rec.id

    // (1) role เปลี่ยนได้เฉพาะ superuser
    if (rec.get("role") !== orig.get("role")) {
        throw new ForbiddenError("ไม่มีสิทธิ์เปลี่ยน role")
    }

    if (editingSelf) {
        // (2) ห้ามอนุมัติตัวเอง
        if (rec.get("status") !== orig.get("status")) {
            throw new ForbiddenError("อนุมัติตัวเองไม่ได้ ต้องให้ผู้ดูแลอนุมัติ")
        }
    } else {
        // (3) แก้ผู้ใช้อื่นได้เฉพาะ admin และเฉพาะ field status
        if (!isAdmin) {
            throw new ForbiddenError("ไม่มีสิทธิ์แก้ไขผู้ใช้อื่น")
        }
        const guarded = ["username", "email", "verified", "emailVisibility"]
        for (let i = 0; i < guarded.length; i++) {
            if (rec.get(guarded[i]) !== orig.get(guarded[i])) {
                throw new ForbiddenError("ผู้ดูแลแก้ผู้ใช้อื่นได้เฉพาะสถานะอนุมัติ")
            }
        }
    }

    e.next()
}, "users")


// ============================================================
// ลืมรหัสผ่าน — ผู้ดูแลตั้งรหัสให้เป็นรายคน แล้วไปบอกเจ้าตัวเอง (ไม่ใช้อีเมล)
//
// ทำไมต้องเป็น custom route: PocketBase บังคับขอ `oldPassword` เสมอเวลาที่คน
// ที่ไม่ใช่ superuser เปลี่ยนรหัสผ่าน (ทดสอบยืนยันแล้ว) — คนที่ "ลืม" รหัสจึง
// ผ่านทางปกติไม่ได้ ต้องมีเส้นทางที่ server ตั้งรหัสให้แทน
//
// ขั้นตอน:
//   1. /api/pwreset/request — ผู้ใช้กรอก username (ไม่ต้อง login) → คำขอเข้าคิวให้ผู้ดูแลเห็น
//   2. /api/pwreset/set     — ผู้ดูแลตั้งรหัสให้ (ใช้กับคนที่ยื่นคำขอ หรือคนที่มาบอกปากเปล่าก็ได้)
//                             ตั้งเสร็จ คำขอค้างของคนนั้นถูกลบออกจากคิวอัตโนมัติ
//   3. ผู้ดูแลบอกรหัสกับเจ้าตัวเอง → เจ้าตัว login แล้วเปลี่ยนรหัสที่เมนูชื่อตัวเอง
//
// **`Physics0Sut` ไม่ใช่รหัสจริง** — เป็นแค่ค่าตั้งต้นในช่องกรอกฝั่งหน้าเว็บ ไว้กันคิดไม่ออก
// route นี้ **ปฏิเสธ** ถ้าส่งค่านั้นมาตรงๆ เพื่อบังคับให้ทุกบัญชีได้รหัสไม่ซ้ำกัน
// (ถ้าปล่อยให้ใช้ค่าเดียวกันทุกคน = รหัสที่ทุกคนรู้ ใครก็ล็อกอินเป็นคนอื่นได้จนกว่าจะเปลี่ยน)
// การเช็คฝั่งหน้าเว็บอย่างเดียวไม่พอ เพราะยิง API ตรงๆ ข้ามได้
//
// กันอะไรอีก:
//   - บัญชี role=admin ตั้งทางนี้ไม่ได้ทั้งการยื่นคำขอและการตั้งให้
//     → ต้องให้ superuser ตั้งที่ Admin UI (กัน admin ยึดบัญชี admin ด้วยกัน)
//   - คำขอหมดอายุใน 24 ชม. · 1 บัญชีมีคำขอค้างได้ทีละ 1 รายการ (ยื่นใหม่ = ทับของเก่า)
//
// ⚠️ ใครก็ยื่นคำขอในนามคนอื่นได้ — ผู้ดูแลต้องยืนยันกับเจ้าตัวก่อนตั้งรหัสให้เสมอ
// ============================================================
// NB: PocketBase รัน handler แต่ละตัวใน runtime แยก — **มองไม่เห็นตัวแปร/ฟังก์ชันนอกฟังก์ชันนี้**
// ค่าคงที่ (ค่าตั้งต้น "Physics0Sut", อายุคำขอ 24 ชม. = 86400000 ms) จึงต้องเขียนซ้ำในทุก handler
// ห้ามดึงออกไปเป็นตัวแปรร่วมเด็ดขาด — จะพังเป็น 400 "Something went wrong" โดยไม่มี log บอกสาเหตุ

// ---------- 1. ผู้ใช้ยื่นคำขอ (ไม่ต้อง login) ----------
routerAdd("POST", "/api/pwreset/request", (e) => {
    const body = new DynamicModel({ username: "" })
    e.bindBody(body)

    const username = (body.username || "").trim()
    if (!username) throw new BadRequestError("กรุณากรอกชื่อผู้ใช้")

    let user
    try {
        user = $app.findFirstRecordByData("users", "username", username)
    } catch (err) {
        throw new BadRequestError("ไม่พบชื่อผู้ใช้นี้ในระบบ")
    }

    if (user.get("role") === "admin") {
        throw new BadRequestError("บัญชีผู้ดูแลรีเซ็ตทางนี้ไม่ได้ — ต้องให้ผู้ดูแลระบบสูงสุดตั้งให้")
    }

    // ยื่นใหม่ = ทับคำขอเก่าของบัญชีนี้ (ไม่ให้คิวบวมด้วยคำขอซ้ำของคนเดิม)
    const old = $app.findRecordsByFilter("password_resets", "user = {:uid}", "", 0, 0, { uid: user.id })
    for (let i = 0; i < old.length; i++) {
        $app.delete(old[i])
    }

    const rec = new Record($app.findCollectionByNameOrId("password_resets"))
    rec.set("user", user.id)
    rec.set("expiresAt", new Date(Date.now() + 86400000).toISOString())
    $app.save(rec)

    e.json(200, { ok: true, displayName: user.get("displayName") || username })
})

// ---------- 2. ผู้ดูแลตั้งรหัสให้ ----------
routerAdd("POST", "/api/pwreset/set", (e) => {
    const auth = e.auth
    if (!e.hasSuperuserAuth() && (!auth || auth.get("role") !== "admin")) {
        throw new ForbiddenError("เฉพาะผู้ดูแลเท่านั้น")
    }

    const body = new DynamicModel({ userId: "", password: "" })
    e.bindBody(body)

    const password = (body.password || "").trim()
    if (password.length < 8) throw new BadRequestError("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร")
    if (password.toLowerCase() === "physics0sut") {
        throw new BadRequestError("ต้องแก้ค่าตั้งต้นก่อน — เติมตัวเลขต่อท้าย หรือกดปุ่มสุ่ม เพื่อให้แต่ละคนได้รหัสไม่ซ้ำกัน")
    }

    let user
    try {
        user = $app.findRecordById("users", body.userId || "")
    } catch (err) {
        throw new BadRequestError("ไม่พบบัญชีนี้")
    }

    if (user.get("role") === "admin") {
        throw new BadRequestError("บัญชีผู้ดูแลต้องให้ผู้ดูแลระบบสูงสุดตั้งรหัสให้ที่ Admin UI")
    }

    user.setPassword(password)
    $app.save(user)

    // ตั้งให้แล้ว = คำขอค้างของคนนี้ถือว่าจบ เอาออกจากคิว
    const pending = $app.findRecordsByFilter("password_resets", "user = {:uid}", "", 0, 0, { uid: user.id })
    for (let i = 0; i < pending.length; i++) {
        $app.delete(pending[i])
    }

    e.json(200, { ok: true, username: user.get("username"), password: password })
}, $apis.requireAuth())
