// ============================================================
// Auth — login / signup / logout
// pattern จาก dashboard เดิม (sut-physics-nas/js/auth.js) แต่ตัด pending-approval
// screen ทิ้ง: ระบบนี้สมัครแล้วใช้งานได้ทันที (role 'user', status 'approved')
// santa เลื่อนคนเป็น admin เองผ่าน PocketBase Admin UI
// ============================================================

// ชื่อผู้ใช้ไม่แคร์ตัวใหญ่ตัวเล็ก — เก็บและใช้เป็นตัวเล็กเสมอ
// (ก่อนหน้านี้ "Yip" กับ "yip" กลายเป็นคนละบัญชี เพราะถูกแปลงเป็นอีเมลคนละตัว)
function normalizeUsername(username) {
    return (username || '').trim().toLowerCase();
}

function usernameToIdentity(username) {
    var u = normalizeUsername(username);
    return u.indexOf('@') >= 0 ? u : u + FAKE_EMAIL_DOMAIN;
}

function setCurrentUserFromRecord(user) {
    currentUser = {
        id: user.id,
        username: user.username,
        role: user.role || 'user',
        displayName: user.displayName || user.username,
        status: user.status || 'approved'
    };
}

function checkLogin() {
    // SDK เก็บ token ใน localStorage อัตโนมัติ — rehydrate ตอนโหลดหน้า
    // NB: isValid เช็คแค่วันหมดอายุ ไม่ได้เช็คว่า token ยังใช้ได้จริง
    // (เช่น server ถูก restore/สร้างใหม่ หรือ user ถูกลบ → token ค้างแต่ใช้ไม่ได้)
    // ต้องยืนยันกับ server ก่อน ไม่งั้นจะค้างในแอปที่พังและกลับไปหน้า login ไม่ได้
    if (pb.authStore.isValid && pb.authStore.record) {
        pb.collection('users').authRefresh().then(function (authData) {
            setCurrentUserFromRecord(authData.record);
            showApp();
        }).catch(function () {
            pb.authStore.clear();          // token ใช้ไม่ได้ → ล้างทิ้ง
            showAuthScreen('login');
        });
    } else {
        showAuthScreen('login');
    }
}

// ---------- สลับหน้าจอ login / signup ----------
function showAuthScreen(which) {
    document.getElementById('appContent').classList.add('hidden');
    document.getElementById('pendingScreen').classList.add('hidden');
    document.getElementById('loginScreen').classList.toggle('hidden', which !== 'login');
    document.getElementById('signupScreen').classList.toggle('hidden', which !== 'signup');
    var le = document.getElementById('loginError');
    var se = document.getElementById('signupError');
    if (le) le.style.display = 'none';
    if (se) se.style.display = 'none';
}

// ---------- หน้าจอรออนุมัติ (ผู้ใช้ที่ยังไม่ approved) ----------
function showPendingScreen() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('signupScreen').classList.add('hidden');
    document.getElementById('appContent').classList.add('hidden');
    document.getElementById('pendingScreen').classList.remove('hidden');
    var nameEl = document.getElementById('pendingName');
    if (nameEl) nameEl.textContent = currentUser.displayName;
}

// เช็คสถานะอีกครั้ง (หลัง santa อนุมัติ ผู้ใช้กดเองได้โดยไม่ต้อง login ใหม่)
function recheckApproval() {
    var btn = document.getElementById('recheckBtn');
    if (btn) btn.disabled = true;
    pb.collection('users').authRefresh().then(function (authData) {
        setCurrentUserFromRecord(authData.record);
        if (btn) btn.disabled = false;
        if (currentUser.status === 'approved') {
            showApp();
        } else {
            var hint = document.getElementById('pendingHint');
            if (hint) { hint.textContent = 'ยังรออนุมัติอยู่ — ลองใหม่อีกครั้งภายหลัง'; hint.style.display = 'block'; }
        }
    }).catch(function () { if (btn) btn.disabled = false; });
}

