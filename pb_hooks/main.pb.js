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

    if (editingSelf) {
        // (1) ห้ามยกระดับ/ลดระดับตัวเอง และห้ามอนุมัติตัวเอง
        // ทั้งสองอย่างต้องให้ "คนอื่น" เป็นคนกด ไม่งั้นด่านอนุมัติไม่มีความหมาย
        if (rec.get("role") !== orig.get("role")) {
            throw new ForbiddenError("เปลี่ยนสิทธิ์ตัวเองไม่ได้ ต้องให้ผู้ดูแลคนอื่นเปลี่ยนให้")
        }
        if (rec.get("status") !== orig.get("status")) {
            throw new ForbiddenError("เปลี่ยนสถานะบัญชีตัวเองไม่ได้ ต้องให้ผู้ดูแลเปลี่ยนให้")
        }
    } else {
        // (2) แก้ผู้ใช้อื่นได้เฉพาะ admin
        if (!isAdmin) {
            throw new ForbiddenError("ไม่มีสิทธิ์แก้ไขผู้ใช้อื่น")
        }

        // (2.1) **ห้าม admin แตะบัญชี admin ด้วยกัน** — ถอดสิทธิ์/ปิดใช้งานกันเองไม่ได้
        // ไม่งั้น admin คนไหนก็ล็อก admin คนอื่นออกจากระบบได้ รวมถึงเจ้าของระบบเอง
        // (เลื่อน user ธรรมดาขึ้นเป็น admin ยังทำได้ตามปกติ — ห้ามเฉพาะการแตะคนที่เป็น admin อยู่แล้ว)
        // ถอดสิทธิ์/ปิดใช้งาน admin ต้องทำผ่าน superuser ที่ Admin UI เท่านั้น
        if (orig.get("role") === "admin") {
            throw new ForbiddenError("บัญชีผู้ดูแลต้องให้ผู้ดูแลระบบสูงสุด (superuser) เป็นคนแก้ที่ Admin UI")
        }
        // (3) แก้ได้เฉพาะ role กับ status — field อ่อนไหวอื่นห้ามแตะ (กันยึดบัญชีด้วยการเปลี่ยนอีเมล)
        const guarded = ["username", "email", "verified", "emailVisibility"]
        for (let i = 0; i < guarded.length; i++) {
            if (rec.get(guarded[i]) !== orig.get(guarded[i])) {
                throw new ForbiddenError("ผู้ดูแลแก้ผู้ใช้อื่นได้เฉพาะสิทธิ์กับสถานะบัญชี")
            }
        }
        // (4) ค่าที่ใส่ต้องเป็นค่าที่ระบบรู้จักเท่านั้น (field เป็น text ธรรมดา ไม่ใช่ select
        //     ถ้าไม่เช็คตรงนี้ ใส่ role อะไรก็ได้ แล้วเงื่อนไขอย่าง `role = "admin"` จะเพี้ยน)
        const role = rec.get("role")
        const status = rec.get("status")
        if (role !== "user" && role !== "admin") {
            throw new ForbiddenError("role ต้องเป็น user หรือ admin เท่านั้น")
        }
        if (status !== "pending" && status !== "approved" && status !== "disabled") {
            throw new ForbiddenError("status ต้องเป็น pending / approved / disabled เท่านั้น")
        }

        // (5) ปิดใช้งาน = ต้องเตะออกจากระบบทันที
        // `authRule` กันได้แค่การ login ครั้งใหม่ — token ที่ออกไปแล้วยังใช้ได้จนหมดอายุ (นานเป็นสัปดาห์)
        // ถ้าไม่ทำตรงนี้ คนที่เพิ่งถูกปิดใช้งานยังเปิดแท็บเดิมทำงานต่อได้เหมือนไม่มีอะไรเกิดขึ้น
        // refreshTokenKey() สุ่ม tokenKey ใหม่ → token เก่าทุกใบใช้ไม่ได้ทันที
        if (status === "disabled" && orig.get("status") !== "disabled") {
            rec.refreshTokenKey()
        }
    }

    e.next()
}, "users")


