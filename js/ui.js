// js/ui.js
// UI管理器：只负责调度子模块，不包含具体渲染实现
// 框架整理：卡面状态（休整横置 / 本回合入场）统一由 applyCardMarkers 刷新

(function(global) {
    const CardUI = global.CardUI;
    const FieldUI = global.FieldUI;
    const CostUI = global.CostUI;
    const DeckUI = global.DeckUI;
    const CardDetailUI = global.CardDetailUI;
    const HealthUI = global.HealthUI;

    const els = {
        btnLobby: document.getElementById('btnLobby'),
        btnDeck: document.getElementById('btnDeck'),
        btnDecks: document.getElementById('btnDecks'),      // ★我的卡组（卡组库总览视图）
        viewLobby: document.getElementById('view-lobby'),
        viewDeck: document.getElementById('view-deck'),
        viewBattle: document.getElementById('view-battle'),
        btnCreateRoom: document.getElementById('btnCreateRoom'),
        btnJoinRoom: document.getElementById('btnJoinRoom'),
        joinPasswordInput: document.getElementById('joinPasswordInput'),
        roomCodeContainer: document.getElementById('roomCodeContainer'),
        roomCodeDisplay: document.getElementById('roomCodeDisplay'),
        hostStatusDot: document.getElementById('hostStatusDot'),
        hostStatusText: document.getElementById('hostStatusText'),
        joinStatusDot: document.getElementById('joinStatusDot'),
        joinStatusText: document.getElementById('joinStatusText'),
        connPath: document.getElementById('connPath'),
        hostOpponentInfo: document.getElementById('hostOpponentInfo'),
        hostOpponentStatus: document.getElementById('hostOpponentStatus'),
        joinOpponentInfo: document.getElementById('joinOpponentInfo'),
        joinOpponentStatus: document.getElementById('joinOpponentStatus'),
        battleWaiting: document.getElementById('battleWaiting'),
        // ★阶段L1（大厅改版）：弹窗 + 赛制/局数 + VS 场景里的按钮
        createRoomModal: document.getElementById('createRoomModal'),
        joinRoomModal: document.getElementById('joinRoomModal'),
        modeRow: document.getElementById('modeRow'),
        bestRow: document.getElementById('bestRow'),
        btnCreateRoomClose: document.getElementById('btnCreateRoomClose'),
        btnCreateCancel: document.getElementById('btnCreateCancel'),
        btnCreateConfirm: document.getElementById('btnCreateConfirm'),
        btnJoinRoomClose: document.getElementById('btnJoinRoomClose'),
        btnJoinCancel: document.getElementById('btnJoinCancel'),
        btnJoinConfirm: document.getElementById('btnJoinConfirm'),
        btnCopyRoom: document.getElementById('btnCopyRoom'),
        btnLeaveRoom: document.getElementById('btnLeaveRoom'),
        mcMode: document.getElementById('mcMode'),
        mcBest: document.getElementById('mcBest'),
        mcHint: document.getElementById('mcHint'),
        modePick: document.getElementById('modePick'),      // ★阶段L2：大厅"对局方式"下拉
        modeHint: document.getElementById('modeHint'),
        myReadyStatus: document.getElementById('myReadyStatus'),
        opponentReadyStatus: document.getElementById('opponentReadyStatus'),
        btnReady: document.getElementById('btnReady'),
        btnStartGame: document.getElementById('btnStartGame'),
        cardLibrary: document.getElementById('cardLibrary'),
        mainDeckSlots: document.getElementById('mainDeckSlots'),
        costDeckSlots: document.getElementById('costDeckSlots'),
        mainDeckCount: document.getElementById('mainDeckCount'),
        deckValidationMsg: document.getElementById('deckValidationMsg'),
        btnSaveDeck: document.getElementById('btnSaveDeck'),
        btnLoadDeck: document.getElementById('btnLoadDeck'),
        btnClearDeck: document.getElementById('btnClearDeck'),
        selfFrontField: document.getElementById('self-front-field'),
        selfBackField: document.getElementById('self-back-field'),
        opponentFrontField: document.getElementById('opponent-front-field'),
        opponentBackField: document.getElementById('opponent-back-field'),
        publicField: document.getElementById('public-field'),
        selfHand: document.getElementById('self-hand'),
        selfCostZone: document.getElementById('self-cost-zone'),
        opponentCostZone: document.getElementById('opponent-cost-zone'),
        selfDeckZone: document.getElementById('self-deck-zone'),
        opponentDeckZone: document.getElementById('opponent-deck-zone'),
        opponentHandMainCount: document.getElementById('opponent-hand-main-count'),
        opponentHandCostCount: document.getElementById('opponent-hand-cost-count'),
        selfHandMainCount: document.getElementById('self-hand-main-count'),
        selfHandCostCount: document.getElementById('self-hand-cost-count'),
        selfHealth: document.getElementById('self-health'),
        opponentHealth: document.getElementById('opponent-health'),
        btnEndTurn: document.getElementById('btnEndTurn'),
        navTurnCountDisplay: document.getElementById('navTurnCountDisplay'),
        sidePanelContainer: document.getElementById('sidePanelContainer'),
        dividerText: document.getElementById('dividerText'),
        startGameHint: document.getElementById('startGameHint'),
        battleLogList: document.getElementById('battleLogList'),
        battleLogPanel: document.getElementById('battleLogPanel'),
        btnClearLog: document.getElementById('btnClearLog'),
        btnToggleLog: document.getElementById('btnToggleLog'),
        btnCloseLog: document.getElementById('btnCloseLog')
    };

    let battlefieldInitialized = false;

    // ===== 战斗视图延迟构建 =====
    // 联机大厅阶段，战斗视图里连节点都不存在（标记放在 index.html 的
    // <template id="battleViewTemplate"> 里，template 内容不参与渲染、也查不到 id）。
    // 只有真正开局时才把模板克隆进 #view-battle，并重新解析下面这些元素引用。
    let battleViewBuilt = false;
    const battleViewReadyCallbacks = [];

    // 战斗视图内的元素：els 属性名 → 元素 id
    const BATTLE_EL_IDS = {
        selfFrontField: 'self-front-field',
        selfBackField: 'self-back-field',
        opponentFrontField: 'opponent-front-field',
        opponentBackField: 'opponent-back-field',
        publicField: 'public-field',
        selfHand: 'self-hand',
        selfCostZone: 'self-cost-zone',
        opponentCostZone: 'opponent-cost-zone',
        selfDeckZone: 'self-deck-zone',
        opponentDeckZone: 'opponent-deck-zone',
        opponentHandMainCount: 'opponent-hand-main-count',
        opponentHandCostCount: 'opponent-hand-cost-count',
        selfHandMainCount: 'self-hand-main-count',
        selfHandCostCount: 'self-hand-cost-count',
        selfHealth: 'self-health',
        opponentHealth: 'opponent-health',
        btnEndTurn: 'btnEndTurn',
        sidePanelContainer: 'sidePanelContainer',
        dividerText: 'dividerText',
        battleLogList: 'battleLogList',
        battleLogPanel: 'battleLogPanel',
        btnClearLog: 'btnClearLog',
        btnToggleLog: 'btnToggleLog',
        btnCloseLog: 'btnCloseLog'
    };

    function refreshBattleEls() {
        Object.keys(BATTLE_EL_IDS).forEach(key => {
            els[key] = document.getElementById(BATTLE_EL_IDS[key]);
        });
    }

    function buildBattleView() {
        if (battleViewBuilt) return;
        const host = document.getElementById('view-battle');
        const tpl = document.getElementById('battleViewTemplate');
        if (!host || !tpl) {
            console.warn('[UI] 未找到战斗视图容器或模板，无法构建牌桌');
            return;
        }
        host.appendChild(tpl.content.cloneNode(true));
        battleViewBuilt = true;
        refreshBattleEls();
        battleViewReadyCallbacks.splice(0).forEach(fn => {
            try {
                fn();
            } catch (e) {
                console.error('[UI] 战斗视图就绪回调失败:', e);
            }
        });
    }

    function onBattleViewReady(fn) {
        if (typeof fn !== 'function') return;
        if (battleViewBuilt) fn();
        else battleViewReadyCallbacks.push(fn);
    }

    function isBattleViewBuilt() {
        return battleViewBuilt;
    }

    function showNotification(message, type = 'info', duration = 3000) {
        const existing = document.querySelectorAll('.notification');
        existing.forEach(n => n.remove());
        const notif = document.createElement('div');
        notif.className = `notification ${type}`;
        notif.textContent = message;
        document.body.appendChild(notif);
        setTimeout(() => {
            notif.style.opacity = '0';
            notif.style.transition = 'opacity 0.3s';
            setTimeout(() => notif.remove(), 300);
        }, duration);
    }

    // ===== 视图「首次进入」钩子 =====
    // 用于把重量级渲染（卡牌库、卡组槽位等几百个 DOM 节点）推迟到真正打开该视图时再做，
    // 避免页面一加载 / 停在联机大厅就渲染其它视图的内容。
    const viewHooks = {};

    function registerViewHook(view, fn) {
        if (typeof fn === 'function') viewHooks[view] = fn;
    }

    function runViewHook(view) {
        const hook = viewHooks[view];
        if (typeof hook !== 'function') return;
        delete viewHooks[view];      // 只执行一次
        try {
            hook();
        } catch (e) {
            console.error(`[UI] 视图 ${view} 延迟初始化失败:`, e);
        }
    }

    function switchView(view) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-' + view)?.classList.add('active');
        document.querySelectorAll('.nav-buttons .btn').forEach(b => b.classList.remove('active'));
        document.getElementById('btn' + view.charAt(0).toUpperCase() + view.slice(1))?.classList.add('active');

        // 战斗视图：给 body 加类，隐藏顶部导航，让牌桌占满整屏
        document.body.classList.toggle('view-battle-active', view === 'battle');

        // ★阶段L1：进入 VS 准备场景时，确保"准备区"是显示状态 ✓
        //   （resetUI 会摘掉 .active，而 VS 场景本身只有进房后才可达 ✓）
        if (view === 'vs' && els.battleWaiting) els.battleWaiting.classList.add('active');

        // 首次进入该视图时执行一次延迟渲染（此时容器已经可见）
        runViewHook(view);

        if (view === 'battle') {
            els.btnLobby.disabled = true;
            els.btnDeck.disabled = true;
        } else {
            els.btnLobby.disabled = false;
            els.btnDeck.disabled = false;
        }
    }

    function updateConnectionUI() {
        const { Network } = global;
        if (!Network) return;
        const state = Network.getState();
        // 信令掉线状态文案（局域网框架下只自动重连一次）
        const lost = state.signalingLost
            ? (state.signalingRetrying ? '（信令掉线，正在重连…）' : '（信令已断开：请重新点「创建房间 / 加入」）')
            : '';
        if (state.isHost && state.isJoined) {
            els.hostStatusDot.className = 'dot ' + (state.isConnected ? 'connected' : (state.signalingLost ? 'disconnected' : 'connecting'));
            els.hostStatusText.textContent = state.isConnected
                ? ('P2P已连接' + lost)
                : ('等待对手加入 · 房间 ' + (state.roomCode || '----') + lost);
        } else {
            els.hostStatusDot.className = 'dot disconnected';
            els.hostStatusText.textContent = '未创建房间';
        }
        if (!state.isHost && state.isJoined) {
            els.joinStatusDot.className = 'dot ' + (state.isConnected ? 'connected' : 'connecting');
            els.joinStatusText.textContent = state.isConnected ? ('P2P已连接' + lost) : ('等待连接...' + lost);
        } else if (!state.isHost) {
            els.joinStatusDot.className = 'dot ' + (state.signalingLost ? 'connecting' : 'disconnected');
            els.joinStatusText.textContent = state.signalingLost ? ('信令重连中…' + lost) : '未加入房间';
        }
    }

    /**
     * 把"本次连接实际走的哪条路"显示在大厅（不只写在控制台）。
     * 局域网联机下常见两种：局域网直连（同网段 / UU 组网）/ IPv6 直连；
     * 失败时给出候选对状态统计（in-progress / failed）。
     */
    function showConnectionPath(path) {
        const el = els.connPath;
        if (!el) return;
        if (!path || !path.text) {
            el.style.display = 'none';
            el.textContent = '';
            return;
        }
        const reason = path.reason ? (path.reason + '：') : '';
        el.textContent = (path.ok ? '🔗 ' : '⚠️ ') + reason + path.text;
        el.style.display = 'block';
        el.classList.toggle('bad', !path.ok);
        el.title = '这是本次 P2P 连接实际使用的候选对（诊断用）。点「🩺 连接自检」可看完整报告。';
    }

    function updateStartButton() {
        const { Network } = global;
        if (!Network || !els.btnStartGame) return;
        const state = Network.getState();
        const isHost = !!state.isHost;
        const bothReady = !!(state.isReady && state.opponentReady);

        // 开始对战由房主发起：加入方只能等待房主开始
        els.btnStartGame.disabled = !(isHost && bothReady);
        els.btnStartGame.textContent = isHost ? '🎯 开始对战' : '⏳ 等待房主开始…';

        if (!els.btnStartGame.disabled) {
            els.btnStartGame.style.background = 'var(--accent)';
            els.btnStartGame.style.borderColor = 'var(--accent)';
        } else {
            els.btnStartGame.style.background = '';
            els.btnStartGame.style.borderColor = '';
        }

        if (els.startGameHint) {
            if (!isHost) {
                els.startGameHint.textContent = '你是加入方：请等待房主点击「开始对战」';
            } else if (bothReady) {
                els.startGameHint.textContent = '双方已准备，点击「开始对战」进入牌桌';
            } else {
                els.startGameHint.textContent = '双方准备后即可开始对战（由房主开始）';
            }
        }
    }

    /** ★再来一局用的【软复位】：只清牌桌浮层与上局残留，★保留房间与连接 ✓
     *  与 resetUI 的区别：resetUI 会把房间界面一起复位 ✗（那是"离开房间"才用的 ✓）
     *  —— 这正是"不重建房间就能再来一局"能成立的关键 ✓ */
    function resetBattle() {
        // ① 关掉所有浮层（不关的话，上一局的牌会飘在第二局上面 ✗）
        if (global.MatchUI && global.MatchUI.closeAll) global.MatchUI.closeAll();
        if (global.EquipChoiceUI && global.EquipChoiceUI.close) global.EquipChoiceUI.close();   // 装备卡离场弹窗 ✓
        if (global.ChainManager && global.ChainManager.forceClose) global.ChainManager.forceClose('rematch');
        if (global.RevealChannel && global.RevealChannel.close) global.RevealChannel.close();
        if (global.CostPanelUI && global.CostPanelUI.close) global.CostPanelUI.close();
        if (global.ViewerUI && global.ViewerUI.hide) global.ViewerUI.hide();
        if (global.CardDetailUI && global.CardDetailUI.hide) global.CardDetailUI.hide();
        // ② 复位"调度期隐藏手牌"标记（不复位的话第二局手牌不会渲染 ✗）
        const handEl = document.getElementById('self-hand');
        if (handEl) handEl.classList.remove('mulligan-hidden');
        // ③ 牌桌保持可见：gameStarted 不动 ✓（第二局不需要重新克隆模板 ✓）
        //    状态本体由 handleGameStart → GameState.initGame 整体重建 ✓
        //    回合与调度内部状态由各自 start() 整体重置 ✓（TurnManager / MulliganManager ✓）
    }

    function resetUI() {
        // 断线/重开：牌桌门禁复位，下次开局重新构建渲染
        gameStarted = false;
        // 清掉上一次连接的路径提示（避免下次建房时显示过期信息）
        showConnectionPath(null);
        document.body.classList.remove('game-started');
        // 兜底：复位「调度期隐藏手牌」标记，确保下一局手牌能正常渲染
        const handEl = document.getElementById('self-hand');
        if (handEl) handEl.classList.remove('mulligan-hidden');
        // 兜底：关闭可能还开着的响应连锁窗口
        if (global.ChainManager && global.ChainManager.forceClose) {
            global.ChainManager.forceClose('reset');
        }
        // 兜底：装备卡离场弹窗（不回大厅时也要关 ✓）
        if (global.EquipChoiceUI && global.EquipChoiceUI.close) global.EquipChoiceUI.close();
        els.btnCreateRoom.disabled = false;      // ★阶段L1：大按钮的文案由它自己管（不再改文本 ✗）
        els.btnJoinRoom.disabled = false;
        els.roomCodeContainer.style.display = 'none';
        els.hostOpponentInfo.style.display = 'none';
        els.joinOpponentInfo.style.display = 'none';
        els.battleWaiting.classList.remove('active');
        els.myReadyStatus.textContent = '未准备';
        els.opponentReadyStatus.textContent = '未准备';
        els.btnReady.textContent = '✅ 准备';
        els.btnStartGame.disabled = true;
        els.btnLobby.disabled = false;
        els.btnDeck.disabled = false;
        // ★阶段L1：复位 = 回大厅（弹窗顺带收起；赛制/局数保留上次选择 ✓）
        switchView('lobby');
        closeAllModals();
        renderMatchConfig();
        updateConnectionUI();
    }

    /**
     * ★阶段L2（修 bug）：点顶部「联机大厅」时到底该去哪个场景？
     *   · 已经在房间里（建房 or 加入）→ 回【VS 准备场景】✓
     *     （老实现一律切空大厅 ✗ → 准备界面被"丢掉"，就没法开始了 ✗）
     *   · 不在房间里 → 回大厅入口 ✓
     * @returns {'vs'|'lobby'} 实际切到哪个场景（便于测试 ✓）
     */
    function goLobby() {
        const { Network } = global;
        const st = (Network && Network.getState) ? Network.getState() : null;
        if (st && (st.isJoined || st.isHost)) {
            switchView('vs');
            updateConnectionUI();
            updateStartButton();
            return 'vs';
        }
        switchView('lobby');
        return 'lobby';
    }

    /* ================= 阶段L1：大厅改版（赛制 / 局数 / 弹窗 / VS 场景） =================
       设计说明（详见 准则规范手册 / 任务进度与待办 阶段L1）：
         · 联机大厅只做"入口"：创建房间 / 加入房间 两个并列大按钮 ✓
         · 赛制：构筑赛（= 现在的玩法 ✓）/ 现开赛 / 轮抽赛
           ★后两种目前只有界面，赛制功能待做 ✗（会在 VS 场景里标注 ✓）
         · 局数：BO1 / BO3 / BO5
           ★目前只是显示与约定项：局间流程（比分 / 换备牌）尚未实现 ✗
         · 建房成功 / 加入成功 → 切到独立的「VS 准备场景」（view-vs ✓）
    ============================================================ */

    const MATCH_MODES = {
        constructed: { label: '构筑赛', hint: '构筑赛 = 用自己保存的卡组对局 ✓' },
        sealed: { label: '现开赛', hint: '现开赛（开包组卡）：界面先就位，功能待做 ✗' },
        draft: { label: '轮抽赛', hint: '轮抽赛（轮流选牌）：界面先就位，功能待做 ✗' }
    };
    const MATCH_BESTS = { 1: 'BO1', 3: 'BO3', 5: 'BO5' };
    const BEST_NOTE = { 1: '一局定胜负', 3: '三局两胜', 5: '五局三胜' };

    let matchConfig = { mode: 'constructed', best: 1 };     // 默认 = 构筑赛 + BO1 ✓
    let createConfirmHandler = null;
    let joinConfirmHandler = null;

    function normalizeConfig(cfg) {
        const c = cfg || {};
        return {
            mode: MATCH_MODES[c.mode] ? c.mode : 'constructed',
            best: MATCH_BESTS[Number(c.best)] ? Number(c.best) : 1
        };
    }

    /** 设置赛制/局数（房主建房时选 ✓；加入方由房主同步过来 ✓） */
    function setMatchConfig(cfg) {
        matchConfig = normalizeConfig(cfg);
        renderMatchConfig();
        return matchConfig;
    }

    function getMatchConfig() { return { mode: matchConfig.mode, best: matchConfig.best }; }

    /** ★阶段L2：大厅「对局方式」下拉 = 赛制 × 局数 的 9 种组合（由 JS 生成 → 单一数据源 ✓） */
    function buildModeOptions() {
        if (!els.modePick) return false;
        const out = [];
        ['constructed', 'sealed', 'draft'].forEach(m => {
            [1, 3, 5].forEach(b => {
                const note = '（' + BEST_NOTE[b] + '）' + (m === 'constructed' ? '' : ' · 功能待做');
                out.push('<option value="' + m + ':' + b + '">'
                    + MATCH_MODES[m].label + ' · ' + MATCH_BESTS[b] + note + '</option>');
            });
        });
        els.modePick.innerHTML = out.join('');
        return true;
    }

    function renderMatchConfig() {
        const M = MATCH_MODES[matchConfig.mode] || MATCH_MODES.constructed;
        if (els.mcMode) els.mcMode.textContent = M.label;
        if (els.mcBest) els.mcBest.textContent = MATCH_BESTS[matchConfig.best] || 'BO1';
        if (els.mcHint) els.mcHint.textContent = M.hint;
        if (els.modeHint) els.modeHint.textContent = M.hint;
        if (els.modePick) els.modePick.value = matchConfig.mode + ':' + matchConfig.best;   // 下拉同步 ✓
        if (els.modeRow && els.modeRow.querySelectorAll) {
            els.modeRow.querySelectorAll('.opt').forEach(b => {
                b.classList.toggle('is-active', b.getAttribute('data-mode') === matchConfig.mode);
            });
        }
        if (els.bestRow && els.bestRow.querySelectorAll) {
            els.bestRow.querySelectorAll('.opt').forEach(b => {
                b.classList.toggle('is-active', Number(b.getAttribute('data-best')) === matchConfig.best);
            });
        }
    }


    function openModal(el) { if (el) el.hidden = false; }
    function closeModal(el) { if (el) el.hidden = true; }
    function closeAllModals() { closeModal(els.createRoomModal); closeModal(els.joinRoomModal); }

    /** 打开「创建房间」弹窗（确认时回调 {mode,best} ✓） */
    function openCreateDialog(onConfirm) {
        renderMatchConfig();
        createConfirmHandler = typeof onConfirm === 'function' ? onConfirm : null;
        openModal(els.createRoomModal);
        return true;
    }

    /** 打开「加入房间」弹窗（确认时回调房间号文本 ✓） */
    function openJoinDialog(onConfirm) {
        joinConfirmHandler = typeof onConfirm === 'function' ? onConfirm : null;
        if (els.joinPasswordInput) els.joinPasswordInput.value = '';
        openModal(els.joinRoomModal);
        setTimeout(() => { try { if (els.joinPasswordInput) els.joinPasswordInput.focus(); } catch (e) { /* 忽略 */ } }, 30);
        return true;
    }

    /** 弹窗内的事件接线（ui.js 在 body 末尾加载 → 此时 DOM 已就绪 ✓） */
    function bindDialogEvents() {
        const on = (el, fn) => { if (el && el.addEventListener) el.addEventListener('click', fn); };
        const pick = (row, attr, fn) => {
            if (!row || !row.addEventListener) return;
            row.addEventListener('click', e => {
                const btn = e.target && e.target.closest ? e.target.closest('.opt') : null;
                if (!btn) return;
                fn(btn.getAttribute(attr));
            });
        };
        pick(els.modeRow, 'data-mode', v => setMatchConfig({ mode: v, best: matchConfig.best }));
        pick(els.bestRow, 'data-best', v => setMatchConfig({ mode: matchConfig.mode, best: v }));

        on(els.btnCreateRoomClose, () => closeModal(els.createRoomModal));
        on(els.btnCreateCancel, () => closeModal(els.createRoomModal));
        on(els.btnJoinRoomClose, () => closeModal(els.joinRoomModal));
        on(els.btnJoinCancel, () => closeModal(els.joinRoomModal));

        on(els.btnCreateConfirm, () => {
            closeModal(els.createRoomModal);
            if (createConfirmHandler) createConfirmHandler(getMatchConfig());
        });
        on(els.btnJoinConfirm, () => {
            const code = els.joinPasswordInput ? els.joinPasswordInput.value.trim() : '';
            if (!code) return;                       // 空房间号：不关窗（等用户填 ✓）
            closeModal(els.joinRoomModal);
            if (joinConfirmHandler) joinConfirmHandler(code);
        });
        if (els.joinPasswordInput && els.joinPasswordInput.addEventListener) {
            els.joinPasswordInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); if (els.btnJoinConfirm) els.btnJoinConfirm.click(); }
            });
        }
        // ★阶段L2：大厅「对局方式」下拉
        if (els.modePick && els.modePick.addEventListener) {
            els.modePick.addEventListener('change', () => {
                const parts = String(els.modePick.value || '').split(':');
                setMatchConfig({ mode: parts[0], best: parts[1] });
            });
        }
        // 点遮罩（弹窗外的暗色区）关闭 ✓
        [els.createRoomModal, els.joinRoomModal].forEach(mask => {
            if (!mask || !mask.addEventListener) return;
            mask.addEventListener('click', e => { if (e.target === mask) mask.hidden = true; });
        });
    }
    bindDialogEvents();
    buildModeOptions();
    renderMatchConfig();

    function initBattlefield() {
        if (battlefieldInitialized) return;
        battlefieldInitialized = true;

        [
            els.selfFrontField, els.selfBackField,
            els.opponentFrontField, els.opponentBackField,
            els.publicField,
            els.selfCostZone, els.opponentCostZone,
            els.selfDeckZone, els.opponentDeckZone
        ].forEach(el => { if (el) el.innerHTML = ''; });

        els.selfFrontField.appendChild(FieldUI.createFieldZone('self', 'front'));
        els.selfBackField.appendChild(FieldUI.createFieldZone('self', 'back'));
        els.opponentFrontField.appendChild(FieldUI.createFieldZone('opponent', 'front'));
        els.opponentBackField.appendChild(FieldUI.createFieldZone('opponent', 'back'));
        // 注意：公共区（#public-field）已从界面移除，公开功能后续重做；此处保持容错，DOM 不存在时跳过
        if (els.publicField) {
            els.publicField.appendChild(FieldUI.createFieldZone('public', 'public'));
        }
        // 直接复用 index.html 中已有的 .cost-zone / .deck-zone 容器，避免嵌套两层
        CostUI.createCostZone('self', els.selfCostZone);
        CostUI.createCostZone('opponent', els.opponentCostZone);
        DeckUI.createDeckZone('self', els.selfDeckZone);
        DeckUI.createDeckZone('opponent', els.opponentDeckZone);
        els.selfHand.innerHTML = '<div class="hand-placeholder">手牌区</div>';

        CardDetailUI.initHoverEvents();

        if (HealthUI) {
            HealthUI.init(els);
        }

        // 对局日志：初始化 + 清空 + 悬浮面板开关
        if (global.BattleLog) {
            global.BattleLog.init();
        }
        if (els.btnClearLog) {
            els.btnClearLog.addEventListener('click', () => {
                if (global.BattleLog) global.BattleLog.clear();
            });
        }
        if (els.btnToggleLog && els.battleLogPanel) {
            els.btnToggleLog.addEventListener('click', () => {
                const opened = els.battleLogPanel.classList.toggle('open');
                els.btnToggleLog.classList.toggle('active', opened);
                // 展开即定位到最新一条，不需要玩家自己滚到底
                if (opened && global.BattleLog && global.BattleLog.scrollToBottom) {
                    global.BattleLog.scrollToBottom();
                }
            });
        }
        if (els.btnCloseLog && els.battleLogPanel) {
            els.btnCloseLog.addEventListener('click', () => {
                els.battleLogPanel.classList.remove('open');
                if (els.btnToggleLog) els.btnToggleLog.classList.remove('active');
            });
        }

        if (els.btnEndTurn) {
            els.btnEndTurn.addEventListener('click', () => {
                if (global.TurnManager) {
                    global.TurnManager.endTurn();
                    updateTurnUI();
                }
            });
        }
    }

    function renderBattlefield() {
        const { GameState } = global;
        if (!GameState || !GameState.getState()) return;

        const selfHand = GameState.getHand('self');
        CardUI.renderHand(els.selfHand, selfHand);

        const selfPlayer = GameState.getPlayerState('self');
        if (selfPlayer) {
            FieldUI.renderFieldZone(els.selfFrontField, selfPlayer.frontField, 'self', 'front');
            FieldUI.renderFieldZone(els.selfBackField, selfPlayer.backField, 'self', 'back');
            CostUI.renderCostZone(els.selfCostZone, selfPlayer.costZone);
            DeckUI.updateDeckCounts(els.selfDeckZone, selfPlayer);
        }

        const opponentPlayer = GameState.getPlayerState('opponent');
        if (opponentPlayer) {
            FieldUI.renderFieldZone(els.opponentFrontField, opponentPlayer.frontField, 'opponent', 'front', false);
            FieldUI.renderFieldZone(els.opponentBackField, opponentPlayer.backField, 'opponent', 'back', false);
            CostUI.renderCostZone(els.opponentCostZone, opponentPlayer.costZone, false);
            DeckUI.updateDeckCounts(els.opponentDeckZone, opponentPlayer);
        }

        // 公共区：界面已移除（后续重做），仅在 DOM 存在时渲染，保持游戏状态兼容
        if (els.publicField) {
            const publicFieldData = GameState.getState().publicField || new Array(5).fill(null);
            FieldUI.renderFieldZone(els.publicField, publicFieldData, 'public', 'public', false);
        }

        updateHandCounts();
        if (HealthUI) {
            HealthUI.updateDisplay();
        }
        updateTurnUI();
        applyCardMarkers();
    }

    function updateHandCounts() {
        const { GameState } = global;
        if (!GameState || !GameState.getState()) return;

        const selfPlayer = GameState.getPlayerState('self');
        if (selfPlayer) {
            let main = 0, cost = 0;
            selfPlayer.hand.forEach(instance => {
                if (!instance) return;
                const card = instance.cardData || global.CardLibrary.getCardById(instance.cardId);
                if (card && card.type === 'cost') cost++;
                else main++;
            });
            if (els.selfHandMainCount) els.selfHandMainCount.textContent = main;
            if (els.selfHandCostCount) els.selfHandCostCount.textContent = cost;
        }

        const oppPlayer = GameState.getPlayerState('opponent');
        if (oppPlayer) {
            if (els.opponentHandMainCount) els.opponentHandMainCount.textContent = oppPlayer.handMainCount || 0;
            if (els.opponentHandCostCount) els.opponentHandCostCount.textContent = oppPlayer.handCostCount || 0;
        }
    }

    // 右边缘回合刻度尺已移除；回合数只在中央分界线（#dividerText）显示

    function updateTurnUI() {
        if (!els.btnEndTurn) return;
        const { TurnManager } = global;
        if (!TurnManager) return;
        const currentPlayer = TurnManager.getCurrentPlayer();
        const turnCount = TurnManager.getTurnCount();
        const isMyTurn = currentPlayer === 'self';

        // ★阶段T1（修 bug）：回合数只在【开局后】才有内容 ✓
        //   （老问题：导航条里写死了"第1回合" → 没开局就显示 ✗；turnCount 为 0 时也别显示 ✗）
        if (els.navTurnCountDisplay) {
            els.navTurnCountDisplay.textContent = (gameStarted && turnCount) ? `第${turnCount}回合` : '';
        }

        // 中央分界线文字（回合归属）：这是界面上唯一的回合数显示
        if (els.dividerText) {
            els.dividerText.textContent = turnCount
                ? `第 ${turnCount} 回合 · ${isMyTurn ? '你的回合' : '对方回合'}`
                : '等待开始';
        }

        // 结束回合按钮
        els.btnEndTurn.textContent = isMyTurn ? '结束回合' : '对方回合';
        els.btnEndTurn.disabled = !isMyTurn;
        els.btnEndTurn.classList.toggle('is-active-turn', isMyTurn);

        // 牌桌整体状态类：便于用 CSS 提示当前是谁的回合
        if (els.viewBattle) {
            els.viewBattle.classList.toggle('self-turn', isMyTurn);
            els.viewBattle.classList.toggle('opponent-turn', !isMyTurn);
        }
    }

    function applyCardMarkers() {
        const { GameState } = global;
        if (!GameState || !GameState.getState()) return;

        document.querySelectorAll('[data-instance-id]').forEach(cardEl => {
            const instanceId = cardEl.getAttribute('data-instance-id');
            if (!instanceId) return;

            const cardInstance = findCardInstance(instanceId);
            if (!cardInstance) return;

            cardEl.classList.remove('exhausted', 'entered-this-turn');
            const oldEnterBadge = cardEl.querySelector('.enter-badge');
            if (oldEnterBadge) oldEnterBadge.remove();

            if (cardInstance.active === false) {
                cardEl.classList.add('exhausted');
            } else {
                cardEl.classList.remove('exhausted');
            }

            // 「本回合进入战场」标记（1.2）：青色描边 + 左上角「新」角标
            // 以前这里是随从入场自动「切换」（横置灰化），现已改为纯标记 ✓
            // 只对"确实在前场"的卡显示（避免效果代码直接改 zone 时残留标记 ✗）
            const FRONT = global.GameState.ZONE ? global.GameState.ZONE.FRONT_FIELD : 'frontField';
            if (cardInstance.enteredThisTurn && cardInstance.zone === FRONT) {
                cardEl.classList.add('entered-this-turn');
                const enterBadge = document.createElement('span');
                enterBadge.className = 'enter-badge';
                enterBadge.textContent = '新';
                enterBadge.title = '本回合进入战场';
                cardEl.appendChild(enterBadge);
            }

            // ===== 来源特效框（转移控制权 / 复制出来的卡，见 css/card-origin.css）=====
            // 让这些卡在战场 / 手牌 / 费用区都能一眼区别出来 ✓
            cardEl.classList.remove('is-transferred', 'is-copy');
            const oldOriginTag = cardEl.querySelector('.origin-tag');
            if (oldOriginTag) oldOriginTag.remove();

            const origin = cardInstance.origin;
            if (origin === 'transfer' || origin === 'copy') {
                cardEl.classList.add(origin === 'transfer' ? 'is-transferred' : 'is-copy');
                const originTag = document.createElement('span');
                originTag.className = 'origin-tag ' + origin;
                originTag.textContent = origin === 'transfer' ? '转' : '复';
                originTag.title = origin === 'transfer' ? '这张牌的控制权已被转移' : '这是复制出来的卡牌';
                cardEl.appendChild(originTag);      // 注意：必须晚于「新」标记，角标才不会重叠 ✓
            }

            if (cardInstance.cardData && cardInstance.cardData.type === 'minion') {
                const atkBadge = cardEl.querySelector('.atk-badge');
                const defBadge = cardEl.querySelector('.def-badge');
                if (atkBadge && cardInstance.currentAttack != null) {
                    atkBadge.textContent = cardInstance.currentAttack;
                }
                if (defBadge && cardInstance.currentDefense != null) {
                    defBadge.textContent = cardInstance.currentDefense;
                }
            }

            if (global.TraitUI && global.TraitUI.renderCardTraits) {
                global.TraitUI.renderCardTraits(cardEl, cardInstance);
            }
        });
    }

    /**
     * 卡牌实例查找（返回卡牌本体）
     * 框架整理：原先 ui / cardDetailUI / sidePanel / equipController / dragController
     * 各写了一份几乎相同的实现，现统一委托给 CardActions.findCardInstance（唯一实现）。
     */
    function findCardInstance(instanceId) {
        const CA = global.CardActions;
        if (!CA || typeof CA.getCardInstance !== 'function') return null;
        return CA.getCardInstance(instanceId);
    }

    // ===== 对战界面渲染门禁 =====
    // 需求：不在联机大厅阶段就渲染牌桌；只有真正开局后（房主点「开始对战」/ 加入方收到开局消息）才构建并渲染。
    let gameStarted = false;

    function markGameStarted() {
        gameStarted = true;
        document.body.classList.add('game-started');
        // 开局后才允许把本地操作日志转发给对手（大厅阶段不转发）
        if (global.BattleLog && global.BattleLog.setRelayEnabled) {
            global.BattleLog.setRelayEnabled(true);
        }
    }

    function isGameStarted() {
        return gameStarted;
    }

    function refreshAll() {
        if (!gameStarted) return;               // 未开局：完全不碰牌桌 DOM
        buildBattleView();                      // 需要时才克隆战斗视图模板
        if (!battlefieldInitialized) initBattlefield();
        renderBattlefield();
    }

    function showBattleView() {
        if (!gameStarted) return;               // 未开局：连战斗视图都不切换
        buildBattleView();                      // 克隆模板 + 重新解析元素引用
        switchView('battle');
        if (!battlefieldInitialized) initBattlefield();
        renderBattlefield();
    }

    function renderCardLibrary() {
        CardUI.renderCardLibrary(els.cardLibrary);
    }

    global.UI = {
        els,
        showNotification,
        switchView,
        registerViewHook,
        renderCardLibrary,
        updateConnectionUI,
        updateStartButton,
        resetUI,
        resetBattle,                 // ★再来一局：软复位（只清浮层，保留房间 ✓）
        goLobby,
        buildModeOptions,
        // ★阶段L1：大厅改版（创建/加入弹窗 + 赛制局数 + VS 场景）
        openCreateDialog,
        openJoinDialog,
        closeAllModals,
        setMatchConfig,
        getMatchConfig,
        renderMatchConfig,
        MATCH_MODES,
        MATCH_BESTS,
        initBattlefield,
        renderBattlefield,
        markGameStarted,
        isGameStarted,
        buildBattleView,
        onBattleViewReady,
        isBattleViewBuilt,
        updateHandCounts,
        updateTurnUI,
        refreshAll,
        showBattleView,
        showConnectionPath,
        applyCardMarkers,
        CardUI,
        FieldUI,
        CostUI,
        DeckUI,
        CardDetailUI,
        HealthUI
    };
})(window);