function attemptLogin() {
    var username = document.getElementById('usernameInput').value;
    var password = document.getElementById('passwordInput').value;
    var errorEl = document.getElementById('loginError');

    if (!username.trim() || !password) {
        errorEl.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
        errorEl.style.display = 'block';
        return;
    }

    // ลองด้วยชื่อตัวเล็กก่อน ถ้าไม่ผ่านค่อยลองตามที่พิมพ์มาจริง —
    // เผื่อมีบัญชีเก่าที่ถูกสร้างด้วยตัวใหญ่ไว้ (เช่นสร้างจาก Admin UI) จะได้ยัง login ได้
    var raw = username.trim();
    var identity = usernameToIdentity(username);
    var rawIdentity = raw.indexOf('@') >= 0 ? raw : raw + FAKE_EMAIL_DOMAIN;

    pb.collection('users').authWithPassword(identity, password)
        .catch(function (err) {
            if (rawIdentity === identity) throw err;
            return pb.collection('users').authWithPassword(rawIdentity, password);
        })
        .then(function (authData) {
            setCurrentUserFromRecord(authData.record);
            errorEl.style.display = 'none';
            showApp();
        })
        .catch(function (err) {
            console.error('Login error:', err);
            errorEl.textContent = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
            errorEl.style.color = '';       // ล้างสีเขียวจากข้อความ "ตั้งรหัสใหม่สำเร็จ" ถ้ามี
            errorEl.style.display = 'block';
            document.getElementById('passwordInput').value = '';
        });
}

function submitSignup() {
    var username = normalizeUsername(document.getElementById('signupUsernameInput').value);
    var firstName = document.getElementById('signupFirstNameInput').value.trim();
    var lastName = document.getElementById('signupLastNameInput').value.trim();
    var password = document.getElementById('signupPasswordInput').value;
    var passwordConfirm = document.getElementById('signupPasswordConfirmInput').value;
    var errorEl = document.getElementById('signupError');

    // เก็บลง displayName ช่องเดียวเหมือนเดิม แค่แยกช่องกรอกให้ไม่สับสนกับ username
    var displayName = (firstName + ' ' + lastName).trim();

    if (!username || !firstName || !lastName || !password) {
        errorEl.textContent = 'กรุณากรอกข้อมูลให้ครบทุกช่อง';
        errorEl.style.display = 'block';
        return;
    }
    if (/\s/.test(username)) {
        errorEl.textContent = 'ชื่อผู้ใช้ห้ามมีเว้นวรรค';
        errorEl.style.display = 'block';
        return;
    }
    if (password.length < 8) {
        errorEl.textContent = 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร';
        errorEl.style.display = 'block';
        return;
    }
    if (password !== passwordConfirm) {
        errorEl.textContent = 'รหัสผ่านทั้งสองช่องไม่ตรงกัน';
        errorEl.style.display = 'block';
        return;
    }

    pb.collection('users').create({
        username: username,
        email: usernameToIdentity(username),
        password: password,
        passwordConfirm: passwordConfirm,
        displayName: displayName,
        role: 'user',        // สมัครเป็น user เสมอ (server บังคับซ้ำผ่าน createRule)
        status: 'pending'    // ต้องรอ santa อนุมัติก่อนถึงส่งงานได้ (กันคนหลงเข้ามายิงมั่ว)
    }).then(function () {
        return pb.collection('users').authWithPassword(usernameToIdentity(username), password);
    }).then(function (authData) {
        setCurrentUserFromRecord(authData.record);
        errorEl.style.display = 'none';
        showApp();
    }).catch(function (err) {
        console.error('Signup error:', err);
        var msg = 'สมัครสมาชิกไม่สำเร็จ';
        if (err.data && err.data.data && err.data.data.username) {
            msg = 'ชื่อผู้ใช้ "' + username + '" มีอยู่แล้ว';
        }
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    });
}

