// ============================================================
// Admin-only — อนุมัติสมาชิกใหม่ (status: pending → approved)
// สิทธิ์ถูกบังคับที่ server ด้วย pb_hooks (admin แก้ได้แค่ status ของคนอื่น)
// ============================================================

// realtime handles ของฝั่ง admin (เก็บไว้ยกเลิกตอน logout)
var _unsubPendingUsers = null;
var _unsubPendingResets = null;

function initAdminApproval() {
    var btn = document.getElementById('approveBtn');
    if (currentUser.role !== 'admin') {
        btn.style.display = 'none';
        return;
    }
    btn.style.display = 'inline-flex';
    refreshPendingCount();

    // ตัวเลขบนปุ่มต้องขึ้นเองเมื่อมีคนสมัคร/ขอรีเซ็ตใหม่
    // (ไม่งั้น admin ไม่มีทางรู้จนกว่าจะ refresh หน้าเว็บ)
    if (!_unsubPendingUsers) {
        pb.collection('users').subscribe('*', function () { refreshPendingCount(); })
            .then(function (unsub) { _unsubPendingUsers = unsub; })
            .catch(function (err) { console.error('subscribe users ไม่สำเร็จ:', err); });
    }
    if (!_unsubPendingResets) {
        pb.collection('password_resets').subscribe('*', function () { refreshPendingCount(); })
            .then(function (unsub) { _unsubPendingResets = unsub; })
            .catch(function (err) { console.error('subscribe password_resets ไม่สำเร็จ:', err); });
    }
}

function unsubscribeAdmin() {
    if (_unsubPendingUsers) { _unsubPendingUsers(); _unsubPendingUsers = null; }
    if (_unsubPendingResets) { _unsubPendingResets(); _unsubPendingResets = null; }
}

// คำขอรีเซ็ตที่ยังไม่หมดอายุ (expiresAt เก็บเป็น ISO string → เทียบ string ตรงๆ ได้)
function activeResetFilter() {
    return 'expiresAt > "' + new Date().toISOString() + '"';
}

// ตัวเลขบนปุ่ม = สมาชิกรออนุมัติ + คำขอรีเซ็ตรหัสผ่านรออนุมัติ
function refreshPendingCount() {
    Promise.all([
        pb.collection('users').getList(1, 1, { filter: 'status = "pending"', skipTotal: false, requestKey: 'cntPendingUsers' }),
        pb.collection('password_resets').getList(1, 1, { filter: activeResetFilter(), skipTotal: false, requestKey: 'cntResets' })
    ]).then(function (r) {
        var total = r[0].totalItems + r[1].totalItems;
        var el = document.getElementById('approveCount');
        el.textContent = total;
        el.style.display = total > 0 ? '' : 'none';
    }).catch(function (err) { console.error('นับรายการรออนุมัติไม่สำเร็จ:', err); });
}

function approveRowHtml(id, kind, name, username, note) {
    return '<div class="approve-row" data-id="' + id + '" data-kind="' + kind + '">' +
        '<div class="ar-who">' +
            '<span class="avatar">' + escapeHtml(initials(name)) + '</span>' +
            '<div><div class="ar-name">' + escapeHtml(name) + '</div>' +
            '<div class="ar-user">@' + escapeHtml(username) + (note ? ' · ' + escapeHtml(note) : '') + '</div></div>' +
        '</div>' +
        '<button class="btn btn-primary ar-btn" data-id="' + id + '" data-kind="' + kind + '">อนุมัติ</button>' +
        '</div>';
}

// สลับ tab ในกล่องจัดการสมาชิก
function switchApproveTab(name) {
    ['members', 'password'].forEach(function (t) {
        var cap = t.charAt(0).toUpperCase() + t.slice(1);
        document.getElementById('tabBtn' + cap).classList.toggle('is-active', t === name);
        document.getElementById('tabPanel' + cap).classList.toggle('hidden', t !== name);
    });
}

function setTabCount(id, n) {
    var el = document.getElementById(id);
    el.textContent = n;
    el.classList.toggle('is-zero', n === 0);
}

function openApproveModal() {
    document.getElementById('tabPanelMembers').innerHTML =
        '<div style="color:var(--ink-faint);padding:8px 2px;">กำลังโหลด...</div>';
    document.getElementById('approveModal').classList.remove('hidden');
    switchApproveTab('members');
    resetSetPwForm();
    loadSetPwUsers();
    loadPendingLists();
}

