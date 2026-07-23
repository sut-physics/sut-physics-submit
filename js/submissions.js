// ============================================================
// Submissions — โหลด/แสดง list + detail, อัปโหลดไฟล์, ตอบกลับ,
// เปลี่ยนสถานะ, ฟีเจอร์คิว, และ realtime
// pattern อ้างอิง: sut-physics-nas/js/documents.js (upload) + pocketbase-sync.js (realtime)
// ============================================================

// ---------- bootstrap ----------
function initSubmissions() {
    loadAdmins();
    loadSubmissions().then(function () {
        renderRail();
        renderRows();
        subscribeRealtime();
    });
}

function loadSubmissions() {
    return Promise.all([
        pb.collection('submissions').getFullList({
            sort: '-created',
            expand: 'sender,recipient',
            requestKey: 'listSubmissions'
        }),
        // ตารางคิวรวมของทุกคน — ไม่มีข้อมูลอ่อนไหว (id/recipient/status/created เท่านั้น)
        // ยิงครั้งเดียวแล้วคำนวณในเครื่อง ดีกว่ายิงนับทีละแถว
        pb.collection('submission_queue').getFullList({
            filter: 'status = "queue" || status = "review"',
            requestKey: 'listQueue'
        }).catch(function () { return []; })
    ]).then(function (r) {
        SUBMISSIONS = r[0];
        QUEUE_ROWS = r[1];
    }).catch(function (err) {
        console.error('โหลด submissions ไม่สำเร็จ:', err);
        SUBMISSIONS = [];
        QUEUE_ROWS = [];
    });
}

// มีงานค้างอยู่ก่อนหน้างานนี้กี่ชิ้น ในคิวของผู้รับคนเดียวกัน
// นับเฉพาะงานที่ยังไม่จบ (queue/review) และเข้าคิวมาก่อนเรา
// เวลาที่เข้าคิวรอบล่าสุด — งานที่ส่งแก้กลับมาจะได้ค่าใหม่ จึงไปต่อท้ายแถว
// (ข้อมูลเก่าก่อนมี field นี้ยังไม่มีค่า → ใช้ created แทน)
function queuedTime(rec) {
    return rec.queuedAt || rec.created;
}

function queueAhead(d) {
    if (d.status !== 'queue' && d.status !== 'review') return null;   // จบแล้ว/ตีกลับ = ไม่อยู่ในคิว
    var mine = queuedTime(d);
    var n = 0;
    for (var i = 0; i < QUEUE_ROWS.length; i++) {
        var q = QUEUE_ROWS[i];
        if (q.recipient === d.recipient && queuedTime(q) < mine) n++;
    }
    return n;
}

// รายชื่อผู้รับที่เลือกได้ = admin ทุกคน ยกเว้นตัวเอง (ส่งงานให้ตัวเองตรวจไม่มีความหมาย)
function adminRecipientFilter() {
    return 'role = "admin" && id != "' + currentUser.id + '"';
}

function loadAdmins() {
    pb.collection('users').getFullList({ filter: adminRecipientFilter(), sort: 'displayName', requestKey: 'adminsCache' })
        .then(function (records) { ADMINS = records; })
        .catch(function (err) { console.error('โหลดรายชื่อ admin ไม่สำเร็จ:', err); });
}

// ---------- helpers ----------
var THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function parseDate(pbDate) {
    // PocketBase คืนค่ารูปแบบ "2026-07-18 09:14:23.123Z" — แปลงให้ Date parse ได้ทุก browser
    return new Date(String(pbDate).replace(' ', 'T'));
}

function formatDate(pbDate) {
    var d = parseDate(pbDate);
    var beShort = (d.getFullYear() + 543) % 100;
    return d.getDate() + ' ' + THAI_MONTHS[d.getMonth()] + ' ' + (beShort < 10 ? '0' + beShort : beShort);
}

function formatTime(pbDate) {
    var d = parseDate(pbDate);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}

function formatDateTime(pbDate) {
    var d = parseDate(pbDate);
    var hh = ('0' + d.getHours()).slice(-2);
    var mm = ('0' + d.getMinutes()).slice(-2);
    var today = new Date();
    var sameDay = d.toDateString() === today.toDateString();
    var head = sameDay ? 'วันนี้' : (d.getDate() + ' ' + THAI_MONTHS[d.getMonth()]);
    return head + ' ' + hh + ':' + mm;
}

