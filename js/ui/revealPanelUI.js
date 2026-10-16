// js/ui/revealPanelUI.js
// 「展示」的界面层（新增）—— 只画 RevealChannel 的会话状态，并把点击转成它的 API ✓
//
//   我方翻阅   → 复用 ViewerUI（限定 N 张的检索界面）+ 底部额外控件（公开 / +1 / 收起）✓
//   对方展示   → 右上角只读小窗（公开=正面，未公开=牌背 ✓），可本地隐藏 ✓
//   手牌展示   → 覆盖层挑选手牌（侧栏「展示」按钮触发 ✓）→ 确定后对方才看到 ✓
//   数量输入   → 点「翻阅」后的小弹窗（数字输入 + 快捷 1/2/3/5 ✓）
//
// 本模块不持有任何"展示"状态：一切以 RevealChannel 为准 ✓

(function(global) {
    let peerPanel = null;      // 对方展示 → 我这边的只读面板
    let mineBar = null;        // 我方正在展示 → 小条（含「收起」）
    let picker = null;         // 手牌挑选覆盖层
    let countPop = null;       // 翻阅数量输入弹窗
    // 我点过「确认」的对方会话（同一会话且内容未变 → 不再自动弹出 ✓；
    // 对方 +1 / 换牌等改动会抬高 rev → 自动重新弹出，不会漏消息 ✓）
    let peerAck = { id: null, rev: 0 };

    /**
     * 对方窗口的文案表 —— 各 kind 只描述"说什么"，渲染逻辑只有一条 ✓
     * （翻阅 / 检索 / 手牌展示 的差异全部在这张表里，不再散落成 if-else ✗）
     */
    const PEER_TEXT = {
        peek: {
            title: '对方翻阅', waiting: '等待对方行动…',
            // ★翻阅完成时：公开 → 下方会列出"每张 + 它被执行的操作"✓；未公开 → 只给「确认」✓
            done: '对方翻阅完成，请点击下方「确认」'
        },
        search: { title: '对方检索', waiting: '对方正在检索中，等待对方行动…', done: '对方已完成检索，请点击下方「确认」' },
        browse: { title: '对方查阅', done: '对方查阅并取走了这些牌（见下方列表 ✓）' },
        hand: { title: '对方展示手牌' }
    };
    const PEER_DONE = '对方已完成，请点击下方「确认」';

    const dismisser = global.UIKit ? global.UIKit.createDismisser({
        getElement: () => countPop,
        onDismiss: () => hideCountPop()
    }) : { arm() { }, disarm() { } };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[ch]);
    }

    function box(cls, id) {
        const el = document.createElement('div');
        el.className = cls;
        if (id) el.id = id;
        document.body.appendChild(el);
        return el;
    }

    function ensurePeerPanel() {
        if (peerPanel && document.body.contains(peerPanel)) return peerPanel;
        peerPanel = box('reveal-peer-panel', 'revealPeerPanel');
        peerPanel.hidden = true;
        return peerPanel;
    }

    function ensureMineBar() {
        if (mineBar && document.body.contains(mineBar)) return mineBar;
        mineBar = box('reveal-mine-bar', 'revealMineBar');
        mineBar.hidden = true;
        return mineBar;
    }

    /* ================= 对方展示 → 只读面板 ================= */

    // 虚拟卡 id 前缀：对方窗口里的每张"已公开"卡都会注册一份，供悬浮详情读真实数值 ✓
    const VIRTUAL_PREFIX = 'rv:';

    /** 用快照画一张牌；hidden 快照画牌背 ✓（不传任何能看出身份的信息 ✓） */
    function cardElFromSnapshot(snap, virtualId) {
        const card = global.CardUI;
        if (!card) return document.createElement('div');
        if (snap && snap.hidden) {
            const back = card.createCardElement({}, true, 'reveal-card');  // 牌背 ✓
            // ★牌背不注册虚拟卡、也不留任何可解析的 id ✓
            //   → 悬浮详情 hoverOnElement 找不到卡 → 不弹任何详情 ✓（零泄露 ✓）
            if (back.removeAttribute) back.removeAttribute('data-card-id');
            return back;
        }
        const data = Object.assign({}, snap, { id: snap.cardId });         // 兼容卡面渲染读 id ✓
        const el = card.createCardElement(data, false, 'reveal-card');

        // ★注册「虚拟实例」：卡面已公开，悬浮详情显示【快照里的真实数值】✓
        //   （含被改过的攻防 / 临时词条；而牌背分支根本不注册 ✓）
        const D = global.CardDetailUI;
        if (D && typeof D.registerVirtualCard === 'function' && virtualId) {
            D.registerVirtualCard(virtualId, {
                instanceId: virtualId,
                cardId: snap.cardId,
                cardData: data,                       // 详情面板优先读它 ✓
                // 数据本就来自"对方已公开"的快照 ✓；记为 self 以免被
                // 「对手个人区 / 盖伏牌不显示详情」两条守卫拦掉 ✓
                owner: 'self',
                faceDown: false,
                controller: 'self',
                traits: data.traits || [],
                customTexts: data.customTexts || [],
                equippedCards: data.equippedCards || [],
                attack: data.attack,
                defense: data.defense,
                currentAttack: data.attack,
                currentDefense: data.defense
            });
            el.setAttribute('data-instance-id', virtualId);   // → hoverOnElement 走实例分支 ✓
        }
        return el;
    }

    function renderPeer(s) {
        const el = ensurePeerPanel();
        const T = PEER_TEXT[s.kind] || { title: '对方展示' };
        const title = T.title;
        // ★翻阅：整个「翻阅阶段」都算进行中 ✓
        //   只要还有没处理的牌（stage=open）→ 对方继续看到【剩余待处理的那些牌】✓
        //   全部处理完（stage=closed）→ 才升级成【取牌确认界面】：
        //     · 公开 → 列出每张 + 它被执行的操作（卡下标注 ✓）
        //     · 未公开 → 只给「确认」，不给牌面 ✓
        const taken = (s.kind === 'peek' && s.stage !== 'open' && s.taken && s.taken.card)
            ? s.taken : null;
        const acting = s.stage === 'open';
        // 翻阅的"张数"= 还没处理的张数（与对方看到的列表条数一致 ✓）
        const countText = s.kind === 'peek' ? `${s.count || 0} 张` : `${(s.cards || []).length} 张`;
        const revealText = s.revealed ? '已公开（正面）' : '未公开（牌背）';

        el.innerHTML = '';
        const head = document.createElement('div');
        head.className = 'reveal-head';
        head.innerHTML = `<span class="reveal-title">${esc(title)}</span>`
            // ★翻阅进行中也把"剩余张数"给对方看（对方能对上列表条数 ✓）；其余模式进行中不报数 ✓
            + (((acting && s.kind !== 'peek') || taken) ? '' : `<span class="reveal-count">${esc(countText)}</span>`);
        el.appendChild(head);

        // ★状态行：进行中 → 等待对方行动；已完成 → 请点确认 ✓
        const status = document.createElement('div');
        status.className = 'reveal-status ' + (acting ? 'is-waiting' : 'is-done');
        status.textContent = taken ? (T.taken || '对方取走了这张牌')
            : acting ? (T.waiting || '等待对方行动…')
                : (T.done || PEER_DONE);
        el.appendChild(status);

        const note = document.createElement('div');
        note.className = 'reveal-note';
        // ★翻阅：只有"进行中"才标 已公开 / 未公开 ✓（完成后的取牌告知不再标 ✗）
        note.textContent = `${s.note || ''}${(s.kind === 'peek' && !taken && acting) ? ' · ' + revealText : ''}`;
        el.appendChild(note);

        const cards = taken ? [taken.card] : (s.cards || []);   // ★取牌后只显示"那张牌" ✓
        // ★翻阅取牌告知：每张卡下面要标"这张被怎么处理了" → 用单独的样式（与检索 / 查阅区分 ✓）
        const isPeekTaken = !!(s.kind === 'peek' && !taken && !acting && cards.length);
        // ★每次重绘先清掉上一批虚拟卡（旧 DOM 已被整体替换 ✓），再按本次内容重新注册 ✓
        if (global.CardDetailUI && global.CardDetailUI.clearVirtualCards) {
            global.CardDetailUI.clearVirtualCards(VIRTUAL_PREFIX);
        }
        if (cards.length) {                                   // ★检索进行中：连牌背都不给 ✓
            const list = document.createElement('div');
            list.className = 'reveal-cards' + (isPeekTaken ? ' is-peek-taken' : '');
            cards.forEach((snap, i) => {
                const slot = document.createElement('div');
                slot.className = 'reveal-card-slot';
                // ★虚拟卡 id 带「会话 id + 序号」→ 同一会话内每张唯一 ✓
                //   （翻阅 / 检索 / 查阅 / 取牌告知 / 手牌展示 全走这里 ✓ 一套通吃 ✓）
                const virtualId = VIRTUAL_PREFIX + s.id + ':' + i;
                slot.appendChild(cardElFromSnapshot(snap, virtualId));

                // ★翻阅取牌告知：卡下面标出"这张被执行的操作" ✓
                if (isPeekTaken && snap && snap.destLabel) {
                    const op = document.createElement('div');
                    op.className = 'reveal-card-op';
                    op.textContent = snap.destLabel;
                    slot.appendChild(op);
                }

                // ★透明悬浮贴片（只给「已公开」的卡 ✓）：
                //   槽位是 pointer-events:none ✗（只读 ✓）→ 卡面收不到 mouseover ✗
                //   盖一片 pointer-events:auto 的透明贴片，专门用来触发悬浮详情 ✓
                //   它不是 .card-full ✗ → 拖拽 / 右键菜单 / 连锁选目标 都不会误认 ✓
                //   牌背（snap.hidden）不加贴片 ✓ → 悬浮零泄露 ✓
                const D = global.CardDetailUI;
                if (snap && !snap.hidden && D && typeof D.registerVirtualCard === 'function') {
                    const proxy = document.createElement('div');
                    proxy.className = 'reveal-hover-proxy';
                    proxy.setAttribute('data-instance-id', virtualId);
                    slot.appendChild(proxy);
                }
                list.appendChild(slot);
            });
            el.appendChild(list);
        }

        // ★进行中：只显示"等待对方行动"，不给确认按钮 ✓
        if (acting) { el.hidden = false; return; }

        // 底部「确认」：★只在"对方已完成"后出现；不点确认，窗口就一直留着 ✓
        //   （对方之后再 +1 张 / 换内容 → rev 变高 → 会自动重新弹出，不会漏 ✓）
        const foot = document.createElement('div');
        foot.className = 'reveal-peer-foot';
        const ack = document.createElement('button');
        ack.type = 'button';
        ack.className = 'reveal-ack';
        ack.textContent = '确认';
        ack.addEventListener('click', (e) => {
            e.stopPropagation();
            peerAck = { id: s.id, rev: s.rev };       // 记住"这个版本我看到了" ✓
            el.hidden = true;
        });
        foot.appendChild(ack);
        el.appendChild(foot);

        el.hidden = false;
    }

    /* ================= 我方正在展示 → 小条 ================= */

    function renderMine(s) {
        const el = ensureMineBar();
        const label = s.kind === 'hand' ? `正展示 ${s.count} 张手牌`
            : s.kind === 'search' ? '已告知对方检索结果'
                : `预览中：${s.note || '翻阅'}`;
        el.innerHTML = '';
        const span = document.createElement('span');
        span.className = 'reveal-mine-text';
        span.textContent = label;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'reveal-mine-close';
        btn.textContent = '收起';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            global.RevealChannel.close();
        });
        el.appendChild(span);
        el.appendChild(btn);
        el.hidden = false;
    }

    function render(s) {
        const shown = !!(s && s.stage === 'open');

        // 对方视角窗口：
        //   · 检索 / 查阅 / 手牌展示 → 与以前完全一致（进行中"等待对方行动"；完成后内容 + 确认 ✓）
        //   ★阶段F2（本次唯一改动）：翻阅【处理完之后】要弹出"取牌确认界面" ✓
        //     · 进行中（stage=open）→ 照旧显示翻阅面板（实时同步，与以前一致 ✓）
        //     · 处理完（stage=closed）→ 上个版本这里会【直接消失】✗（因为翻阅的 cards 已清空）
        //       → 现在补上 peekReady：把"取牌确认界面 + 「确认」"弹出来 ✓
        //         （公开才带牌面 / 操作标注；未公开只给确认 ✓）
        const forPeer = !!(s && s.owner === 'opponent');
        const finishedWithContent = forPeer && s.stage === 'closed' && (s.cards || []).length > 0;
        const acked = forPeer && s.id === peerAck.id && s.rev === peerAck.rev;
        // ★翻阅处理完 → 一律弹"取牌确认界面"（★公开才有牌面 + 每张的操作标注 ✓
        //   未公开 → 只给「确认」按钮、不给任何牌面信息 ✓）
        const peekReady = forPeer && s.kind === 'peek' && s.stage === 'closed';
        if (forPeer && !acked && (s.stage === 'open' || finishedWithContent || peekReady)) {
            renderPeer(s);
        } else if (peerPanel) {
            peerPanel.hidden = true;
        }

        // ② 我方「正在展示」小条（翻阅面板由 DeckTakeUI 驱动 ✓ 不在这里 ✗）
        if (shown && s.owner === 'self' && s.kind !== 'peek') renderMine(s);
        else if (mineBar) mineBar.hidden = true;
    }

    function init() {
        if (!global.RevealChannel) {
            console.warn('[RevealPanelUI] RevealChannel 未加载，展示界面停用');
            return false;
        }
        global.RevealChannel.subscribe(render);
        return true;
    }

    /* ================= 手牌挑选（侧栏「展示」按钮 ✓） ================= */

    let pickedIds = new Set();

    function myHand() {
        const GS = global.GameState;
        const st = GS && GS.getState ? GS.getState() : null;
        const hand = st && st.players && st.players.self ? st.players.self.hand : null;
        return Array.isArray(hand) ? hand.filter(Boolean) : [];
    }

    function cardDataOf(inst) {
        if (!inst) return {};
        return inst.cardData || (global.CardLibrary && global.CardLibrary.getCardById(inst.cardId)) || {};
    }

    function ensurePicker() {
        if (picker && document.body.contains(picker)) return picker;
        picker = box('reveal-picker-overlay', 'revealPickerOverlay');
        picker.hidden = true;
        picker.addEventListener('click', (e) => {              // 点遮罩收起
            if (e.target === picker) closeHandPicker();
        });
        return picker;
    }

    function renderPicker() {
        const hand = myHand();
        const selCount = hand.filter(c => pickedIds.has(c.instanceId)).length;

        picker.innerHTML = '';
        const panel = document.createElement('div');
        panel.className = 'reveal-picker';

        const head = document.createElement('header');
        head.className = 'reveal-picker-head';
        head.innerHTML = `<span class="reveal-picker-title">选择要展示给对手的手牌</span>`
            + `<span class="reveal-picker-count">已选 ${selCount} / ${hand.length}</span>`;
        panel.appendChild(head);

        const grid = document.createElement('div');
        grid.className = 'reveal-picker-grid';
        hand.forEach(inst => {
            const slot = document.createElement('div');
            slot.className = 'reveal-pick-slot' + (pickedIds.has(inst.instanceId) ? ' is-picked' : '');
            const el = global.CardUI
                ? global.CardUI.createCardElement(cardDataOf(inst), false, 'reveal-pick-card')
                : document.createElement('div');
            slot.appendChild(el);
            const tick = document.createElement('div');
            tick.className = 'reveal-pick-tick';
            tick.textContent = pickedIds.has(inst.instanceId) ? '✔' : '';
            slot.appendChild(tick);
            slot.addEventListener('click', (e) => {
                e.stopPropagation();
                if (pickedIds.has(inst.instanceId)) pickedIds.delete(inst.instanceId);
                else pickedIds.add(inst.instanceId);
                renderPicker();                                 // 手牌少，整体重绘足够 ✓
            });
            grid.appendChild(slot);
        });
        panel.appendChild(grid);

        const foot = document.createElement('footer');
        foot.className = 'reveal-picker-foot';
        const mk = (label, cls, fn) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'reveal-btn ' + cls;
            b.textContent = label;
            b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
            return b;
        };
        foot.appendChild(mk(selCount ? `展示选中（${selCount}）` : '展示选中', 'reveal-btn-primary', () => {
            const chosen = myHand().filter(c => pickedIds.has(c.instanceId));
            if (!chosen.length) return;
            global.RevealChannel.showHand(chosen);
            closeHandPicker();
        }));
        foot.appendChild(mk('全选', '', () => {
            myHand().forEach(c => pickedIds.add(c.instanceId));
            renderPicker();
        }));
        foot.appendChild(mk('清空', '', () => {
            pickedIds = new Set();
            renderPicker();
        }));
        foot.appendChild(mk('取消', '', () => closeHandPicker()));
        panel.appendChild(foot);

        picker.appendChild(panel);
    }

    function openHandPicker() {
        if (!global.RevealChannel) return false;
        if (!myHand().length) {
            if (global.UI && global.UI.showNotification) global.UI.showNotification('手牌是空的', 'warning');
            return false;
        }
        ensurePicker();
        pickedIds = new Set();
        renderPicker();
        picker.hidden = false;
        return true;
    }

    function closeHandPicker() {
        if (picker) picker.hidden = true;
    }

    /* ================= 翻阅数量输入弹窗 ================= */

    function ensureCountPop() {
        if (countPop && document.body.contains(countPop)) return countPop;
        countPop = box('reveal-count-popup', 'revealCountPopup');
        countPop.hidden = true;
        return countPop;
    }

    /**
     * 询问翻阅张数
     * @param {object} opts { anchorEl, title, defaultValue, onSubmit }
     */
    function askCount(opts) {
        const o = opts || {};
        const el = ensureCountPop();
        const def = Math.max(1, Math.floor(Number(o.defaultValue) || 1));

        el.innerHTML = '';
        const title = document.createElement('div');
        title.className = 'reveal-count-title';
        title.textContent = o.title || '翻阅几张？';
        el.appendChild(title);

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '1';
        input.step = '1';
        input.value = String(def);
        input.className = 'reveal-count-input';
        el.appendChild(input);

        const quick = document.createElement('div');
        quick.className = 'reveal-count-quick';
        [1, 2, 3, 5].forEach(n => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'reveal-count-chip' + (n === def ? ' is-active' : '');
            b.textContent = String(n);
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                input.value = String(n);
                quick.querySelectorAll('.reveal-count-chip').forEach(x => x.classList.remove('is-active'));
                b.classList.add('is-active');
            });
            quick.appendChild(b);
        });
        el.appendChild(quick);

        const foot = document.createElement('div');
        foot.className = 'reveal-count-foot';
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'reveal-btn reveal-btn-primary';
        ok.textContent = '确定翻阅';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'reveal-btn';
        cancel.textContent = '取消';
        const submit = () => {
            const n = Math.max(1, Math.floor(Number(input.value) || def));
            hideCountPop();
            if (typeof o.onSubmit === 'function') o.onSubmit(n);
        };
        ok.addEventListener('click', (e) => { e.stopPropagation(); submit(); });
        cancel.addEventListener('click', (e) => { e.stopPropagation(); hideCountPop(); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            if (e.key === 'Escape') { e.preventDefault(); hideCountPop(); }
        });
        foot.appendChild(ok);
        foot.appendChild(cancel);
        el.appendChild(foot);

        el.hidden = false;
        if (global.UIKit && global.UIKit.positionFloating && o.anchorEl) {
            global.UIKit.positionFloating(el, o.anchorEl, { gap: 6 });
        } else {
            // 没有锚点（例如从别处调用）→ 屏幕居中偏上，别贴在左上角看不见 ✗
            el.style.left = Math.max(8, Math.round((window.innerWidth - el.offsetWidth) / 2)) + 'px';
            el.style.top = Math.max(60, Math.round(window.innerHeight * 0.24)) + 'px';
        }
        dismisser.arm();
        setTimeout(() => { try { input.focus(); input.select(); } catch (e) { } }, 20);
        return true;
    }

    function hideCountPop() {
        if (countPop) countPop.hidden = true;
        dismisser.disarm();
    }

    global.RevealPanelUI = {
        init,
        openHandPicker,
        closeHandPicker,
        askCount,
        hideCountPop,
        render
    };
})(window);
