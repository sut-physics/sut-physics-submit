// PocketBase URL — เลือกให้ถูกอัตโนมัติทั้ง 3 สถานการณ์ ไม่ต้องแก้ค่าเวลา deploy/เปลี่ยนโดเมน/กู้เครื่อง
//   1) production หรือ local ที่ PocketBase เสิร์ฟหน้าเว็บเอง (pb_public/) → ใช้ origin เดียวกัน
//   2) dev server เช่น VS Code "Go Live" (:5500) หรือพอร์ตอื่นบน localhost → ชี้ไป PocketBase :8090
//   3) เปิดไฟล์ตรงๆ แบบ file:// (origin = "null") → ชี้ไป PocketBase :8090
// (PocketBase ส่ง CORS `Allow-Origin: *` อยู่แล้ว กรณี 2/3 จึงยิงข้ามพอร์ตได้)
var PB_DEV_URL = 'http://127.0.0.1:8090';

var PB_URL = (function () {
    var origin = location.origin;
    if (!origin || origin === 'null') return PB_DEV_URL;                 // file://
    var isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    if (isLocal && location.port !== '8090') return PB_DEV_URL;          // dev server คนละพอร์ต
    return origin;                                                       // PocketBase เสิร์ฟเอง
})();

// โดเมนปลอมสำหรับแปลง username → email ให้ PocketBase auth (ต้องไม่ชนกับ dashboard)
var FAKE_EMAIL_DOMAIN = '@submit.local';