// ข้อมูลกำหนดส่ง + ระดับความเร่งด่วน (ใช้ทั้งตารางและหน้ารายละเอียด)
//   overdue = เลยกำหนดแล้วและยังไม่เสร็จ | soon = เหลือ ≤2 วันและยังไม่เสร็จ
//   งานที่ 'เสร็จสิ้น' แล้วไม่ต้องเตือน
function deadlineInfo(rec) {
    if (!rec.deadline) return null;
    var due = parseDate(rec.deadline);
    var done = rec.status === 'complete';
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    var daysLeft = Math.round((dueDay - today) / 86400000);

    var level = 'none', note = '';
    if (done) {
        note = '';
    } else if (daysLeft < 0) {
        level = 'overdue'; note = 'เลยกำหนด ' + Math.abs(daysLeft) + ' วัน';
    } else if (daysLeft === 0) {
        level = 'soon'; note = 'ครบกำหนดวันนี้';
    } else if (daysLeft <= 2) {
        level = 'soon'; note = 'เหลือ ' + daysLeft + ' วัน';
    } else {
        note = 'เหลือ ' + daysLeft + ' วัน';
    }
    return { due: due, daysLeft: daysLeft, level: level, note: note };
}

function initials(name) {
    var t = (name || '').trim();
    return t ? t.slice(0, 3) : '?';
}

function deriveCode(rec) {
    var year = parseDate(rec.created).getFullYear();
    return 'REQ-' + year + '-' + rec.id.slice(-4).toUpperCase();
}

function displayName(userRec) {
    return userRec ? (userRec.displayName || userRec.username) : '(ไม่ทราบ)';
}

function senderName(rec) { return displayName(rec.expand && rec.expand.sender); }
function recipientName(rec) { return displayName(rec.expand && rec.expand.recipient); }
// คู่ตรงข้ามของเรา: เราเป็นผู้ส่ง → โชว์ผู้รับ, เราเป็นผู้รับ → โชว์ผู้ส่ง
// คำนำหน้า (จาก/ถึง) ใส่เฉพาะตอนรายการปนกันสองทิศ — ปกติหัวคอลัมน์บอกอยู่แล้ว
function counterparty(rec) {
    var iAmSender = currentUser && currentUser.id === rec.sender;
    return { name: iAmSender ? recipientName(rec) : senderName(rec), iAmSender: iAmSender };
}

function cleanFileName(fname) {
    // PocketBase ต่อท้ายชื่อไฟล์ด้วย _<10 อักขระสุ่ม> ก่อนนามสกุล — ตัดออกให้อ่านง่าย
    return String(fname || '').replace(/_[a-zA-Z0-9]{10}(\.[^.]+)$/, '$1');
}

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fileChipHtml(url, rawName) {
    var name = cleanFileName(rawName);
    return '<a class="file-chip" href="' + url + '" target="_blank" rel="noopener">' +
        '<span class="fi"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></span>' +
        '<span><span class="fname">' + escapeHtml(name) + '</span><br><span class="fsize">เปิดไฟล์</span></span></a>';
}

// ---------- ตัวช่วยกรอง (ใช้ร่วมกันระหว่าง rail กับ rows) ----------
function isIncoming(d) { return !(currentUser && currentUser.id === d.sender); }

function matchesQuery(d) {
    var q = listState.query.trim().toLowerCase();
    if (!q) return true;
    return (d.topic + ' ' + senderName(d) + ' ' + recipientName(d)).toLowerCase().indexOf(q) >= 0;
}
function matchesDirection(d) {
    if (listState.direction === 'all') return true;
    return listState.direction === 'received' ? isIncoming(d) : !isIncoming(d);
}
function matchesStatus(d) {
    return listState.filter === 'all' || d.status === listState.filter;
}