function showApp() {
    // ยังไม่ได้รับอนุมัติ → หน้ารออนุมัติ ไม่เปิดแอป
    if (currentUser.status !== 'approved') {
        showPendingScreen();
        return;
    }
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('signupScreen').classList.add('hidden');
    document.getElementById('pendingScreen').classList.add('hidden');
    document.getElementById('appContent').classList.remove('hidden');

    // แสดงชื่อ + role ที่มุมขวาบน
    var nameEl = document.getElementById('userDisplayName');
    var roleEl = document.getElementById('userDisplayRole');
    var avatarEl = document.getElementById('userAvatar');
    if (nameEl) nameEl.textContent = currentUser.displayName;
    if (roleEl) roleEl.textContent = currentUser.role === 'admin' ? 'ผู้ดูแล (ผู้รับงาน)' : 'ผู้ใช้งาน';
    if (avatarEl) avatarEl.textContent = initials(currentUser.displayName);

    initSubmissions();
    initAdminApproval();
}

// ============================================================
// ลืมรหัสผ่าน — ยื่นคำขอ → ผู้ดูแลอนุมัติ → ระบบตั้ง "รหัสกลาง" ให้
// เส้นทางนี้ต้องผ่าน custom route ใน pb_hooks เพราะ PocketBase บังคับขอรหัสเดิม
// เสมอเวลาเปลี่ยนรหัสผ่านผ่าน API ปกติ (คนที่ลืมรหัสจึงใช้ทางนั้นไม่ได้)
// ============================================================
var PWRESET_SENT_KEY = 'submit_pwreset_sent';   // ชื่อที่ยื่นคำขอไว้ (ไว้โชว์ตอนกลับมาเปิดซ้ำ)

function forgotError(msg, ok) {
    var el = document.getElementById('forgotError');
    el.textContent = msg;
    el.style.color = ok ? 'var(--st-complete)' : '';
    el.style.display = msg ? 'block' : 'none';
}

// อ่านข้อความ error ที่ hook ส่งมา (pb.send โยน ClientResponseError)
function apiErrorMessage(err, fallback) {
    if (err && err.response && err.response.message) return err.response.message;
    if (err && err.data && err.data.message) return err.data.message;
    return fallback;
}

function openForgotModal() {
    forgotError('');
    document.getElementById('forgotUsernameInput').value = '';

    var sentName = localStorage.getItem(PWRESET_SENT_KEY);
    document.getElementById('forgotStepRequest').classList.toggle('hidden', !!sentName);
    document.getElementById('forgotStepSent').classList.toggle('hidden', !sentName);
    document.getElementById('forgotSubmitBtn').style.display = sentName ? 'none' : '';
    document.getElementById('forgotPendingName').textContent = sentName || '—';

    document.getElementById('forgotModal').classList.remove('hidden');
    if (!sentName) document.getElementById('forgotUsernameInput').focus();
}

function closeForgotModal() {
    document.getElementById('forgotModal').classList.add('hidden');
}

function forgotRestart() {
    localStorage.removeItem(PWRESET_SENT_KEY);
    openForgotModal();
}

function submitForgot() {
    var username = normalizeUsername(document.getElementById('forgotUsernameInput').value);
    var btn = document.getElementById('forgotSubmitBtn');
    if (!username) return forgotError('กรุณากรอกชื่อผู้ใช้');

    btn.disabled = true;
    forgotError('');
    pb.send('/api/pwreset/request', { method: 'POST', body: { username: username } })
        .then(function (res) {
            localStorage.setItem(PWRESET_SENT_KEY, res.displayName || username);
            btn.disabled = false;
            openForgotModal();      // สลับไปหน้า "ส่งคำขอแล้ว"
        })
        .catch(function (err) {
            console.error('ขอรีเซ็ตรหัสผ่านไม่สำเร็จ:', err);
            btn.disabled = false;
            forgotError(apiErrorMessage(err, 'ส่งคำขอไม่สำเร็จ กรุณาลองใหม่'));
        });
}

