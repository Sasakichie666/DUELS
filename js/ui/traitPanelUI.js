// js/ui/traitPanelUI.js
// 「词条 / 自定义文本」编辑面板：右键卡牌 →「词条/文本」→ 在卡旁弹出这个小面板 ✓
//
// 能力 = 原右键菜单「添加 / 清除」的完整继承（改成面板里连续点，更好用 ✓）：
//   ① 词条（词条库）：点一下加、再点一下移除 → 走 TraitManager（与原「添加」同一条路 ✓）
//      → 卡面出现词条标签 ✓，卡牌详情浮窗的「词条介绍」里也能看到（含词条库的详细描述 ✓）
//   ② 自定义文本：任意内容 → 卡牌详情的「自定义文本」里能看到 ✓；列表里可 × 单条删 ✓
//   ③ 清除全部 = 清空这张卡的全部词条与自定义文本 ✓（= 原「清除」✓）
//
// 交互（对齐本项目其它面板的脾气）：
//   · 面板【不自动关闭】→ 可连续点 ✓
//   · 输入框回车 = 添加 ✓（与原「添加」一致）
//   · 点面板外部 / Esc → 关闭 ✓（复用 UIKit.createDismisser ✓）
//
// 数据操作：全部走 TraitManager ✓ —— 本文件只画界面 ✗（applyLabel / toggleTrait 是纯逻辑，便于单测 ✓）