// ---------- rail (ทิศทาง + สถานะ — ตัวเลขนับแบบ faceted: แต่ละกลุ่มนับตามเงื่อนไขของอีกกลุ่ม) ----------
function renderRail() {
    // ทิศทางจะโผล่เฉพาะตอนที่มีงานทั้งสองทางจริงๆ (ผู้ใช้ทั่วไปที่ส่งอย่างเดียวไม่ต้องเห็น)
    var anyIn = false, anyOut = false;
    SUBMISSIONS.forEach(function (d) { if (isIncoming(d)) anyIn = true; else anyOut = true; });
    var showDirection = anyIn && anyOut;
    var dirSection = document.getElementById('directionSection');
    dirSection.classList.toggle('hidden', !showDirection);
    if (!showDirection) listState.direction = 'all';   // กันค้างค่าเก่าแล้วลิสต์ว่างเปล่า

    if (showDirection) {
        var forDir = SUBMISSIONS.filter(function (d) { return matchesQuery(d) && matchesStatus(d); });
        var dc = { all: forDir.length, received: 0, sent: 0 };
        forDir.forEach(function (d) { if (isIncoming(d)) dc.received++; else dc.sent++; });
        var dirItems = [
            { key: 'all', label: 'ทั้งหมด', color: 'var(--ink-faint)' },
            { key: 'received', label: 'ที่ได้รับ', color: 'var(--st-review)' },
            { key: 'sent', label: 'ที่ฉันส่ง', color: 'var(--accent)' }
        ];
        document.getElementById('directionList').innerHTML = dirItems.map(function (it) {
            return '<button class="filter-item' + (listState.direction === it.key ? ' active' : '') + '" data-dir="' + it.key + '">' +
                '<span class="label"><span class="dot" style="background:' + it.color + '"></span>' + it.label + '</span>' +
                '<span class="count tabular">' + dc[it.key] + '</span></button>';
        }).join('');
    }

    // สถานะ: นับเฉพาะในทิศทาง+คำค้นที่เลือกอยู่
    var forStatus = SUBMISSIONS.filter(function (d) { return matchesQuery(d) && matchesDirection(d); });
    var c = { all: forStatus.length, queue: 0, review: 0, complete: 0, returned: 0 };
    forStatus.forEach(function (d) { if (c[d.status] != null) c[d.status]++; });

    var items = [
        { key: 'all', label: 'ทั้งหมด', color: 'var(--ink-faint)' },
        { key: 'queue', label: STATUS.queue.label, color: 'var(--st-queue)' },
        { key: 'review', label: STATUS.review.label, color: 'var(--st-review)' },
        { key: 'complete', label: STATUS.complete.label, color: 'var(--st-complete)' },
        { key: 'returned', label: STATUS.returned.label, color: 'var(--st-returned)' }
    ];
    document.getElementById('filterList').innerHTML = items.map(function (it) {
        return '<button class="filter-item' + (listState.filter === it.key ? ' active' : '') + '" data-f="' + it.key + '">' +
            '<span class="label"><span class="dot" style="background:' + it.color + '"></span>' + it.label + '</span>' +
            '<span class="count tabular">' + c[it.key] + '</span></button>';
    }).join('');

    Array.prototype.forEach.call(document.querySelectorAll('[data-f]'), function (btn) {
        btn.addEventListener('click', function () {
            listState.filter = btn.getAttribute('data-f');
            if (listState.openId) closeDetail();   // อยู่หน้า detail อยู่ → เด้งกลับมาหน้ารายการให้เห็นผลการกรอง
            renderRail();
            renderRows();
        });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-dir]'), function (btn) {
        btn.addEventListener('click', function () {
            listState.direction = btn.getAttribute('data-dir');
            if (listState.openId) closeDetail();
            renderRail();
            renderRows();
        });
    });
}

// ---------- list rows ----------
// ป้ายบอกว่างานนี้ถูกตีกลับแล้วส่งแก้กลับมา — ผู้ตรวจจะได้แยกออกจากงานใหม่ที่เพิ่งส่งครั้งแรก
function revisionBadge(d) {
    var n = d.revision || 0;
    if (!n) return '';
    return '<span class="rev-badge" title="เคยถูกตีกลับแล้วส่งแก้กลับมา ' + n + ' ครั้ง">แก้ครั้งที่ ' + n + '</span>';
}

// ช่องคิว: 0 = ถึงคิวเราแล้ว · ตัวเลข = รออีกกี่คิว · — = ไม่อยู่ในคิวแล้ว
function queueCellHtml(d) {
    var n = queueAhead(d);
    if (n === null) return '<div class="qcell qcell-none">—</div>';
    if (n === 0)    return '<div class="qcell qcell-now">ถึงคิวแล้ว</div>';
    return '<div class="qcell tabular">รออีก <b>' + n + '</b> คิว</div>';
}