// ---------- เมนูผู้ใช้ (กดที่ชื่อตัวเองมุมขวาบน) ----------
function closeUserMenu() {
    document.getElementById('userMenu').classList.add('hidden');
    document.getElementById('userMenuBtn').setAttribute('aria-expanded', 'false');
}

function toggleUserMenu(e) {
    if (e) e.stopPropagation();   // กันไม่ให้ handler ปิดเมนูบน document ทำงานทับทันที
    var menu = document.getElementById('userMenu');
    var open = menu.classList.toggle('hidden') === false;
    document.getElementById('userMenuBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
}

// ---------- เปลี่ยนรหัสผ่านของตัวเอง ----------
// server บังคับให้ส่ง oldPassword มาด้วยเสมอถ้าไม่ใช่ superuser
// (ทดสอบแล้ว: admin ตั้งรหัสให้คนอื่นไม่ได้ — โดน 400 validation_required)
function openPasswordModal() {
    closeUserMenu();
    document.getElementById('oldPasswordInput').value = '';
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('newPasswordConfirmInput').value = '';
    var err = document.getElementById('passwordError');
    err.style.display = 'none';
    err.style.color = '';
    document.getElementById('passwordModal').classList.remove('hidden');
    document.getElementById('oldPasswordInput').focus();
}

function closePasswordModal() {
    document.getElementById('passwordModal').classList.add('hidden');
}

function submitPasswordChange() {
    var oldPassword = document.getElementById('oldPasswordInput').value;
    var password = document.getElementById('newPasswordInput').value;
    var passwordConfirm = document.getElementById('newPasswordConfirmInput').value;
    var errorEl = document.getElementById('passwordError');
    var btn = document.getElementById('passwordSubmitBtn');

    function fail(msg) {
        errorEl.textContent = msg;
        errorEl.style.color = '';
        errorEl.style.display = 'block';
    }

    if (!oldPassword || !password || !passwordConfirm) return fail('กรุณากรอกข้อมูลให้ครบทุกช่อง');
    if (password.length < 8) return fail('รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร');
    if (password !== passwordConfirm) return fail('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    if (password === oldPassword) return fail('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');

    btn.disabled = true;
    errorEl.style.display = 'none';

    pb.collection('users').update(currentUser.id, {
        oldPassword: oldPassword,
        password: password,
        passwordConfirm: passwordConfirm
    }).then(function () {
        // PocketBase ยกเลิก token เดิมทิ้งหลังเปลี่ยนรหัส → ต้อง auth ใหม่ ไม่งั้นแอปค้าง
        return pb.collection('users').authWithPassword(usernameToIdentity(currentUser.username), password);
    }).then(function (authData) {
        setCurrentUserFromRecord(authData.record);
        btn.disabled = false;
        errorEl.textContent = 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว';
        errorEl.style.color = 'var(--st-complete)';
        errorEl.style.display = 'block';
        setTimeout(closePasswordModal, 1200);
    }).catch(function (err) {
        console.error('Change password error:', err);
        btn.disabled = false;
        var d = err.data && err.data.data;
        if (d && d.oldPassword) {
            fail('รหัสผ่านเดิมไม่ถูกต้อง');
        } else if (d && d.password) {
            fail('รหัสผ่านใหม่ไม่ผ่านเงื่อนไข: ' + d.password.message);
        } else {
            fail('เปลี่ยนรหัสผ่านไม่สำเร็จ กรุณาลองใหม่');
        }
    });
}

function logout() {
    unsubscribeAll();
    unsubscribeAdmin();
    pb.authStore.clear();
    currentUser = { id: '', username: '', role: '', displayName: '', status: '' };
    location.reload();
}
