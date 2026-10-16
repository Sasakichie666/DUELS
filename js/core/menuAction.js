// js/core/menuAction.js
// 菜单动作模块：处理需要选择目标格子的卡牌操作（登场、发动、支付、盖伏）及无需选择格子的操作
// 注意：装备目标选择已移至独立模块 equipController.js

(function(global) {
    const PUBLIC_REVEAL_ORDER = [2, 1, 3, 0, 4];

    /* ===== 选格流程：已外迁到 js/ui/targetFlowUI.js（阶段4：core 不碰 DOM ✓）=====
       这里保留同名转发 → 调用点（含 controlManager 的转移 / 复制）一行都不用改 ✓ */
    function startSelection(card, targetZone) {
        return global.TargetFlowUI ? global.TargetFlowUI.startSelection(card, targetZone) : false;
    }

    function startSelectionMultiZone(card, zones, faceDown) {
        return global.TargetFlowUI ? global.TargetFlowUI.startSelectionMultiZone(card, zones, faceDown) : false;
    }

    function startSelectionOnSide(zoneOrZones, side, onPick) {
        return global.TargetFlowUI
            ? global.TargetFlowUI.startSelectionOnSide(zoneOrZones, side, onPick) : false;
    }

    function cancelSelection() {
        if (global.TargetFlowUI) global.TargetFlowUI.cancelSelection();
    }

    /* 选格流程的底层实现（点亮空格 / 高亮清理 / 全局取消）已外迁到 js/ui/targetFlowUI.js ✓ */

    /* 选格流程的入口（startSelection / startSelectionMultiZone / 落子）已外迁到 js/ui/targetFlowUI.js ✓ */

    /* 「点格子」通用流程（含对方半场）与格子解析已外迁到 js/ui/targetFlowUI.js ✓ */

    // ========== 直接动作（不需要选格子，直接改状态） ==========

    /** 统一刷新界面（模块/方法缺失时静默跳过） */
    function refreshAll() {
        if (global.StateCommit) global.StateCommit.refresh();
    }

    /** 统一提示 */
    function notify(msg, type) {
        if (global.UI && global.UI.showNotification) global.UI.showNotification(msg, type || 'info');
    }

    /**
     * 动作统一收口：取消选择 → 执行 → 成功刷新 / 失败提示
     * （原来是 6 个各自挤成一行、300+ 字符的 if/else，重复度极高）
     */
    function runCardAction(card, action, failMsg) {
        cancelSelection();
        const ok = action(card);
        if (ok) refreshAll();
        else if (failMsg) notify(failMsg, 'error');
        return ok;
    }

    function returnToHand(card) {
        return runCardAction(card, c => {
            c.faceDown = false;      // 回手默认正面
            return global.CardActions.moveCard(c.instanceId, global.GameState.ZONE.HAND, -1);
        }, '回手失败');
    }

    function discard(card) {
        // 进墓回到【所有者】的墓场（控制权可能已转移，但归属不变 ✓）
        const ok = runCardAction(card,
            c => global.CardActions.moveCard(c.instanceId, global.GameState.ZONE.GRAVEYARD, -1,
                { toPlayer: c.owner || 'self' }),
            '进墓失败');
        notifyOwnerIfNeeded(card, 'graveyard');
        return ok;
    }

    function exile(card) {
        // 放逐回到【所有者】的放逐区（同上 ✓）
        const ok = runCardAction(card,
            c => global.CardActions.moveCard(c.instanceId, global.GameState.ZONE.EXILE, -1,
                { toPlayer: c.owner || 'self' }),
            '放逐失败');
        notifyOwnerIfNeeded(card, 'exile');
        return ok;
    }

    /**
     * 改动的是【对方的区域】时，单独通知对方 ✓
     * （常规同步只发送自己那一侧，"我的牌落进对方的墓场"这类改动传不过去 ✗）
     */
    function notifyOwnerIfNeeded(card, zone, atTop) {
        if (!card || (card.owner || 'self') === 'self') return;
        if (global.CardHandoverChannel && global.CardHandoverChannel.handover) {
            global.CardHandoverChannel.handover(card, { zone: zone, atTop: !!atTop });
        }
    }

    function toggleFaceDown(card) {
        return runCardAction(card, c => global.CardActions.toggleCardFaceDown(c), '翻盖失败');
    }

    /**
     * 「回库」：保留 顶 / 底 两个选项，但不再让玩家去挑"哪个牌库" ——
     * 费用牌 → 费用牌库；其余 → 主牌库 ✓
     */
    function returnToDeck(card) {
        cancelSelection();
        // 锚点元素由 UI 模块提供（core 不直接查 DOM ✓）
        const anchorEl = (global.UIKit && global.UIKit.findCardEl)
            ? global.UIKit.findCardEl(card.instanceId) : null;
        if (!anchorEl) return;

        const isCost = !!(card.cardData && card.cardData.type === 'cost');
        const deck = isCost ? 'costDeck' : 'mainDeck';
        const deckName = isCost ? '费用牌库' : '主牌库';

        global.MenuUI.show({
            items: [
                { label: '回' + deckName + '顶', value: 'returnToTop', tone: 'danger' },
                { label: '回' + deckName + '底', value: 'returnToBottom', tone: 'danger' }
            ],
            anchorEl: anchorEl,
            onSelect: (value) => {
                cancelSelection();
                const atTop = (value === 'returnToTop');
                const ok = atTop
                    ? global.CardActions.returnCardToDeckTop(card.owner, deck, card)
                    : global.CardActions.returnCardToDeckBottom(card.owner, deck, card);
                // 改动的是【对方的牌库】时，单独通知对方 ✓（常规同步传不过去 ✗）
                if (ok && card.owner && card.owner !== 'self' &&
                    global.CardHandoverChannel && global.CardHandoverChannel.handover) {
                    global.CardHandoverChannel.handover(card, { zone: deck, atTop: atTop });
                }
                if (ok) refreshAll();
                else notify('回库失败', 'error');
            }
        });
    }

    function returnToMainDeckTop(card) {
        return runCardAction(card,
            c => global.CardActions.returnCardToDeckTop(c.owner, 'mainDeck', c),
            '回主牌库顶失败');
    }

    function returnToMainDeckBottom(card) {
        return runCardAction(card,
            c => global.CardActions.returnCardToDeckBottom(c.owner, 'mainDeck', c),
            '回主牌库底失败');
    }

    /** 「公开」：把主牌库的牌翻到公共区第一个空位（落点顺序见 PUBLIC_REVEAL_ORDER） */
    function publicReveal() {
        cancelSelection();
        const state = global.GameState.getState();
        if (!state) return;

        const targetIndex = PUBLIC_REVEAL_ORDER.find(idx => state.publicField[idx] === null);
        if (targetIndex === undefined) {
            notify('公共区已满', 'warning');
            return;
        }
        const ok = global.CardActions.moveCardFromDeckToZone(
            'self', 'mainDeck', global.GameState.ZONE.PUBLIC_FIELD, targetIndex);
        if (ok) refreshAll();
        else notify('公开失败', 'error');
    }

    /** 查阅某一堆（只读翻阅，最新的排在最前） */
    function viewZone(zoneKey, title) {
        cancelSelection();
        const state = global.GameState.getState();
        if (!state) return;
        const cards = state.players.self[zoneKey].slice().reverse();
        if (global.ViewerUI) global.ViewerUI.show(cards, title);
    }

    /**
     * 查阅（墓场 / 放逐区）：与检索同一套界面、同一套落点动作，差异只有两点 ✓
     *   · 事先不告知对方（仅查阅 = 纯私下 ✓）；一旦取牌才弹"查阅了这张" ✓
     *   · 不洗切 ✓
     * 实现在 js/ui/deckTakeUI.js 的 browse 模式 ✓
     */
    /**
     * ★查阅（墓场 / 放逐区）→ 统一走费用区那套【批量面板】✓
     *   · 点卡牌 = 只做标记（可同时标多张 ✓）→ 点下方按钮批量执行 ✓
     *   · 不再是"一点就走单张"的落点面板 ✗
     *   · 面板缺失时退回旧的单张查阅面板（DeckTakeUI.openBrowse ✓ 兜底）
     */
    function openPilePanel(zone) {
        if (global.CostPanelUI && global.CostPanelUI.open) {
            global.CostPanelUI.open(zone);
            return true;
        }
        return !!(global.DeckTakeUI && global.DeckTakeUI.openBrowse(zone));
    }

    function viewGraveyard() { return openPilePanel('graveyard'); }
    function viewExile() { return openPilePanel('exile'); }

    // 目标区域中文名（检索落点提示用）
    const DEST_LABEL = {
        hand: '手牌',
        frontField: '前场',
        backField: '后场',
        graveyard: '墓场',
        exile: '放逐区',
        // ★翻阅专属：回顶 / 回底（真实牌库名由「卡牌类型」决定 → 文案在 returnCardToDeck 里拼 ✓）
        deckTop: '牌库顶',
        deckBottom: '牌库底'
    };

    // 落点 key → 区域常量名（替代原来那一长串三元表达式）
    const DEST_ZONE_KEY = {
        hand: 'HAND',
        frontField: 'FRONT_FIELD',
        backField: 'BACK_FIELD',
        graveyard: 'GRAVEYARD',
        exile: 'EXILE'
    };

    // 找某区域第一个空位（前场/后场各 5 格）
    function firstEmptySlot(playerState, zoneKey) {
        const arr = playerState[zoneKey];
        if (!Array.isArray(arr)) return -1;
        return arr.findIndex(c => !c);
    }

    /**
     * ★翻阅「回顶 / 回底」：按【卡牌类型】把牌放回对应牌库的顶 / 底 ✓
     *   费用卡 → 费用牌库 · 传说系列 → 传说牌库 · 其余 → 主牌库
     *   （★这也算"处理完一张" → 照常告知对方，翻阅的剩余张数会 -1 ✓）
     * @returns {boolean} 是否成功
     */
    function returnCardToDeck(cardInstance, toTop, fromDeckType, o) {
        const CA = global.CardActions;
        if (!CA || typeof CA.deckTypeForCard !== 'function') { notify('回库功能未加载', 'error'); return false; }

        const backType = CA.deckTypeForCard(cardInstance);                 // ★按类型选库 ✓
        const label = `放回${CA.deckLabelFor ? CA.deckLabelFor(backType) : '牌库'}${toTop ? '顶' : '底'}`;
        const ok = toTop
            ? CA.returnCardToDeckTop('self', backType, cardInstance)
            : CA.returnCardToDeckBottom('self', backType, cardInstance);
        if (!ok) { notify('回库失败', 'error'); return false; }

        const card = cardInstance.cardData || global.CardLibrary.getCardById(cardInstance.cardId);
        if (global.BattleLog) {
            global.BattleLog.log(`「${card ? card.name : '未知'}」→ ${label}`, 'self');
        }

        // 与"取牌"走同一套告知（只是落点不同 ✓）
        const noticeMode = (o && o.notify) || 'none';
        const RC = global.RevealChannel;
        if (noticeMode === 'peek' && RC && RC.notePeekTaken) {
            RC.notePeekTaken({ card: cardInstance, destLabel: label });
        } else if (noticeMode === 'browse' && RC && RC.noteBrowseTaken) {
            RC.noteBrowseTaken({ zone: fromDeckType, destLabel: label, card: cardInstance });
        } else if (noticeMode === 'search' && RC && RC.showSearchResult) {
            RC.showSearchResult({ zone: fromDeckType, destLabel: label, card: cardInstance });
        }
        refreshAll();
        return true;
    }

    // 检索取牌：从牌库把指定卡移到目标区域，并洗切牌库
    //   opts.silent    = true → 不告知对方（翻阅流程里对方已在看展示 ✓）
    //   opts.noShuffle = true → 不洗切（翻阅取牌保留牌库顶顺序 ✓）
    function takeCardFromDeck(deckType, cardInstance, action, opts) {
        const o = opts || {};
        const Z = global.GameState.ZONE;
        const dest = DEST_LABEL[action] ? action : 'hand';

        // ★回顶 / 回底：不进手牌 / 墓场，而是按「卡牌类型」回对应牌库 ✓
        if (dest === 'deckTop' || dest === 'deckBottom') {
            return returnCardToDeck(cardInstance, dest === 'deckTop', deckType, o);
        }

        const toZone = Z[DEST_ZONE_KEY[dest]];

        const state = global.GameState.getState();
        if (!state) return false;
        const self = state.players.self;

        let toIndex = -1;
        if (toZone === Z.FRONT_FIELD || toZone === Z.BACK_FIELD) {
            toIndex = firstEmptySlot(self, toZone);
            if (toIndex === -1) {
                notify(`${DEST_LABEL[dest]}已满`, 'warning');
                return false;
            }
        }

        const ok = global.CardActions.moveSpecificCardFromDeckToZone('self', deckType, cardInstance.instanceId, toZone, toIndex);
        if (!ok) {
            notify('取牌失败', 'error');
            return false;
        }

        // 检索后洗切（常规规则；翻阅取牌不洗切，保留"牌库顶"语义 ✓）
        if (!o.noShuffle) global.CardActions.shuffleDeck('self', deckType);

        const card = cardInstance.cardData || global.CardLibrary.getCardById(cardInstance.cardId);

        // ★取牌后的"告知对方"统一收口（模式由 js/ui/deckTakeUI.js 的 take() 指定）：
        //   'search' 检索 → "检索告知"        'peek' 翻阅 → "翻到了这张牌"
        //   'browse' 查阅 → "查阅了这张"      'none' → 不告知（仅查阅 ✓）
        //   （peekNote / silent 是旧写法，保留兼容 ✓）
        const noticeMode = o.notify || (o.peekNote ? 'peek' : (o.silent ? 'none' : 'search'));
        const verb = noticeMode === 'peek' ? '翻阅' : (noticeMode === 'browse' ? '查阅' : '检索');

        if (global.BattleLog) {
            global.BattleLog.log(`${verb}「${card ? card.name : '未知'}」→ ${DEST_LABEL[dest]}`, 'self');
        }

        const RC = global.RevealChannel;
        if (noticeMode === 'peek' && RC && RC.notePeekTaken) {
            RC.notePeekTaken({ card: cardInstance, destLabel: DEST_LABEL[dest] });
        } else if (noticeMode === 'browse' && RC && RC.noteBrowseTaken) {
            RC.noteBrowseTaken({ zone: deckType, destLabel: DEST_LABEL[dest], card: cardInstance });
        } else if (noticeMode === 'search' && RC && RC.showSearchResult) {
            RC.showSearchResult({
                zone: deckType,
                destLabel: DEST_LABEL[dest],
                card: cardInstance
            });
        }
        refreshAll();
        return true;        // 供"翻阅"等调用方判断是否真的取走了牌 ✓
    }


    /**

    /* ================= 检索 / 翻阅（统一委托给 DeckTakeUI ✓） ================= */
    // 两者只是"取牌范围 + 取牌后处理"不同，界面与落点动作完全共用
    // 实现与差异点集中在 js/ui/deckTakeUI.js ✓

    /**
     * 检索：整个牌库 ★改为"批量面板"打法（与费用区 / 查阅同一套 ✓）
     *   · 点卡牌 = 只标记（可多张）→ 点下方按钮批量执行 ✓
     *   · ★整批处理完【自动洗切该牌库】（★这是与"查阅"唯一的不同 ✓）
     *   · 面板没支持该牌库（如传说牌库）→ 退回旧的单张检索面板（兜底 ✓）
     */
    function searchDeck(deckType) {
        cancelSelection();
        const CP = global.CostPanelUI;
        if (CP && CP.open && CP.ACTIONS && CP.ACTIONS[deckType]) {
            CP.open(deckType);
            return true;
        }
        return !!(global.DeckTakeUI && global.DeckTakeUI.openSearch(deckType));
    }

    // 查阅（只读翻阅牌库，不做任何移动）
    function viewDeck(deckType) {
        cancelSelection();
        const state = global.GameState.getState();
        if (!state) return;
        const deck = state.players.self[deckType];
        if (!Array.isArray(deck) || deck.length === 0) {
            notify('牌库是空的', 'warning');
            return;
        }
        const titleMap = { mainDeck: '主牌库查阅', costDeck: '费用牌库查阅', legendDeck: '传说牌库查阅' };
        if (global.ViewerUI) {
            global.ViewerUI.show(deck.slice(), titleMap[deckType] || '牌库查阅', null, { hint: '只读翻阅，不会移动卡牌' });
        }
    }

    /**
     * 翻阅：先问张数 → 只显示牌库顶 N 张
     * （取牌后不洗切 + 告知对方"翻到了这张" ✓；界面与落点动作与检索完全共用 ✓）
     */
    function peekDeck(deckType, anchorEl) {
        cancelSelection();
        const state = global.GameState.getState();
        const deck = state && state.players && state.players.self ? state.players.self[deckType] : null;
        if (!Array.isArray(deck) || deck.length === 0) {
            notify('牌库是空的', 'warning');
            return false;
        }
        if (!global.DeckTakeUI || !global.RevealPanelUI || !global.RevealPanelUI.askCount) {
            notify('取牌界面未加载，无法翻阅', 'error');
            return false;
        }
        global.RevealPanelUI.askCount({
            anchorEl: anchorEl || null,
            title: `翻阅${global.DeckTakeUI.zoneLabel(deckType)}几张？`,
            defaultValue: 1,
            onSubmit: (n) => global.DeckTakeUI.openPeek(deckType, n)
        });
        return true;
    }

    function toggleActive(card) {
        cancelSelection();
        if (!card) return;
        card.active = !card.active;
        if (global.UI && global.UI.applyCardMarkers) global.UI.applyCardMarkers();
        if (card.owner === 'self' && global.SyncManager && global.Network && global.Network.getState().isConnected) {
            global.SyncManager.sendPublicState('self');
        }
    }

    /* ===== 攻防修改弹窗：已外迁到 js/ui/statEditorUI.js（阶段4 拆分：core 不碰 DOM ✓）=====
       这里保留同名转发 → 调用点一行都不用改 ✓ */
    function modifyStats(card, anchorEl) {
        if (global.StatEditorUI) global.StatEditorUI.open(card, anchorEl);
    }

    /** 浮层定位：统一走 UIKit（原实现已一并外迁 ✓） */
    function positionMenu(menuEl, anchorEl) {
        if (global.UIKit) global.UIKit.positionFloating(menuEl, anchorEl);
    }

    // ========== 菜单入口 ==========
    function playToFront(card) { card.faceDown = false; startSelection(card, 'frontField'); }

    // ===== 响应连锁：两个"产生时点"的动作入口（只广播，不改动任何数据） =====
    function declareAttack(card) {
        if (!card || !global.TimePointBus) return;
        global.TimePointBus.emit({
            type: 'attack:declare',
            actor: (card.controller || card.owner) === 'opponent' ? 'opponent' : 'self',
            card
        });
    }

    function activateEffect(card) {
        if (!card || !global.TimePointBus) return;
        global.TimePointBus.emit({
            type: 'minion:effect',
            actor: (card.controller || card.owner) === 'opponent' ? 'opponent' : 'self',
            card
        });
    }
    function activateToBack(card) { card.faceDown = false; startSelection(card, 'backField'); }
    function payToCost(card) { card.faceDown = false; startSelection(card, 'costZone'); }
    function setFaceDown(card) { startSelectionMultiZone(card, ['frontField', 'backField'], true); }

    global.MenuAction = {
        playToFront,
        activateToBack,
        payToCost,
        declareAttack,
        activateEffect,
        returnToHand,
        discard,
        exile,
        returnToDeck,
        setFaceDown,
        toggleFaceDown,
        returnToMainDeckTop,
        returnToMainDeckBottom,
        publicReveal,
        viewGraveyard,
        viewExile,
        searchDeck,
        peekDeck,
        // ★取牌入口：翻阅面板要复用它（以前没导出 → 翻阅里点"加入手牌/登场"没反应 ✗）
        takeCardFromDeck,
        viewDeck,
        // 转移控制权 / 复制卡牌的选格入口（见 js/core/controlManager.js）✓
        startSelectionOnSide,
        // 这两个是原有接口，必须保留 ✓
        cancelSelection,
        toggleActive,
        modifyStats
        // 注意：不再包含 startEquipSelection
    };
})(window);