function renderRows() {
    var rowsEl = document.getElementById('rows');
    var list = SUBMISSIONS.filter(function (d) {
        return matchesQuery(d) && matchesDirection(d) && matchesStatus(d);
    });

    document.getElementById('listMeta').textContent = 'แสดง ' + list.length + ' จาก ' + SUBMISSIONS.length + ' รายการ';

    // หัวคอลัมน์ปรับตามรายการที่แสดงจริง:
    //   ส่งออกอย่างเดียว → "ผู้รับ" | รับเข้าอย่างเดียว → "ผู้ส่ง" | ปนกัน → "ผู้ส่ง / ผู้รับ" + ใส่ จาก/ถึง รายแถว
    var nSent = 0, nReceived = 0;
    list.forEach(function (d) {
        if (currentUser && currentUser.id === d.sender) nSent++; else nReceived++;
    });
    var mixed = nSent > 0 && nReceived > 0;
    var headEl = document.getElementById('colWhoHead');
    if (headEl) {
        headEl.textContent = !list.length
            ? (currentUser.role === 'admin' ? 'ผู้ส่ง' : 'ผู้รับ')   // ลิสต์ว่าง → อิง role
            : (mixed ? 'ผู้ส่ง / ผู้รับ' : (nSent ? 'ผู้รับ' : 'ผู้ส่ง'));
    }

    if (!list.length) {
        rowsEl.innerHTML = '<div class="empty">ยังไม่มีรายการที่ตรงกับเงื่อนไข</div>';
        return;
    }

    rowsEl.innerHTML = list.map(function (d) {
        var st = STATUS[d.status] || STATUS.queue;
        var cp = counterparty(d);
        var prefix = mixed ? (cp.iAmSender ? 'ถึง ' : 'จาก ') : '';
        var dl = deadlineInfo(d);
        var dlHtml = dl
            ? '<div class="due due-' + dl.level + ' tabular">' + formatDate(d.deadline) +
              (dl.note ? '<span class="due-note">' + dl.note + '</span>' : '') + '</div>'
            : '<div class="due due-none">—</div>';
        return '<button class="row" data-id="' + d.id + '">' +
            '<div class="date tabular">' + formatDate(d.created) + '<span class="time">' + formatTime(d.created) + '</span></div>' +
            '<div class="topic">' + escapeHtml(d.topic) + revisionBadge(d) + '<span class="code">' + deriveCode(d) + '</span></div>' +
            '<div class="who">' + escapeHtml(prefix + cp.name) + '</div>' +
            queueCellHtml(d) +
            dlHtml +
            '<div class="chip ' + st.cls + '"><span class="dot"></span>' + st.label + '</div>' +
            '<div class="chev"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"></polyline></svg></div>' +
            '</button>';
    }).join('');

    Array.prototype.forEach.call(rowsEl.querySelectorAll('.row'), function (row) {
        row.addEventListener('click', function () { openDetail(row.getAttribute('data-id')); });
    });
}

// ---------- detail ----------
function findSubmission(id) {
    for (var i = 0; i < SUBMISSIONS.length; i++) if (SUBMISSIONS[i].id === id) return SUBMISSIONS[i];
    return null;
}

