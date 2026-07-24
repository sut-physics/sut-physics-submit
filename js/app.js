// ============================================================
// Bootstrap — ผูก event ของ shell แล้วเช็ค session
// (feature files กำหนดฟังก์ชัน global ไว้แล้ว โหลดตามลำดับใน index.html)
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
    // --- auth screens ---
    document.getElementById('loginBtn').addEventListener('click', attemptLogin);
    document.getElementById('gotoSignup').addEventListener('click', function (e) { e.preventDefault(); showAuthScreen('signup'); });
    document.getElementById('gotoLogin').addEventListener('click', function (e) { e.preventDefault(); showAuthScreen('login'); });
    document.getElementById('signupBtn').addEventListener('click', submitSignup);

    // --- forgot password (ยื่นคำขอ → ผู้ดูแลอนุมัติ → ตั้งรหัสใหม่) ---
    document.getElementById('gotoForgot').addEventListener('click', function (e) { e.preventDefault(); openForgotModal(); });
    document.getElementById('forgotCloseBtn').addEventListener('click', closeForgotModal);
    document.getElementById('forgotOkBtn').addEventListener('click', closeForgotModal);
    document.getElementById('forgotModalBackdrop').addEventListener('click', closeForgotModal);
    document.getElementById('forgotSubmitBtn').addEventListener('click', submitForgot);
    document.getElementById('forgotRestart').addEventListener('click', function (e) { e.preventDefault(); forgotRestart(); });
    document.getElementById('forgotUsernameInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitForgot(); });

    // --- pending approval screen ---
    document.getElementById('recheckBtn').addEventListener('click', recheckApproval);
    document.getElementById('pendingLogout').addEventListener('click', function (e) { e.preventDefault(); logout(); });
    document.getElementById('pendingChangePw').addEventListener('click', function (e) { e.preventDefault(); openPasswordModal(); });

    // Enter เพื่อ login
    document.getElementById('passwordInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') attemptLogin();
    });

    // --- app shell ---
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('newBtn').addEventListener('click', openNewModal);

    // --- user menu (dropdown ที่ชื่อตัวเอง) ---
    document.getElementById('userMenuBtn').addEventListener('click', toggleUserMenu);
    document.addEventListener('click', closeUserMenu);          // คลิกที่อื่น = ปิด
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeUserMenu();
    });

    // --- change-password modal ---
    document.getElementById('changePwBtn').addEventListener('click', openPasswordModal);
    document.getElementById('passwordCloseBtn').addEventListener('click', closePasswordModal);
    document.getElementById('passwordCancelBtn').addEventListener('click', closePasswordModal);
    document.getElementById('passwordModalBackdrop').addEventListener('click', closePasswordModal);
    document.getElementById('newPasswordConfirmInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') submitPasswordChange();
    });
    document.getElementById('passwordSubmitBtn').addEventListener('click', submitPasswordChange);

    var searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', function () {
        listState.query = searchInput.value;
        renderRows();
    });

    // --- admin approval ---
    document.getElementById('approveBtn').addEventListener('click', openApproveModal);
    document.getElementById('approveCloseBtn').addEventListener('click', closeApproveModal);
    document.getElementById('approveModalBackdrop').addEventListener('click', closeApproveModal);
    document.getElementById('setPwBtn').addEventListener('click', submitSetPassword);
    document.getElementById('setPwRandomBtn').addEventListener('click', randomSetPw);
    document.getElementById('setPwPassword').addEventListener('input', validateSetPw);
    Array.prototype.forEach.call(document.querySelectorAll('.modal-tab'), function (t) {
        t.addEventListener('click', function () { switchApproveTab(t.getAttribute('data-tab')); });
    });

    // --- file preview modal ---
    document.getElementById('fpCloseBtn').addEventListener('click', closeFilePreview);
    document.getElementById('filePreviewBackdrop').addEventListener('click', closeFilePreview);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !document.getElementById('filePreviewModal').classList.contains('hidden')) {
            closeFilePreview();
        }
    });

    // --- new-submission modal ---
    document.getElementById('newSubmitBtn').addEventListener('click', submitNew);
    document.getElementById('newCancelBtn').addEventListener('click', closeNewModal);
    document.getElementById('newModalBackdrop').addEventListener('click', closeNewModal);
    var newFile = document.getElementById('newFile');
    newFile.addEventListener('change', function () {
        document.getElementById('newFileLabel').textContent = newFile.files.length ? cleanFileName(newFile.files[0].name) : 'แนบไฟล์ (ไม่บังคับ)';
    });

    // เริ่มต้น: เช็ค session ที่ค้างใน localStorage
    checkLogin();
});