(function(global) {
    let panelEl = null;
    let currentCard = null;
    let currentAnchor = null;

    const dismisser = global.UIKit ? global.UIKit.createDismisser({
        getElement: () => panelEl,
        onDismiss: () => close()
    }) : { arm() { }, disarm() { }, dismiss() { }, isArmed: () => false };

    function ensurePanel() {
        if (panelEl && document.body.contains(panelEl)) return panelEl;
        panelEl = document.createElement('div');
        panelEl.className = 'trait-panel';
        panelEl.style.display = 'none';
        document.body.appendChild(panelEl);
        return panelEl;
    }

    function cardName(card) {
        return (card && ((card.cardData && card.cardData.name) || card.cardId)) || '未知卡牌';
    }

    function isOpen() {
        return !!(panelEl && panelEl.style.display !== 'none' && currentCard);
    }

    /** 状态改完后的统一收尾：★全部交给 StateCommit（写战报 + 通知对方 + 我方重绘 ✓） */
    function commit(card, logText) {
        if (global.StateCommit && global.StateCommit.commit) {
            global.StateCommit.commit(logText);
            return;
        }
        // 兜底（正常不会走到：index.html 一定先加载 stateCommit.js ✓）
        if (logText && global.BattleLog && global.BattleLog.log) global.BattleLog.log(logText, 'self');
    }

    /** 小节标题 ✓ */
    function sectionTitle(text) {
        const el = document.createElement('div');
        el.className = 'tp-sec';
        el.textContent = text;
        return el;
    }

    /** ★词条增删：走 TraitManager（= 与原「添加 / 清除」同一条路 ✓）→ 详情「词条介绍」可见 ✓ */
    function toggleTrait(card, name) {
        const TM = global.TraitManager;
        if (!card || !name || !TM) return false;
        if (TM.hasTraitOnCard && TM.hasTraitOnCard(card, name)) {
            TM.removeTraitFromCard(card, name);
            commit(card, `「${cardName(card)}」移除了词条「${name}」`);
            return false;
        }
        if (!TM.addTraitToCard(card, name)) return false;
        commit(card, `「${cardName(card)}」添加了词条「${name}」`);
        return true;
    }

    /**
     * ★输入框提交（纯逻辑、不碰 DOM → 可单测 ✓）= 原「添加」的判定：
     *   命中词条库 → 加【词条】（已加则移除 ✓）
     *   不在词条库 → 加【自定义文本】（重复内容不重复加 ✓）
     * @returns {'trait'|'trait-removed'|'text'|null}
     */
    function applyLabel(card, label) {
        const text = String(label == null ? '' : label).trim();
        if (!card || !text) return null;
        const TL = global.TraitLibrary;
        const TM = global.TraitManager;
        if (TL && TL.hasTrait && TL.hasTrait(text)) {
            return toggleTrait(card, text) ? 'trait' : 'trait-removed';
        }
        if (!TM) return null;
        if (!TM.addCustomTextToCard(card, text)) return null;      // 已存在 → 不重复 ✓
        commit(card, `「${cardName(card)}」添加了文本「${text}」`);
        return 'text';
    }

    /** 打开面板（同一张卡再点一次 = 重新定位刷新 ✓） */
    function open(card, anchorEl) {
        if (!card || !global.TraitManager) return false;
        currentCard = card;
        currentAnchor = anchorEl || null;
        render();
        return true;
    }

    function close() {
        if (panelEl) {
            panelEl.style.display = 'none';
            panelEl.innerHTML = '';
        }
        currentCard = null;
        currentAnchor = null;
        dismisser.disarm();
    }
    /** 重绘面板（每次操作后调用 → 勾选态与列表实时反映 ✓） */
    function render() {
        const TM = global.TraitManager;
        const TL = global.TraitLibrary;
        if (!currentCard) return;
        const el = ensurePanel();
        const card = currentCard;
        el.innerHTML = '';

        /* ---------- 头部 ---------- */
        const head = document.createElement('div');
        head.className = 'tp-head';
        const title = document.createElement('span');
        title.className = 'tp-title';
        title.textContent = '词条 / 文本 · ' + cardName(card);
        title.title = cardName(card);
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'tp-close';
        closeBtn.textContent = '✕';
        closeBtn.title = '关闭';
        closeBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });
        head.appendChild(title);
        head.appendChild(closeBtn);
        el.appendChild(head);

        const sub = document.createElement('div');
        sub.className = 'tp-sub';
        sub.textContent = '词条与自定义文本都会自动同步给对方；面板可连续点，不自动关闭';
        el.appendChild(sub);

        /* ---------- ① 词条（词条库）：点一下加、再点一下移除 ✓
                      加完会出现在卡面标签 + 卡牌详情的「词条介绍」里 ✓ ---------- */
        if (TL && TL.getAllTraits && TM) {
            const allTraits = TL.getAllTraits() || [];
            if (allTraits.length) {
                el.appendChild(sectionTitle('词条（点一下加，再点一下移除）'));
                const chips = document.createElement('div');
                chips.className = 'tp-traits';
                allTraits.forEach(t => {
                    const name = t && t.name;
                    if (!name) return;
                    const on = !!(TM.hasTraitOnCard && TM.hasTraitOnCard(card, name));
                    const chip = document.createElement('button');
                    chip.type = 'button';
                    chip.className = 'tp-trait' + (on ? ' on' : '');
                    chip.textContent = name;
                    chip.title = (t.description ? t.description + '\n' : '')
                        + (on ? '点击移除（详情里的「词条介绍」会同步消失 ✓）'
                            : '点击添加（卡牌详情会出现「词条介绍」✓）');
                    chip.addEventListener('click', (e) => {
                        e.stopPropagation();
                        toggleTrait(card, name);
                        render();
                    });
                    chips.appendChild(chip);
                });
                el.appendChild(chips);
            }
        }

        /* ---------- ② 自定义文本：任意内容（不在词条库的名字自动走这里 ✓） ---------- */
        el.appendChild(sectionTitle('添加（命中词条库 → 词条；否则 → 自定义文本）'));
        const custom = document.createElement('div');
        custom.className = 'tp-custom';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tp-input';
        input.placeholder = '词条名 / 任意文本…';
        input.maxLength = 24;
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'tp-foot-btn primary';
        addBtn.textContent = '添加';
        addBtn.title = '与原右键菜单的「添加」完全一致：词条库里的名字 → 加词条 ✓；其它内容 → 加自定义文本 ✓';
        const submit = () => {
            const raw = input.value;
            if (!String(raw || '').trim()) return;
            const res = applyLabel(card, raw);          // ★分流逻辑（可单测 ✓）
            if (res === null && global.UI && global.UI.showNotification) {
                global.UI.showNotification('这条内容已经加过了', 'info');
            }
            input.value = '';
            render();
            const box = panelEl && panelEl.querySelector('.tp-input');
            if (box) box.focus();                       // 焦点回到输入框 → 方便连续加 ✓
        };
        addBtn.addEventListener('click', (e) => { e.stopPropagation(); submit(); });
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
        });
        custom.appendChild(input);
        custom.appendChild(addBtn);
        el.appendChild(custom);

        /* ---------- 已添加的自定义文本（× 单条删 ✓） ---------- */
        const texts = (TM && TM.getCardCustomTexts) ? TM.getCardCustomTexts(card) : [];
        if (texts.length) {
            const textBox = document.createElement('div');
            textBox.className = 'tp-list';
            texts.forEach(t => {
                const row = document.createElement('div');
                row.className = 'tp-row';

                const label = document.createElement('span');
                label.className = 'tp-text';
                label.textContent = t;
                label.title = t;

                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'tp-btn tp-del';
                del.textContent = '×';
                del.title = '移除这条自定义文本';
                del.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (TM) TM.removeCustomTextFromCard(card, t);
                    commit(card, `「${cardName(card)}」移除了文本「${t}」`);
                    render();
                });

                row.appendChild(label);
                row.appendChild(del);
                textBox.appendChild(row);
            });
            el.appendChild(textBox);
        }
        /* ---------- 底部：清除全部 · 完成 ---------- */
        const foot = document.createElement('div');
        foot.className = 'tp-foot';

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'tp-foot-btn danger';
        clearBtn.textContent = '清除全部';
        clearBtn.title = '清空这张卡的全部词条与自定义文本 ✓（= 原右键菜单的「清除」✓）';
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (Array.isArray(card.traits)) card.traits.length = 0;
            if (Array.isArray(card.customTexts)) card.customTexts.length = 0;
            commit(card, `「${cardName(card)}」清除了全部词条与自定义文本`);
            render();
        });

        const doneBtn = document.createElement('button');
        doneBtn.type = 'button';
        doneBtn.className = 'tp-foot-btn';
        doneBtn.textContent = '完成';
        doneBtn.addEventListener('click', (e) => { e.stopPropagation(); close(); });

        foot.appendChild(clearBtn);
        foot.appendChild(doneBtn);
        el.appendChild(foot);

        /* ---------- 显示 + 定位 ---------- */
        el.style.display = 'flex';
        if (global.UIKit && global.UIKit.positionFloating) {
            const anchor = (currentAnchor && document.body.contains(currentAnchor)) ? currentAnchor : null;
            global.UIKit.positionFloating(el, anchor, { gap: 6 });
        }
        dismisser.arm();
    }

    /** 窗口尺寸变化 → 面板跟着重新定位（不至于飘走 ✓） */
    window.addEventListener('resize', () => {
        if (isOpen() && global.UIKit && global.UIKit.positionFloating
            && currentAnchor && document.body.contains(currentAnchor)) {
            global.UIKit.positionFloating(panelEl, currentAnchor, { gap: 6 });
        }
    });

    global.TraitPanelUI = {
        open,
        close,
        render,
        isOpen,
        // 纯逻辑（供其它地方复用 / 单测 ✓）：
        applyLabel,     // 输入框提交：命中词条库 → 词条 ✓ 否则 → 自定义文本 ✓
        toggleTrait     // 词条增删（走 TraitManager = 原「添加」同一条路 ✓）
    };
})(window);
