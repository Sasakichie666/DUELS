// js/ui/matchUI.js
// 认输 / 胜负结果 / 继续对战·离开房间 —— 三个弹窗（★纯界面 ✓ 流程逻辑在 js/core/matchManager.js ✓）
//
// 对外接口：
//   MatchUI.confirmConcede()              侧栏「认输」→ 弹确认窗（确认 / 取消）
//   MatchUI.showResult(outcome, onAck)    胜负窗（★点确认 或 5 秒后自动 onAck ✓）
//   MatchUI.showChoose({ onVote })        继续对战 / 离开房间
//   MatchUI.showWaiting()                 我方已选继续 → 文案改"等待对方"
//   MatchUI.notifyOpponentWants()         对方已选继续 → 给我方提示
//   MatchUI.closeAll()                    关掉（重开 / 离开房间时必须调用 ✓）
//
// ★一次只显示一个窗（新窗会先 closeAll ✓），避免几个框叠在一起 ✗

(function (global) {
    let overlay = null;       // 当前窗
    let autoTimer = 0;        // 胜负窗的 5 秒自动跳转
    let tickTimer = 0;        // 倒计时刷新

    function clearTimers() {
        if (autoTimer) { clearTimeout(autoTimer); autoTimer = 0; }
        if (tickTimer) { clearInterval(tickTimer); tickTimer = 0; }
    }

    function closeAll() {
        clearTimers();
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
    }

    function build(cls, html) {
        closeAll();
        overlay = document.createElement('div');
        overlay.className = 'match-overlay ' + cls;
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        return overlay;
    }

    /* ================= ① 确认认输（确认 / 取消） ================= */

    function confirmConcede() {
        const box = build('match-confirm',
            '<div class="match-box">'
            + '  <div class="match-box-title">确认认输？</div>'
            + '  <div class="match-box-text">认输后本局立即判负，确定吗？</div>'
            + '  <div class="match-box-actions">'
            + '    <button type="button" class="match-btn match-btn-ghost" data-act="cancel">取消</button>'
            + '    <button type="button" class="match-btn match-btn-danger" data-act="ok">确认认输</button>'
            + '  </div>'
            + '</div>');

        box.querySelector('[data-act="cancel"]').addEventListener('click', (e) => {
            e.stopPropagation();
            closeAll();
        });
        box.querySelector('[data-act="ok"]').addEventListener('click', (e) => {
            e.stopPropagation();
            closeAll();
            if (global.MatchManager) global.MatchManager.concede();
        });
        // 点窗外 = 取消 ✓（认输不做成"点外面就当确认"✗）
        box.addEventListener('click', closeAll);
        box.querySelector('.match-box').addEventListener('click', (e) => e.stopPropagation());
    }

    /* ================= ② 胜负结果 ================= */
    // ★同一局里两端看到的字是相反的：我方判负 → 对方判胜 ✓（这正是需求 ✓）

    const RESULT = {
        win: { text: '胜利', icon: '🏆', sub: '对手认输' },
        lose: { text: '失败', icon: '💀', sub: '你已认输' }
    };

    function showResult(outcome, onAck) {
        const r = RESULT[outcome] || { text: '—', icon: '❔', sub: '' };
        let done = false;
        const go = () => {
            if (done) return;
            done = true;
            closeAll();
            if (onAck) onAck();
        };

        const box = build('match-result',
            '<div class="match-box match-box-result' + (outcome === 'win' ? ' is-win' : ' is-lose') + '">'
            + '  <div class="match-result-icon">' + r.icon + '</div>'
            + '  <div class="match-result-text">' + r.text + '</div>'
            + '  <div class="match-box-text">' + r.sub + '</div>'
            + '  <div class="match-box-actions">'
            + '    <button type="button" class="match-btn match-btn-primary" data-act="ok">'
            + '确认（<b class="match-cd">5</b>）</button>'
            + '  </div>'
            + '</div>');

        box.querySelector('[data-act="ok"]').addEventListener('click', (e) => {
            e.stopPropagation();
            go();
        });
        box.addEventListener('click', (e) => e.stopPropagation());   // 必须点按钮 ✓

        // ★倒计时 + 5 秒自动切换到"继续 / 离开"窗 ✓
        let left = 5;
        const cdEl = box.querySelector('.match-cd');
        tickTimer = setInterval(() => {
            left -= 1;
            if (cdEl) cdEl.textContent = String(Math.max(0, left));
            if (left <= 0) go();
        }, 1000);
        autoTimer = setTimeout(go, 5000);
    }

    /* ================= ③ 继续对战 / 离开房间 ================= */

    function showChoose(opts) {
        const o = opts || {};
        const box = build('match-choose',
            '<div class="match-box">'
            + '  <div class="match-box-title">再来一局？</div>'
            + '  <div class="match-box-text">双方都选「继续对战」→ 就在本房间重新开局；<br>'
            + '任一方选「离开房间」→ 双方回到大厅。</div>'
            + '  <div class="match-box-actions">'
            + '    <button type="button" class="match-btn match-btn-ghost" data-act="leave">离开房间</button>'
            + '    <button type="button" class="match-btn match-btn-primary" data-act="again">继续对战</button>'
            + '  </div>'
            + '  <div class="match-box-hint" data-role="hint"></div>'
            + '</div>');

        box.querySelector('[data-act="again"]').addEventListener('click', (e) => {
            e.stopPropagation();
            if (o.onVote) o.onVote(true);
            const hint = box.querySelector('[data-role="hint"]');
            if (hint) hint.textContent = '已选择「继续对战」，等待对方…';
        });
        box.querySelector('[data-act="leave"]').addEventListener('click', (e) => {
            e.stopPropagation();
            if (o.onVote) o.onVote(false);
        });
        box.addEventListener('click', (e) => e.stopPropagation());    // 必须做选择 ✓
    }

    /** 我方已经同意、在等对方 ✓ */
    function showWaiting() {
        if (!overlay) return;
        const hint = overlay.querySelector('[data-role="hint"]');
        if (hint) hint.textContent = '已选择「继续对战」，等待对方…';
    }

    /** 对方已经同意（我方还没选）→ 提示一下，别让人以为对方跑了 ✓ */
    function notifyOpponentWants() {
        if (!overlay) return;
        const hint = overlay.querySelector('[data-role="hint"]');
        if (hint) hint.textContent = '对方已选择「继续对战」✓';
    }

    global.MatchUI = {
        confirmConcede,
        showResult,
        showChoose,
        showWaiting,
        notifyOpponentWants,
        closeAll
    };
})(window);