function openDetail(id) {
    var d = findSubmission(id);
    if (!d) return;
    listState.openId = id;
    var st = STATUS[d.status] || STATUS.queue;
    var isRecipient = currentUser.id === d.recipient;
    var isSender = currentUser.id === d.sender;
    var dl = deadlineInfo(d);

    var fileHtml = d.file
        ? fileChipHtml(pb.files.getURL(d, d.file), d.file)
        : '<div style="color:var(--ink-faint);font-size:13px;">ไม่มีไฟล์แนบ</div>';

    // segment เปลี่ยนสถานะ — เฉพาะ recipient ของเรื่องนี้เท่านั้น
    var statusSwitchHtml = '';
    if (isRecipient) {
        var segHtml = Object.keys(STATUS).map(function (key) {
            return '<button class="seg ' + STATUS[key].cls + (d.status === key ? ' is-active' : '') + '" data-set="' + key + '">' + STATUS[key].label + '</button>';
        }).join('');
        statusSwitchHtml = '<div class="status-switch"><span class="s-label">เปลี่ยนสถานะ</span>' + segHtml + '</div>';
    }

    // งานถูกตีกลับ → ผู้ส่งกดส่งกลับเข้าคิวได้เอง
    // ไม่งั้นงานจะค้างอยู่เฉยๆ ผู้ตรวจไม่มีทางรู้ว่าแก้เสร็จแล้ว (ตอบในกระทู้อย่างเดียวไม่มีอะไรเตือน)
    var resubmitHtml = '';
    if (isSender && d.status === 'returned') {
        resubmitHtml = '<div class="resubmit-bar">' +
            '<div class="rs-text"><strong>งานนี้ถูกตีกลับให้แก้ไข</strong>' +
            'แก้เสร็จแล้วให้แนบไฟล์ใหม่ในกระทู้ด้านล่างก่อน แล้วค่อยกดปุ่มนี้เพื่อส่งกลับเข้าคิว</div>' +
            '<button class="btn btn-primary" id="resubmitBtn" type="button">ส่งงานที่แก้แล้ว</button>' +
            '</div>';
    }

    // ส่งต่อให้ผู้ตรวจคนอื่น — เฉพาะ recipient ปัจจุบัน (server บังคับซ้ำด้วย updateRule + hook)
    // ADMINS ไม่มีตัวเอง (adminRecipientFilter ตัดออก) → รายการที่ขึ้นคือคนอื่นล้วน
    var reassignHtml = '';
    if (isRecipient && ADMINS.length) {
        reassignHtml = '<div class="status-switch"><span class="s-label">ส่งต่อให้</span>' +
            '<select id="reassignSelect" class="auth-input" style="max-width:260px;margin:0;">' +
                '<option value="">— เลือกผู้ตรวจคนใหม่ —</option>' +
                ADMINS.map(function (a) {
                    return '<option value="' + a.id + '">' + escapeHtml(displayName(a)) + '</option>';
                }).join('') +
            '</select>' +
            '<button class="btn" id="reassignBtn" type="button">ส่งต่อ</button>' +
            '</div>';
    }

    document.getElementById('detailView').innerHTML =
        '<button class="back-link" id="backBtn"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><polyline points="15 18 9 12 15 6"></polyline></svg>กลับไปหน้ารายการ</button>' +
        '<div class="doc-card">' +
            '<div class="doc-head">' +
                '<div>' +
                    '<div class="eyebrow">' + deriveCode(d) + '</div>' +
                    '<h2>' + escapeHtml(d.topic) + '</h2>' +
                    '<div class="doc-meta-row">' +
                        '<span class="item"><span class="avatar" style="width:27px;height:27px;font-size:10.5px;">' + escapeHtml(initials(senderName(d))) + '</span>' + escapeHtml(senderName(d)) + '</span>' +
                        '<span class="item">→ ' + escapeHtml(recipientName(d)) + '</span>' +
                        '<span class="item tabular">ส่งเมื่อ ' + formatDate(d.created) + ' ' + formatTime(d.created) + '</span>' +
                        (dl ? '<span class="item tabular due due-' + dl.level + '">กำหนดส่ง ' + formatDate(d.deadline) +
                              (dl.note ? ' (' + dl.note + ')' : '') + '</span>' : '') +
                    '</div>' +
                    '<div class="queue-note" id="queueNote"></div>' +
                '</div>' +
                '<div class="stamp ' + st.cls + '"><span class="txt">' + st.label + '</span></div>' +
            '</div>' +
            statusSwitchHtml +
            reassignHtml +
            resubmitHtml +
            '<div class="doc-body">' +
                '<div><div class="field-label">รายละเอียด</div><div class="desc-text">' + (d.description ? escapeHtml(d.description) : '<span style="color:var(--ink-faint)">— ไม่มีรายละเอียด —</span>') + '</div></div>' +
                '<div><div class="field-label">ไฟล์ที่แนบมา</div>' + fileHtml + '</div>' +
                '<hr class="divider">' +
                '<div><div class="field-label">การตอบกลับ</div><div class="thread" id="threadEl"><div style="color:var(--ink-faint);font-size:13px;">กำลังโหลด...</div></div></div>' +
                '<div class="composer">' +
                    '<textarea id="replyText" placeholder="พิมพ์ข้อความตอบกลับ..."></textarea>' +
                    '<div class="composer-row">' +
                        '<label class="attach-btn">' +
                            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>' +
                            '<span id="replyFileLabel">แนบไฟล์</span>' +
                            '<input type="file" id="replyFile" hidden>' +
                        '</label>' +
                        '<button class="btn btn-primary" id="replySendBtn" type="button">ส่งคำตอบ</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';

    // wire actions
    document.getElementById('backBtn').addEventListener('click', closeDetail);
    if (isRecipient) {
        Array.prototype.forEach.call(document.querySelectorAll('#detailView .seg'), function (btn) {
            btn.addEventListener('click', function () { changeStatus(d.id, btn.getAttribute('data-set')); });
        });
    }
    var resubmitBtn = document.getElementById('resubmitBtn');
    if (resubmitBtn) resubmitBtn.addEventListener('click', function () { resubmitSubmission(d.id); });

    var reassignBtn = document.getElementById('reassignBtn');
    if (reassignBtn) reassignBtn.addEventListener('click', function () { reassignSubmission(d.id); });

    var replyFile = document.getElementById('replyFile');
    replyFile.addEventListener('change', function () {
        document.getElementById('replyFileLabel').textContent = replyFile.files.length ? cleanFileName(replyFile.files[0].name) : 'แนบไฟล์';
    });
    document.getElementById('replySendBtn').addEventListener('click', function () { submitReply(d.id); });

    loadAndRenderThread(d.id);
    renderQueueNote(d);

    document.getElementById('listView').classList.add('hidden');
    document.getElementById('detailView').classList.remove('hidden');
    window.scrollTo(0, 0);
}