// โหลด (หรือโหลดซ้ำ) ทั้งสองรายการ — สมาชิกรออนุมัติ + คำขอตั้งรหัส
function loadPendingLists() {
    return Promise.all([
        pb.collection('users').getFullList({ filter: 'status = "pending"', sort: 'created', requestKey: 'listPendingUsers' }),
        pb.collection('password_resets').getFullList({ filter: activeResetFilter(), sort: 'created', expand: 'user', requestKey: 'listResets' })
    ]).then(function (r) {
        var users = r[0], resets = r[1];

        setTabCount('tabCountMembers', users.length);
        setTabCount('tabCountPassword', resets.length);

        document.getElementById('tabPanelMembers').innerHTML = users.length
            ? users.map(function (u) {
                return approveRowHtml(u.id, 'user', u.displayName || u.username, u.username || '', '');
            }).join('')
            : '<div class="empty" style="padding:26px 10px;">ไม่มีสมาชิกรออนุมัติ</div>';

        Array.prototype.forEach.call(document.querySelectorAll('#tabPanelMembers .ar-btn'), function (b) {
            b.addEventListener('click', function () { approveUser(b.getAttribute('data-id'), b); });
        });

        renderPwRequestChips(resets);
    }).catch(function (err) {
        console.error('โหลดรายการรออนุมัติไม่สำเร็จ:', err);
        document.getElementById('tabPanelMembers').innerHTML = '<div class="empty">โหลดไม่สำเร็จ</div>';
    });
}

// คำขอตั้งรหัส = ชิปทางลัด กดแล้วเลือกคนนั้นในฟอร์มข้างล่างให้เลย
function renderPwRequestChips(resets) {
    var box = document.getElementById('pwRequestChips');
    if (!resets.length) {
        box.innerHTML = '<div class="pw-chips-empty">ยังไม่มีใครกดขอ — เลือกผู้ใช้จากช่องด้านล่างได้เลย</div>';
        return;
    }
    box.innerHTML = resets.map(function (rec) {
        var u = rec.expand && rec.expand.user;
        if (!u) return '';
        var name = u.displayName || u.username;
        return '<button class="pw-chip" type="button" data-user="' + u.id + '">' +
            '<span class="avatar">' + escapeHtml(initials(name)) + '</span>' +
            escapeHtml(name) +
            '<span class="when">' + escapeHtml(formatDateTime(rec.created)) + '</span>' +
            '</button>';
    }).join('');

    Array.prototype.forEach.call(box.querySelectorAll('.pw-chip'), function (c) {
        c.addEventListener('click', function () {
            document.getElementById('setPwUser').value = c.getAttribute('data-user');
            document.getElementById('setPwPassword').focus();
            document.getElementById('setPwPassword').select();
        });
    });
}

function approveUser(id, btn) {
    btn.disabled = true;
    pb.collection('users').update(id, { status: 'approved' })
        .then(function () {
            var row = document.querySelector('.approve-row[data-id="' + id + '"]');
            if (row) row.parentNode.removeChild(row);
            setTabCount('tabCountMembers', document.querySelectorAll('#tabPanelMembers .approve-row').length);
            refreshPendingCount();
        })
        .catch(function (err) {
            btn.disabled = false;
            console.error('อนุมัติไม่สำเร็จ:', err);
            alert('อนุมัติไม่สำเร็จ');
        });
}

// ---------- ผู้ดูแลตั้งรหัสให้ผู้ใช้ ----------
// `Physics0Sut` เป็นแค่ "ค่าตั้งต้น" ในช่องกรอก ไม่ใช่รหัสจริง —
// ต้องแก้ก่อนถึงกดได้ เพื่อให้แต่ละคนได้รหัสไม่ซ้ำกัน (server ปฏิเสธซ้ำอีกชั้น)
var PW_PLACEHOLDER = 'Physics0Sut';

function resetSetPwForm() {
    document.getElementById('setPwPassword').value = PW_PLACEHOLDER;
    document.getElementById('setPwResult').style.display = 'none';
    document.getElementById('setPwDone').classList.add('hidden');
    validateSetPw();
}

