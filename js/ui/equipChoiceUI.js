// js/ui/equipChoiceUI.js
// 装备卡离场弹窗：装备者离开战场后，由【控制方】决定这张装备卡怎么处理 ✓
//
//   对外接口：
//     EquipChoiceUI.ask(card, opts, onChoose)   弹窗二选一
//          card            装备卡（显示名字用 ✓）
//          opts.hostName   装备者名字（显示用 ✓）
//          opts.canDrop    后场有没有空格 —— false 时「掉落」按钮置灰 ✓
//          onChoose(choice)   choice: 'drop'（掉落） | 'grave'（进墓）
//     EquipChoiceUI.close()                     收起当前窗（重开 / 离开房间时也调 ✓）
//
//   ★一次只显示一个窗（新的会先 close ✓）—— 多张装备卡时由调用方排队逐个问 ✓
//   ★点窗外 / 按 Esc = 「进墓」（默认去向 ✓ 安全：这条路任何时刻都合法 ✓）
//   ★纯界面：掉落怎么落地由 js/core/cardMover.js 决定 ✓（core 不该碰 DOM ✗）
//   ★样式复用大厅那套 .modal-mask / .modal（主题自适应 ✓ z-index 7000 盖住牌桌 ✓）

(function (global) {
    let overlay = null;
    let keyHandler = null;

    function close() {
        if (keyHandler) {
            document.removeEventListener('keydown', keyHandler, true);
            keyHandler = null;
        }
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        overlay = null;
    }

    function esc(text) {
        return String(text).replace(/[&<>"]/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
        ));
    }

    function nameOf(card) {
        return (card && card.cardData && card.cardData.name) || '装备卡';
    }

    /**
     * 弹窗问控制方：掉落 还是 进墓 ✓
     * @returns {boolean} true = 已弹出
     */
    function ask(card, opts, onChoose) {
        const options = opts || {};
        const hostName = options.hostName || '装备者';
        const canDrop = !!options.canDrop;
        close();

        overlay = document.createElement('div');
        overlay.className = 'modal-mask equip-choice';
        overlay.innerHTML =
            '<div class="modal modal-sm" role="dialog" aria-modal="true">'
            + '  <header class="modal-head"><h3>装备卡离场</h3></header>'
            + '  <p class="modal-hint">「' + esc(hostName) + '」离开战场，它身上的「'
            +        esc(nameOf(card)) + '」要怎么办？</p>'
            + '  <p class="modal-hint">'
            +      (canDrop ? '可以掉落到后场空格，也可以直接进墓场。' : '后场没有空格 → 只能进墓场。')
            + '  </p>'
            + '  <footer class="modal-foot">'
            + '    <button type="button" class="btn" data-act="grave">进墓场</button>'
            + '    <button type="button" class="btn btn-success" data-act="drop"'
            +        (canDrop ? '' : ' disabled') + '>掉落到后场空格</button>'
            + '  </footer>'
            + '</div>';
        document.body.appendChild(overlay);

        const done = (choice) => {
            close();
            if (typeof onChoose === 'function') onChoose(choice);
        };

        const graveBtn = overlay.querySelector('[data-act="grave"]');
        const dropBtn = overlay.querySelector('[data-act="drop"]');
        graveBtn.addEventListener('click', e => { e.stopPropagation(); done('grave'); });
        dropBtn.addEventListener('click', e => {
            e.stopPropagation();
            if (!canDrop) return;              // 置灰按钮：双保险（CSS 已 pointer-events:none ✓）
            done('drop');
        });

        // 点窗外 = 默认进墓 ✓
        overlay.addEventListener('click', () => done('grave'));
        overlay.querySelector('.modal').addEventListener('click', e => e.stopPropagation());

        keyHandler = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); done('grave'); }
        };
        document.addEventListener('keydown', keyHandler, true);
        return true;
    }

    global.EquipChoiceUI = { ask, close };
})(window);