// ผู้ส่งกดส่งงานที่แก้แล้วกลับเข้าคิว — สถานะกลับเป็น "รอดำเนินการ" และไปต่อท้ายแถว
// (server เป็นคนตั้ง queuedAt ใหม่ + นับ revision ให้เอง ฝั่งนี้ส่งแค่ status)
function resubmitSubmission(id) {
    var btn = document.getElementById('resubmitBtn');
    if (!confirm('ส่งงานที่แก้แล้วกลับเข้าคิว?\n\nงานจะไปต่อท้ายคิวของผู้ตรวจ และผู้ตรวจจะเห็นว่าเป็นงานที่ส่งแก้กลับมา\n\nอย่าลืมแนบไฟล์ที่แก้แล้วในกระทู้ก่อน')) return;

    btn.disabled = true;
    _savingInProgress = true;
    pb.collection('submissions').update(id, { status: 'queue' }, { requestKey: 'resubmit' })
        .then(function () {
            _savingInProgress = false;
            return refreshList();
        })
        .then(function () {
            if (listState.openId) openDetail(listState.openId);   // วาดหน้า detail ใหม่ให้ปุ่มหาย
        })
        .catch(function (err) {
            _savingInProgress = false;
            btn.disabled = false;
            console.error('ส่งกลับเข้าคิวไม่สำเร็จ:', err);
            alert(apiErrorMessage(err, 'ส่งกลับเข้าคิวไม่สำเร็จ'));
        });
}

// ส่งต่องานให้ผู้ตรวจคนอื่น — พอส่งต่อแล้วเราจะหลุดสิทธิ์ทันที (list rule ไม่เห็นเรื่องนี้อีก)
// จึงต้องปิดหน้า detail แล้วโหลดรายการใหม่ ไม่งั้นค้างอยู่หน้าที่กดอะไรก็ 404
function reassignSubmission(id) {
    var sel = document.getElementById('reassignSelect');
    var btn = document.getElementById('reassignBtn');
    var newId = sel.value;
    if (!newId) { alert('กรุณาเลือกผู้ตรวจคนใหม่'); return; }

    var name = sel.options[sel.selectedIndex].text;
    if (!confirm('ส่งต่องานนี้ให้ ' + name + ' ?\n\nหลังส่งต่อแล้วคุณจะไม่เห็นเรื่องนี้อีก')) return;

    btn.disabled = true;
    _savingInProgress = true;
    pb.collection('submissions').update(id, { recipient: newId }, { requestKey: 'reassign' })
        .then(function () {
            _savingInProgress = false;
            closeDetail();
            return refreshList();
        })
        .catch(function (err) {
            _savingInProgress = false;
            btn.disabled = false;
            console.error('ส่งต่อไม่สำเร็จ:', err);
            alert(apiErrorMessage(err, 'ส่งต่อไม่สำเร็จ'));
        });
}

function closeDetail() {
    listState.openId = null;
    document.getElementById('detailView').classList.add('hidden');
    document.getElementById('listView').classList.remove('hidden');
}