// ============================================================
// ส่งต่องานให้ผู้ตรวจคนอื่น (reassign)
//
// `submissions.updateRule` เปิดให้เฉพาะ recipient ปัจจุบันแก้ได้อยู่แล้ว → คนอื่นส่งต่อไม่ได้
// hook นี้เติมเงื่อนไขที่ rule เขียนไม่ได้: ผู้รับคนใหม่ต้องเป็น admin จริง และต้องไม่ใช่ผู้ส่งเอง
// (ถ้าปล่อยให้ส่งต่อไปหาใครก็ได้ จะกลายเป็นช่องยัดงานให้ user ธรรมดาที่ไม่มีสิทธิ์ตรวจ
//  หรือส่งกลับไปหาเจ้าของงานเองจนกลายเป็นตรวจงานตัวเอง)
// ============================================================
onRecordUpdateRequest((e) => {
    if (e.hasSuperuserAuth()) {
        e.next()
        return
    }

    const auth = e.requestInfo().auth
    const rec = e.record
    const orig = rec.original()
    const isRecipient = !!auth && auth.id === orig.get("recipient")
    const isSender = !!auth && auth.id === orig.get("sender")

    // ---------- ผู้ส่ง: ทำได้อย่างเดียวคือ "ส่งงานที่แก้แล้ว" กลับเข้าคิว ----------
    // updateRule เปิดให้ผู้ส่งแก้ได้เฉพาะตอนสถานะเป็น returned อยู่แล้ว
    // ตรงนี้จำกัดต่อว่าแก้ได้แค่ "สถานะ" เท่านั้น ห้ามแอบแก้หัวข้อ/ไฟล์/กำหนดส่ง/ผู้รับ
    // (ไม่งั้นจะกลายเป็นช่องแก้เนื้องานย้อนหลังหลังผู้ตรวจอ่านไปแล้ว)
    if (isSender && !isRecipient) {
        if (orig.get("status") !== "returned" || rec.get("status") !== "queue") {
            throw new ForbiddenError("ผู้ส่งเปลี่ยนสถานะเองได้เฉพาะการส่งงานที่แก้แล้วกลับเข้าคิว")
        }
        const locked = ["topic", "description", "sender", "recipient", "deadline", "file"]
        for (let i = 0; i < locked.length; i++) {
            if (String(rec.get(locked[i])) !== String(orig.get(locked[i]))) {
                throw new ForbiddenError("ส่งงานที่แก้แล้วได้ แต่แก้เนื้อหางานเดิมไม่ได้ — ให้แนบไฟล์ใหม่ในกระทู้ตอบกลับแทน")
            }
        }
        // ไปต่อท้ายแถว: นับคิวใช้ queuedAt ไม่ใช่ created
        rec.set("queuedAt", new Date().toISOString())
        rec.set("revision", (orig.get("revision") || 0) + 1)
        e.next()
        return
    }

    if (rec.get("recipient") !== orig.get("recipient")) {
        const newId = rec.get("recipient")

        if (newId === rec.get("sender")) {
            throw new ForbiddenError("ส่งต่อให้เจ้าของงานเองไม่ได้")
        }

        let target
        try {
            target = $app.findRecordById("users", newId)
        } catch (err) {
            throw new BadRequestError("ไม่พบบัญชีผู้รับคนใหม่")
        }
        if (target.get("role") !== "admin") {
            throw new ForbiddenError("ส่งต่อได้เฉพาะให้ผู้ดูแล (ผู้ตรวจ) เท่านั้น")
        }
        if (target.get("status") !== "approved") {
            throw new ForbiddenError("บัญชีผู้รับคนใหม่ยังไม่ได้รับอนุมัติ หรือถูกปิดใช้งานอยู่")
        }
    }

    e.next()
}, "submissions")


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

// ============================================================
// งานใหม่ = เข้าคิวตอนนี้
// เก็บ `queuedAt` แยกจาก `created` เพราะงานที่ถูกตีกลับแล้วส่งแก้กลับมา
// ต้องไปต่อท้ายแถว (queuedAt ขยับ) แต่ยังต้องรู้ว่าส่งครั้งแรกเมื่อไหร่ (created คงเดิม)
// ============================================================
onRecordCreateRequest((e) => {
    e.record.set("queuedAt", new Date().toISOString())
    e.record.set("revision", 0)
    e.next()
}, "submissions")


// ============================================================
// บังคับให้เบราว์เซอร์ถาม server ทุกครั้งก่อนใช้ index.html จากแคช
//
// ปัญหาที่แก้: css/js มี `?v=<hash>` กันแคชอยู่แล้ว แต่ **ตัว index.html เองไม่มีอะไรกัน**
// PocketBase ส่งมาแค่ `Last-Modified` ไม่มี `Cache-Control` → Chrome เดาอายุแคชเอง
// แล้วเสิร์ฟ index.html เก่าโดยไม่ถาม server ผลคือหน้าเว็บยังชี้ไป js เวอร์ชันก่อนหน้า
// = deploy ไปแล้วแต่ผู้ใช้ไม่เห็นการเปลี่ยนแปลง (เจอจริงวันที่ 23 ก.ค. ไล่หาอยู่นาน)
//
// `no-cache` ไม่ได้แปลว่าห้ามแคช — แปลว่าเก็บได้แต่ต้องถามก่อนใช้ทุกครั้ง
// ไฟล์ไม่เปลี่ยน server ตอบ 304 (ไม่กินแบนด์วิดท์) ไฟล์เปลี่ยนถึงจะโหลดใหม่
// css/js ไม่ต้องแตะ เพราะมี ?v= อยู่แล้ว
// ============================================================
routerUse((e) => {
    const p = e.request.url.path
    if (p === "/" || p.endsWith(".html")) {
        e.response.header().set("Cache-Control", "no-cache")
    }
    return e.next()
})
