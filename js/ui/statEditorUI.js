// js/ui/statEditorUI.js
// 攻防修改弹窗（阶段4 拆分：从 core/menuAction.js 外迁 —— core 不该碰 DOM ✗）
//
//   StatEditorUI.open(card, anchorEl)      打开弹窗（− 值 + ／ 步长分段控件 ／ 点外部·Esc 关闭 ✓）
//   StatEditorUI.position(el, anchorEl)    浮层定位（统一走 UIKit ✓）
//
// 兼容：global.MenuAction.modifyStats 仍可用（内部转发到这里 ✓ 调用点零改动 ✓）
// 说明：数值修改本身由 StatManager 负责（它内部走 StateCommit.notify 同步给对方 ✓），
//       本模块只画弹窗 + 点完调 applyCardMarkers 让卡面立即反映 ✓

(function(global) {
    function notify(msg, type) {
        if (global.UI && global.UI.showNotification) global.UI.showNotification(msg, type || 'info');
    }

    /** 浮层定位：统一走 UIKit ✓ */
    function position(menuEl, anchorEl) {
        if (global.UIKit) global.UIKit.positionFloating(menuEl, anchorEl);
    }

    /** 打开「修改攻防」弹窗（同一时刻只留一个 ✓） */
    function open(card, anchorEl) {
        if (!card || !anchorEl) return;
        if (!card.cardData || card.cardData.type !== 'minion') {
            notify('只有随从卡可以修改攻防', 'warning');
            return;
        }

        const existing = document.querySelector('.stat-editor');
        if (existing) existing.remove();

        const StatManager = global.StatManager;
        const step = StatManager ? StatManager.getStep() : 1;

        const panel = document.createElement('div');
        panel.className = 'stat-editor';

        // ---- 头部：标题 + 卡名 ----
        const head = document.createElement('div');
        head.className = 'se-head';
        const title = document.createElement('span');
        title.className = 'se-title';
        title.textContent = '修改攻防';
        const name = document.createElement('span');
        name.className = 'se-name';
        name.textContent = card.cardData.name || '';
        head.append(title, name);
        panel.appendChild(head);

        // ---- 数值行：攻击 / 防御，各带 − 值 + ----
        const stats = document.createElement('div');
        stats.className = 'se-stats';
        const valueEls = {};

        const readValue = (key) => {
            if (key === 'attack') {
                return card.currentAttack != null ? card.currentAttack : (card.cardData.attack ?? 0);
            }
            return card.currentDefense != null ? card.currentDefense : (card.cardData.defense ?? 0);
        };

        [['攻击', 'attack', 'atk'], ['防御', 'defense', 'def']].forEach(([label, key, cls]) => {
            const row = document.createElement('div');
            row.className = `se-stat se-${cls}`;

            const k = document.createElement('span');
            k.className = 'se-k';
            k.textContent = label;

            const ctrl = document.createElement('div');
            ctrl.className = 'se-ctrl';

            const minus = document.createElement('button');
            minus.type = 'button';
            minus.className = 'se-btn se-minus';
            minus.textContent = '−';

            const val = document.createElement('span');
            val.className = 'se-val';

            const plus = document.createElement('button');
            plus.type = 'button';
            plus.className = 'se-btn se-plus';
            plus.textContent = '+';

            const apply = (sign) => {
                if (!StatManager) return;
                const delta = (StatManager.getStep() || 1) * sign;
                if (key === 'attack') StatManager.modifyAttack(card, delta);
                else StatManager.modifyDefense(card, delta);
                if (global.UI && global.UI.applyCardMarkers) global.UI.applyCardMarkers();
                refreshValues();
            };

            minus.addEventListener('click', (e) => { e.stopPropagation(); apply(-1); });
            plus.addEventListener('click', (e) => { e.stopPropagation(); apply(1); });

            ctrl.append(minus, val, plus);
            row.append(k, ctrl);
            stats.appendChild(row);
            valueEls[key] = val;
        });
        panel.appendChild(stats);

        // ---- 底部：步长选择（分段控件） ----
        const foot = document.createElement('div');
        foot.className = 'se-foot';
        const stepLabel = document.createElement('span');
        stepLabel.className = 'se-step-label';
        stepLabel.textContent = '步长';
        const steps = document.createElement('div');
        steps.className = 'se-steps';
        const stepButtons = [];

        [1, 3, 5, 10, 20].forEach(value => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'se-step' + (value === step ? ' is-active' : '');
            btn.textContent = value;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                StatManager?.setStep(value);
                stepButtons.forEach(b => b.classList.toggle('is-active', b === btn));
            });
            steps.appendChild(btn);
            stepButtons.push(btn);
        });
        foot.append(stepLabel, steps);
        panel.appendChild(foot);

        function refreshValues() {
            if (valueEls.attack) valueEls.attack.textContent = readValue('attack');
            if (valueEls.defense) valueEls.defense.textContent = readValue('defense');
        }
        refreshValues();

        document.body.appendChild(panel);
        position(panel, anchorEl);

        function close() {
            panel.remove();
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('keydown', handleKeyDown);
        }
        function handleOutsideClick(e) {
            if (!panel.contains(e.target)) close();
        }
        function handleKeyDown(e) {
            if (e.key === 'Escape') close();
        }
        setTimeout(() => {
            document.addEventListener('mousedown', handleOutsideClick);
            document.addEventListener('keydown', handleKeyDown);
        }, 0);
    }

    global.StatEditorUI = { open, position };
})(window);