function loadAndRenderThread(submissionId) {
    pb.collection('submission_replies').getFullList({
        filter: 'submission = "' + submissionId + '"',
        sort: 'created',
        expand: 'author'
    }).then(function (replies) {
        if (listState.openId !== submissionId) return; // ผู้ใช้ปิด detail ไปแล้ว
        var threadEl = document.getElementById('threadEl');
        if (!threadEl) return;
        if (!replies.length) {
            threadEl.innerHTML = '<div style="color:var(--ink-faint);font-size:13px;padding:4px 2px;">ยังไม่มีการตอบกลับ</div>';
            return;
        }
        threadEl.innerHTML = replies.map(function (t) {
            var name = displayName(t.expand && t.expand.author);
            var fileHtml = t.file ? fileChipHtml(pb.files.getURL(t, t.file), t.file) : '';
            return '<div class="thread-item">' +
                '<span class="avatar">' + escapeHtml(initials(name)) + '</span>' +
                '<div class="thread-bubble">' +
                    '<div class="th-head"><span class="name">' + escapeHtml(name) + '</span><span class="time tabular">' + formatDateTime(t.created) + '</span></div>' +
                    (t.message ? '<div class="msg">' + escapeHtml(t.message) + '</div>' : '') +
                    fileHtml +
                '</div></div>';
        }).join('');
    }).catch(function (err) { console.error('โหลดการตอบกลับไม่สำเร็จ:', err); });
}

// ---------- queue feature ----------
function renderQueueNote(d) {
    var el = document.getElementById('queueNote');
    if (!el) return;
    // แสดงเฉพาะฝั่งผู้ส่ง และเฉพาะงานที่ยังค้าง (queue/review)
    if (currentUser.id !== d.sender || (d.status !== 'queue' && d.status !== 'review')) {
        el.textContent = '';
        return;
    }
    pb.collection('submission_queue').getList(1, 1, {
        filter: 'recipient = "' + d.recipient + '" && (status = "queue" || status = "review") && created < "' + d.created + '"',
        skipTotal: false,
        requestKey: 'queuePosition'
    }).then(function (res) {
        if (listState.openId !== d.id) return;
        el.textContent = res.totalItems > 0
            ? 'มีงานอยู่ก่อนหน้าคุณอีก ' + res.totalItems + ' รายการในคิวของผู้รับคนนี้'
            : 'งานของคุณอยู่ต้นคิวของผู้รับคนนี้';
    }).catch(function (err) { console.error('นับคิวไม่สำเร็จ:', err); });
}

function getAdminQueueCount(adminId) {
    // requestKey ต่อ adminId — ไม่งั้นการนับของ admin แต่ละคนที่ยิงพร้อมกันจะยกเลิกกันเองจนเหลือคนสุดท้าย
    return pb.collection('submission_queue').getList(1, 1, {
        filter: 'recipient = "' + adminId + '" && (status = "queue" || status = "review")',
        skipTotal: false,
        requestKey: 'queueCount_' + adminId
    }).then(function (res) { return res.totalItems; }).catch(function () { return null; });
}

// ---------- new submission modal ----------
function openNewModal() {
    document.getElementById('newTopic').value = '';
    document.getElementById('newDescription').value = '';
    document.getElementById('newFile').value = '';
    document.getElementById('newDeadline').value = '';
    document.getElementById('newFileLabel').textContent = 'แนบไฟล์ (ไม่บังคับ)';
    document.getElementById('newError').style.display = 'none';

    var sel = document.getElementById('newRecipient');
    sel.innerHTML = '<option value="">— กำลังโหลดรายชื่อผู้รับ —</option>';
    document.getElementById('newModal').classList.remove('hidden');

    pb.collection('users').getFullList({ filter: adminRecipientFilter(), sort: 'displayName', requestKey: 'adminsForPicker' }).then(function (admins) {
        ADMINS = admins;
        if (!admins.length) {
            sel.innerHTML = '<option value="">— ยังไม่มีผู้รับในระบบ —</option>';
            return;
        }
        sel.innerHTML = '<option value="">— เลือกผู้รับ —</option>' + admins.map(function (a) {
            return '<option value="' + a.id + '">' + escapeHtml(displayName(a)) + '</option>';
        }).join('');
        // เติมจำนวนงานค้างต่อท้ายแต่ละชื่อ (ไม่เห็นเนื้อหา เห็นแค่จำนวน)
        admins.forEach(function (a, idx) {
            getAdminQueueCount(a.id).then(function (n) {
                var opt = sel.options[idx + 1];
                if (opt && n != null) opt.textContent = displayName(a) + '  —  ค้าง ' + n + ' งาน';
            });
        });
    });
}

function closeNewModal() {
    document.getElementById('newModal').classList.add('hidden');
}

