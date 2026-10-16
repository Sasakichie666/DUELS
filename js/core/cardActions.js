// js/core/cardActions.js
// 卡牌底层操作模块：从 gameState 迁移过来的原子操作，不包含菜单业务语义
// 修改：支持传说牌库 legendDeck 的抽牌、移回、检索、洗切；装备逻辑保持不变

(function(global) {
    const GameState = global.GameState;
    const ZoneManager = global.ZoneManager;

    function drawFromDeck(player, deckType, count = 1) {
        const state = GameState.getState();
        if (!state) return [];
        const playerState = state.players[player];
        if (!playerState) return [];

        const deck = playerState[deckType];
        const drawnCards = [];

        for (let i = 0; i < count; i++) {
            if (deck.length === 0) break;
            const card = deck.shift();
            card.zone = GameState.ZONE.HAND;
            card.zoneIndex = playerState.hand.length;
            playerState.hand.push(card);
            drawnCards.push(card);
        }

        updateHandCounts(playerState);
        if (drawnCards.length > 0 && global.BattleLog) {
            const U = global.GameUtil;
            const deckName = (U && U.deckLabel) ? U.deckLabel(deckType)
                : (deckType === 'mainDeck' ? '主牌库' : deckType === 'costDeck' ? '费用牌库' : '传说牌库');
            const who = player === 'self' ? 'self' : 'opponent';
            global.BattleLog.log(`从${deckName}抽了 ${drawnCards.length} 张牌`, who);
        }
        GameState.notifyListeners();
        return drawnCards;
    }

    function drawInitialHand(player) {
        const drawnMain = drawFromDeck(player, 'mainDeck', GameState.INITIAL_HAND_SIZE);
        const drawnCost = drawFromDeck(player, 'costDeck', GameState.INITIAL_COST_HAND_SIZE);
        // 传说牌库不参与初始抽牌，可根据需要添加
        return [...drawnMain, ...drawnCost];
    }

    /**
     * 内部移动实现
     * @param {Object} [opts] { toPlayer } —— 指定"放进哪个玩家的区域"
     *        不传时保持原行为（放进卡牌当前所在方的区域）✓ 零破坏；
     *        「进墓 / 放逐 / 回库」这类按【所有者】归属的操作，由调用方传 card.owner ✓
     */
    /* ===== 移动底层：已外迁到 js/core/cardMover.js（阶段3 拆分） =====
       这里保留同名转发 → 调用点一行都不用改 ✓（时点广播 / 入场标记由上层 afterZoneEnter 负责 ✓） */
    function _moveCard(instanceId, toZone, toIndex, opts) {
        return global.CardMover ? global.CardMover._moveCard(instanceId, toZone, toIndex, opts) : false;
    }

    // ===== 移动日志包装器：统一记录卡牌在区域间的移动（供对局日志展示） =====
    const ZONE_ACTION_NAMES = {
        hand: '回手',
        frontField: '登场',
        backField: '发动',
        costZone: '支付',
        graveyard: '送入墓场',
        exile: '放逐',
        mainDeck: '放回主牌库',
        costDeck: '放回费用牌库',
        legendDeck: '放回传说牌库',
        personalZone: '置于个人区',
        publicField: '公开'
    };

    /* ===== 卡牌查找：已外迁到 js/core/cardQuery.js（阶段3 拆分） =====
       这里保留同名函数做「转发」→ 所有调用点一行都不用改 ✓ */
    function findCardInstance(instanceId) {
        if (global.CardQuery) return global.CardQuery.findCardInstance(instanceId);
        console.warn('[CardActions] cardQuery.js 未加载，卡牌查找不可用');
        return null;
    }

    function getCardInstance(instanceId) {
        return global.CardQuery ? global.CardQuery.getCardInstance(instanceId) : null;
    }

    /* ===== 入场 / 时点副作用：已外迁到 js/core/cardEntry.js（阶段3 拆分） =====
       这里保留同名函数做「转发」→ 调用点一行都不用改 ✓ */
    function isBattlefieldZone(zone) {
        return global.CardEntry ? global.CardEntry.isBattlefieldZone(zone)
            : (zone === GameState.ZONE.FRONT_FIELD || zone === GameState.ZONE.BACK_FIELD);
    }

    function emitTimePoint(instanceId, toZone, fromZone) {
        if (global.CardEntry) global.CardEntry.emitTimePoint(instanceId, toZone, fromZone);
    }

    function emitFlipTimePoint(card) {
        if (global.CardEntry) global.CardEntry.emitFlipTimePoint(card);
    }

    /** 卡牌当前所在区域（用于判断是否"跨区进入"） */
    /* 已外迁到 js/core/cardQuery.js（阶段3）✓ 同名转发 ✓ */
    function zoneOf(instanceId) {
        return global.CardQuery ? global.CardQuery.zoneOf(instanceId) : null;
    }

    /* ===== 入场标记 / 进区副作用：已外迁到 js/core/cardEntry.js（阶段3 拆分）===== */
    function applyAutoToggle(instanceId, toZone, fromZone) {
        if (global.CardEntry) global.CardEntry.applyAutoToggle(instanceId, toZone, fromZone);
    }

    function syncEnteredMark(found) {
        if (global.CardEntry) global.CardEntry.syncEnteredMark(found);
    }

    function markBattlefieldEntry(instanceId, toZone, fromZone) {
        if (global.CardEntry) global.CardEntry.markBattlefieldEntry(instanceId, toZone, fromZone);
    }

    function clearEnteredThisTurnMarks() {
        return global.CardEntry ? global.CardEntry.clearEnteredThisTurnMarks() : 0;
    }

    /** 进入新区域后的统一处理：① 广播时点 ② 费牌进费用区自动切换 ③ 入场标记 */
    function afterZoneEnter(instanceId, toZone, fromZone, opts) {
        if (global.CardEntry) global.CardEntry.afterZoneEnter(instanceId, toZone, fromZone, opts);
    }

    /* 已外迁到 js/core/cardQuery.js（阶段3）✓ 同名转发 ✓ */
    function findCardBrief(instanceId) {
        return global.CardQuery ? global.CardQuery.findCardBrief(instanceId) : null;
    }

    function moveCard(instanceId, toZone, toIndex, opts) {
        const before = findCardBrief(instanceId);
        const fromZone = zoneOf(instanceId);             // 移动前所在区域（用于判断是否"跨区进入"）
        const result = _moveCard(instanceId, toZone, toIndex, opts);
        if (result && before && global.BattleLog) {
            const action = ZONE_ACTION_NAMES[toZone] || '移动';
            // 归属按【控制者】算（转移控制权后，操作者是 controller 而不是 owner ✓）
            const who = (before.controller || before.owner) === 'self' ? 'self' : 'opponent';
            global.BattleLog.log(`将「${before.name}」${action}`, who);
        }
        if (result) afterZoneEnter(instanceId, toZone, fromZone, opts);   // 广播时点 + 自动「切换」（opts.noActivate = 不算后场发动 ✓）
        return result;
    }

    function drawTopCardFromDeck(player, deckType) {
        const state = GameState.getState();
        if (!state) return null;
        const playerState = state.players[player];
        if (!playerState) return null;
        const deck = playerState[deckType];
        if (deck.length === 0) return null;
        const card = deck.shift();
        card.zone = null;
        card.zoneIndex = -1;
        GameState.notifyListeners();
        return card;
    }

    function moveCardFromDeckToZone(player, deckType, toZone, toIndex) {
        const state = GameState.getState();
        if (!state) return false;
        const playerState = state.players[player];
        if (!playerState) return false;

        const deck = playerState[deckType];
        if (deck.length === 0) return false;
        const card = deck.shift();

        if (toZone === GameState.ZONE.PERSONAL_ZONE) {
            card.faceDown = false;
            playerState.personalZone.push(card);
            card.zone = GameState.ZONE.PERSONAL_ZONE;
            card.zoneIndex = playerState.personalZone.length - 1;
            GameState.notifyListeners();
            return true;
        }

        if (toZone === GameState.ZONE.PUBLIC_FIELD) {
            if (toIndex < 0 || toIndex >= state.publicField.length || state.publicField[toIndex] !== null) {
                deck.unshift(card);
                card.zone = deckType;
                GameState.notifyListeners();
                return false;
            }
            state.publicField[toIndex] = card;
            card.zone = GameState.ZONE.PUBLIC_FIELD;
            card.zoneIndex = toIndex;
            GameState.notifyListeners();
            return true;
        }

        if (ZoneManager.isSlotZone(toZone)) {
            if (!ZoneManager.isSlotAvailable(player, toZone, toIndex)) {
                deck.unshift(card);
                card.zone = deckType;
                GameState.notifyListeners();
                return false;
            }
        }

        const fromZone = card.zone;                  // 移动前所在区域（牌库）
        card.faceDown = false;
        placeCardInZone(playerState, card, toZone, toIndex);
        GameState.notifyListeners();
        afterZoneEnter(card.instanceId, toZone, fromZone);   // 广播时点 + 自动「切换」
        return true;
    }

    function moveSpecificCardFromDeckToZone(player, deckType, instanceId, toZone, toIndex) {
        const state = GameState.getState();
        if (!state) return false;
        const playerState = state.players[player];
        if (!playerState) return false;

        const deck = playerState[deckType];
        const index = deck.findIndex(c => c && c.instanceId === instanceId);
        if (index === -1) return false;

        const card = deck.splice(index, 1)[0];

        if (toZone === GameState.ZONE.PUBLIC_FIELD) {
            if (toIndex < 0 || toIndex >= state.publicField.length || state.publicField[toIndex] !== null) {
                deck.splice(index, 0, card);
                card.zone = deckType;
                GameState.notifyListeners();
                return false;
            }
            state.publicField[toIndex] = card;
            card.zone = GameState.ZONE.PUBLIC_FIELD;
            card.zoneIndex = toIndex;
            GameState.notifyListeners();
            return true;
        }

        if (toZone === GameState.ZONE.PERSONAL_ZONE) {
            card.faceDown = false;
            playerState.personalZone.push(card);
            card.zone = GameState.ZONE.PERSONAL_ZONE;
            card.zoneIndex = playerState.personalZone.length - 1;
            GameState.notifyListeners();
            return true;
        }

        if (ZoneManager.isSlotZone(toZone)) {
            if (!ZoneManager.isSlotAvailable(player, toZone, toIndex)) {
                deck.splice(index, 0, card);
                card.zone = deckType;
                GameState.notifyListeners();
                return false;
            }
        }

        const fromZone2 = card.zone;                 // 移动前所在区域（牌库）
        placeCardInZone(playerState, card, toZone, toIndex);
        GameState.notifyListeners();
        afterZoneEnter(card.instanceId, toZone, fromZone2);   // 广播时点 + 自动「切换」
        return true;
    }

    function returnCardToDeckTop(player, deckType, card) {
        const state = GameState.getState();
        if (!state || !card) return false;
        const playerState = state.players[player];
        if (!playerState) return false;

        const result = removeCardFromAnywhere(card.instanceId);
        if (!result) return false;

        const sourceZone = card.zone;
        if (sourceZone === GameState.ZONE.FRONT_FIELD || sourceZone === GameState.ZONE.BACK_FIELD) {
            resetAttackDefenseIfMinion(card);
            handleEquippedOnLeave(card);
        }

        // ★回库 = 控制权复位为所有者（★进库前触发 ✓）
        if (global.ControlManager && global.ControlManager.resetControlOnLeave) {
            global.ControlManager.resetControlOnLeave(card, deckType);
        }
        playerState[deckType].unshift(card);
        card.zone = deckType;
        card.zoneIndex = 0;
        for (let i = 1; i < playerState[deckType].length; i++) {
            playerState[deckType][i].zoneIndex = i;
        }
        GameState.notifyListeners();
        return true;
    }

    function returnCardToDeckBottom(player, deckType, card) {
        const state = GameState.getState();
        if (!state || !card) return false;
        const playerState = state.players[player];
        if (!playerState) return false;

        const result = removeCardFromAnywhere(card.instanceId);
        if (!result) return false;

        const sourceZone = card.zone;
        if (sourceZone === GameState.ZONE.FRONT_FIELD || sourceZone === GameState.ZONE.BACK_FIELD) {
            resetAttackDefenseIfMinion(card);
            handleEquippedOnLeave(card);
        }

        // ★回库 = 控制权复位为所有者（★进库前触发 ✓）
        if (global.ControlManager && global.ControlManager.resetControlOnLeave) {
            global.ControlManager.resetControlOnLeave(card, deckType);
        }
        playerState[deckType].push(card);
        card.zone = deckType;
        card.zoneIndex = playerState[deckType].length - 1;
        GameState.notifyListeners();
        return true;
    }

    /** 牌库中文名（与抽牌日志同一套说法 ✓） */
    const DECK_NAMES = { mainDeck: '主牌库', costDeck: '费用牌库', legendDeck: '传说牌库' };
    function deckLabelFor(deckType) { return DECK_NAMES[deckType] || '牌库'; }

    /**
     * ★一张卡「该回哪个牌库」？（与开局分库 / 卡组编辑器的规则完全一致 ✓）
     *   费用卡（type === 'cost'）      → 费用牌库
     *   传说系列（series 含「传说」）   → 传说牌库
     *   其余                          → 主牌库
     * 供「翻阅 → 回顶 / 回底」按类型回库使用 ✓
     */
    function deckTypeForCard(card) {
        const data = (card && (card.cardData
            || (global.CardLibrary && global.CardLibrary.getCardById(card.cardId)))) || null;
        if (!data) return 'mainDeck';
        if (data.type === 'cost') return 'costDeck';
        const DM = global.DeckManager;
        const isLegend = (DM && typeof DM.hasSeries === 'function')
            ? DM.hasSeries(data, '传说')
            : String(data.series || '').split(/[,，]/).map(s => s.trim()).indexOf('传说') >= 0;
        return isLegend ? 'legendDeck' : 'mainDeck';
    }

    function changeHealth(player, delta) {
        const state = GameState.getState();
        if (!state) return;
        const playerState = state.players[player];
        if (!playerState) return;
        playerState.health = Math.max(0, playerState.health + delta);
        GameState.notifyListeners();
    }

    function shuffleDeck(player, deckType) {
        const state = GameState.getState();
        if (!state) return false;
        const playerState = state.players[player];
        if (!playerState) return false;
        const deck = playerState[deckType];
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        deck.forEach((card, index) => { card.zoneIndex = index; });
        GameState.notifyListeners();
        return true;
    }

    function toggleCardFaceDown(card) {
        if (!card) return false;
        card.faceDown = !card.faceDown;
        GameState.notifyListeners();
        emitFlipTimePoint(card);          // ★「翻盖」行动 → 触发翻盖时点（响应连锁会据此开窗 ✓）
        return true;
    }

    function equipCardToTarget(equipCard, targetCard) {
        const state = GameState.getState();
        if (!state || !equipCard || !targetCard) return false;

        if (targetCard.zone !== GameState.ZONE.FRONT_FIELD && targetCard.zone !== GameState.ZONE.BACK_FIELD) {
            return false;
        }

        if (!equipCard.cardData && equipCard.cardId) {
            equipCard.cardData = global.CardLibrary ? global.CardLibrary.getCardById(equipCard.cardId) : null;
        }

        const removeResult = removeCardFromAnywhere(equipCard.instanceId);
        if (!removeResult) return false;

        if (!targetCard.equippedCards) targetCard.equippedCards = [];
        targetCard.equippedCards.push(equipCard);
        equipCard.zone = 'equipped';
        equipCard.zoneIndex = -1;

        GameState.notifyListeners();
        return true;
    }

    /* ===== 离场清理 / 取出 / 落区 / 手牌计数：已外迁到 js/core/cardMover.js（阶段3）===== */
    function resetAttackDefenseIfMinion(card) {
        if (global.CardMover) global.CardMover.resetAttackDefenseIfMinion(card);
    }

    /* 离场装备处理：装备者离开战场 → 控制方弹窗选「掉落 / 进墓」（见 js/core/cardMover.js ✓） */
    function handleEquippedOnLeave(targetCard) {
        if (global.CardMover) global.CardMover.handleEquippedOnLeave(targetCard);
    }

    /* 兼容旧名（和 handleEquippedOnLeave 是同一件事 ✓） */
    function moveEquippedCardsToGraveyard(targetCard) {
        return handleEquippedOnLeave(targetCard);
    }

    function removeCardFromAnywhere(instanceId) {
        return global.CardMover ? global.CardMover.removeCardFromAnywhere(instanceId) : null;
    }

    function removeCardFromCurrentZone(instanceId) {
        return global.CardMover ? global.CardMover.removeCardFromCurrentZone(instanceId) : null;
    }

    function placeCardInZone(player, card, zone, index) {
        if (global.CardMover) global.CardMover.placeCardInZone(player, card, zone, index);
    }

    function updateHandCounts(player) {
        if (global.CardMover) global.CardMover.updateHandCounts(player);
    }

    /* ================= 费用区：批量整理（阶段3 已外迁到 js/core/costZoneOps.js ✓）
       这里保留同名转发 → 调用点一行都不用改 ✓ ================= */
    function firstEmptyCostSlot(player) {
        return global.CostZoneOps ? global.CostZoneOps.firstEmptyCostSlot(player) : -1;
    }

    function compactCostZone(player) {
        return global.CostZoneOps ? global.CostZoneOps.compactCostZone(player) : 0;
    }

    function swapCostZoneSlots(player, idA, idB) {
        return global.CostZoneOps ? global.CostZoneOps.swapCostZoneSlots(player, idA, idB) : false;
    }

    global.CardActions = {
        drawFromDeck,
        drawInitialHand,
        moveCard,
        drawTopCardFromDeck,
        moveCardFromDeckToZone,
        moveSpecificCardFromDeckToZone,
        returnCardToDeckTop,
        returnCardToDeckBottom,
        // 按卡牌类型选牌库（翻阅「回顶 / 回底」用 ✓）
        deckTypeForCard,
        deckLabelFor,
        changeHealth,
        shuffleDeck,
        toggleCardFaceDown,
        emitFlipTimePoint,
        equipCardToTarget,
        // 费用区：批量整理（自动对齐 / 调换 / 找空格）
        firstEmptyCostSlot,
        compactCostZone,
        swapCostZoneSlots,
        // 入场标记：随从进入前场打「本回合进入战场」标记 / 回合交替时统一清空
        markBattlefieldEntry,
        clearEnteredThisTurnMarks,
        // 公共查询：按 instanceId 找卡牌实例（返回 { card, player, data }）
        // —— 响应连锁 / 标记系统等都需要，统一从这里取，避免各模块各写一套查找
        findCardInstance,
        // 便捷版：只要卡牌本体（老代码大多数只需要卡本身）
        getCardInstance,
        // 手牌计数（转移/复制进手牌后需要重算）
        updateHandCounts,
        // 从任意区域取出卡牌实例（转移控制权交给对方时用）✓
        removeCardFromAnywhere
    };
})(window);