// ปุ่มกดไม่ได้จนกว่าจะแก้ค่าตั้งต้น (server เช็คซ้ำ — ที่นี่แค่บอกให้รู้ตัวก่อนกด)
function validateSetPw() {
    var v = document.getElementById('setPwPassword').value.trim();
    var hint = document.getElementById('setPwHint');
    var btn = document.getElementById('setPwBtn');
    var blocked = false, msg = '';

    if (v.toLowerCase() === PW_PLACEHOLDER.toLowerCase()) {
        blocked = true;
        msg = 'ต้องแก้ค่าตั้งต้นนี้ก่อน — เติมตัวเลขต่อท้าย หรือกดปุ่ม "สุ่ม" เพื่อให้แต่ละคนได้รหัสไม่ซ้ำกัน';
    } else if (v.length < 8) {
        blocked = true;
        msg = 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร';
    } else {
        msg = 'ตั้งเสร็จแล้วระบบจะแสดงรหัสให้คัดลอกไปบอกเจ้าตัว (ไม่ได้ผูกอีเมล จึงส่งให้อัตโนมัติไม่ได้)';
    }

    hint.textContent = msg;
    hint.classList.toggle('is-blocked', blocked);
    btn.disabled = blocked;
}

function randomSetPw() {
    var n = String(Math.floor(1000 + Math.random() * 9000));   // 4 หลัก ไม่ขึ้นต้นด้วย 0
    document.getElementById('setPwPassword').value = PW_PLACEHOLDER + n;
    validateSetPw();
}

// รายชื่อผู้ใช้ที่ตั้งรหัสให้ได้ (บัญชี admin ต้องให้ superuser ตั้งที่ Admin UI เท่านั้น)
function loadSetPwUsers() {
    var sel = document.getElementById('setPwUser');
    sel.innerHTML = '<option value="">กำลังโหลด...</option>';
    return pb.collection('users').getFullList({ filter: 'role != "admin"', sort: 'displayName', requestKey: 'setPwUserList' })
        .then(function (users) {
            if (!users.length) {
                sel.innerHTML = '<option value="">— ยังไม่มีผู้ใช้ทั่วไปในระบบ —</option>';
                return;
            }
            sel.innerHTML = users.map(function (u) {
                return '<option value="' + u.id + '">' + escapeHtml(u.displayName || u.username) +
                       ' (@' + escapeHtml(u.username || '') + ')</option>';
            }).join('');
        })
        .catch(function (err) {
            console.error('โหลดรายชื่อผู้ใช้ไม่สำเร็จ:', err);
            sel.innerHTML = '<option value="">โหลดไม่สำเร็จ</option>';
        });
}

function submitSetPassword() {
    var userId = document.getElementById('setPwUser').value;
    var password = document.getElementById('setPwPassword').value.trim();
    var resultEl = document.getElementById('setPwResult');
    var doneEl = document.getElementById('setPwDone');
    var btn = document.getElementById('setPwBtn');

    function fail(msg) {
        resultEl.textContent = msg;
        resultEl.style.display = 'block';
        doneEl.classList.add('hidden');
    }

    if (!userId) return fail('กรุณาเลือกผู้ใช้');

    btn.disabled = true;
    resultEl.style.display = 'none';
    doneEl.classList.add('hidden');

    pb.send('/api/pwreset/set', { method: 'POST', body: { userId: userId, password: password } })
        .then(function (res) {
            doneEl.innerHTML = 'ตั้งรหัสของ <strong>@' + escapeHtml(res.username || '') + '</strong> เป็น ' +
                '<code id="setPwDoneCode">' + escapeHtml(res.password || '') + '</code> ' +
                '<button class="btn btn-ghost" id="setPwCopyBtn" type="button">คัดลอก</button>' +
                '<div>บอกเจ้าตัวให้เข้าระบบแล้วเปลี่ยนรหัสทันที</div>';
            doneEl.classList.remove('hidden');
            document.getElementById('setPwCopyBtn').addEventListener('click', function () {
                var b = this;
                navigator.clipboard.writeText(res.password || '').then(function () {
                    b.textContent = 'คัดลอกแล้ว';
                }).catch(function () { b.textContent = 'คัดลอกไม่ได้'; });
            });

            document.getElementById('setPwPassword').value = PW_PLACEHOLDER;
            validateSetPw();
            loadPendingLists();      // คำขอของคนนี้ถูกลบที่ server แล้ว → ชิปหายไป
            refreshPendingCount();
        })
        .catch(function (err) {
            console.error('ตั้งรหัสผ่านไม่สำเร็จ:', err);
            btn.disabled = false;
            fail(apiErrorMessage(err, 'ตั้งรหัสผ่านไม่สำเร็จ'));
        });
}

function closeApproveModal() {
    document.getElementById('approveModal').classList.add('hidden');
}