function submitNew() {
    var topic = document.getElementById('newTopic').value.trim();
    var description = document.getElementById('newDescription').value.trim();
    var recipient = document.getElementById('newRecipient').value;
    var deadline = document.getElementById('newDeadline').value;   // 'YYYY-MM-DD' หรือ ''
    var fileInput = document.getElementById('newFile');
    var errorEl = document.getElementById('newError');

    if (!topic) { showNewError('กรุณากรอกหัวข้อ'); return; }
    if (!recipient) { showNewError('กรุณาเลือกผู้รับ'); return; }

    var fd = new FormData();
    fd.append('topic', topic);
    fd.append('description', description);
    fd.append('sender', currentUser.id);
    fd.append('recipient', recipient);
    fd.append('status', 'queue');
    if (deadline) fd.append('deadline', deadline);
    if (fileInput.files.length) fd.append('file', fileInput.files[0]);

    var btn = document.getElementById('newSubmitBtn');
    btn.disabled = true;
    _savingInProgress = true;
    pb.collection('submissions').create(fd, { requestKey: 'new-submission' }).then(function () {
        _savingInProgress = false;
        btn.disabled = false;
        closeNewModal();
        return refreshList();
    }).catch(function (err) {
        _savingInProgress = false;
        btn.disabled = false;
        console.error('ส่งงานไม่สำเร็จ:', err);
        showNewError('ส่งงานไม่สำเร็จ — ลองใหม่อีกครั้ง');
    });
}

function showNewError(msg) {
    var el = document.getElementById('newError');
    el.textContent = msg;
    el.style.display = 'block';
}

// ---------- reply ----------
function submitReply(submissionId) {
    var text = document.getElementById('replyText').value.trim();
    var fileInput = document.getElementById('replyFile');
    if (!text && !fileInput.files.length) return; // ไม่มีอะไรจะส่ง

    var fd = new FormData();
    fd.append('submission', submissionId);
    fd.append('author', currentUser.id);
    fd.append('message', text);
    if (fileInput.files.length) fd.append('file', fileInput.files[0]);

    var btn = document.getElementById('replySendBtn');
    btn.disabled = true;
    _savingInProgress = true;
    pb.collection('submission_replies').create(fd, { requestKey: 'new-reply' }).then(function () {
        _savingInProgress = false;
        btn.disabled = false;
        document.getElementById('replyText').value = '';
        fileInput.value = '';
        document.getElementById('replyFileLabel').textContent = 'แนบไฟล์';
        loadAndRenderThread(submissionId);
    }).catch(function (err) {
        _savingInProgress = false;
        btn.disabled = false;
        console.error('ส่งคำตอบไม่สำเร็จ:', err);
        alert('ส่งคำตอบไม่สำเร็จ');
    });
}

// ---------- status change (recipient only) ----------
function changeStatus(submissionId, newStatus) {
    _savingInProgress = true;
    pb.collection('submissions').update(submissionId, { status: newStatus }, { requestKey: 'status-' + submissionId })
        .then(function () {
            _savingInProgress = false;
            return refreshList();
        }).then(function () {
            if (listState.openId === submissionId) openDetail(submissionId);
        }).catch(function (err) {
            _savingInProgress = false;
            console.error('เปลี่ยนสถานะไม่สำเร็จ:', err);
            alert('เปลี่ยนสถานะไม่สำเร็จ');
        });
}

// ---------- realtime ----------
function subscribeRealtime() {
    unsubscribeAll();
    pb.collection('submissions').subscribe('*', function () {
        if (_savingInProgress) return; // ข้าม echo จากการเขียนของเราเอง
        refreshList();
    }).then(function (unsub) { _unsubSubmissions = unsub; });

    pb.collection('submission_replies').subscribe('*', function (e) {
        if (_savingInProgress) return;
        if (listState.openId && e.record && e.record.submission === listState.openId) {
            loadAndRenderThread(listState.openId);
        }
    }).then(function (unsub) { _unsubReplies = unsub; });
}

function unsubscribeAll() {
    if (_unsubSubmissions) { _unsubSubmissions(); _unsubSubmissions = null; }
    if (_unsubReplies) { _unsubReplies(); _unsubReplies = null; }
}

// โหลดใหม่ + re-render list (และ detail ถ้าเปิดอยู่)
function refreshList() {
    return loadSubmissions().then(function () {
        renderRail();
        renderRows();
        if (listState.openId && !findSubmission(listState.openId)) closeDetail();
    });
}
