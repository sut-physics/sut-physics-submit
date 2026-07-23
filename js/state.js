// PocketBase instance (SDK โหลดผ่าน CDN <script> ใน index.html)
var pb = new PocketBase(PB_URL);

// ผู้ใช้ที่ login อยู่
var currentUser = { id: '', username: '', role: '', displayName: '', status: '' };

// ข้อมูล submissions ที่โหลดมา (record + expand sender/recipient), sort ใหม่สุดก่อน
var SUBMISSIONS = [];

// แถวจาก view `submission_queue` (id/recipient/status/created) ของงานที่ยังค้างทั้งระบบ
// ใช้คำนวณ "คิวก่อนหน้า" ในเครื่อง — ไม่มีข้อมูลอ่อนไหว ไม่เห็นหัวข้อ/ไฟล์ของใคร
var QUEUE_ROWS = [];

// UI state ของ list view
// direction: 'all' | 'received' (ส่งถึงเรา) | 'sent' (เราส่งออก)
var listState = { filter: 'all', direction: 'all', query: '', openId: null };

// cache รายชื่อ admin (ผู้รับที่เลือกได้) สำหรับ dropdown
var ADMINS = [];

// unsubscribe handles ของ realtime — เก็บไว้เพื่อเรียกตอน logout / ปิด detail
var _unsubSubmissions = null;
var _unsubReplies = null;

// กัน realtime echo ตอนเราเป็นคน write เอง
var _savingInProgress = false;

// นิยามสถานะงาน (label ภาษาไทย + class สี ตรงกับ mockup)
// NB: ค่าที่เก็บใน DB ยังเป็น queue/review/complete/returned เหมือนเดิม — เปลี่ยนแค่ป้ายที่แสดง
var STATUS = {
    queue:    { label: 'รอดำเนินการ',    cls: 'queue' },
    review:   { label: 'กำลังดำเนินการ', cls: 'review' },
    complete: { label: 'เสร็จสิ้น',      cls: 'complete' },
    returned: { label: 'ตีกลับ/แก้ไข',   cls: 'returned' }
};
