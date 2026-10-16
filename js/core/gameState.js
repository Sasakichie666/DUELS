// js/core/gameState.js
// 纯状态容器：负责保存游戏状态、提供访问接口和监听器，不包含业务操作
// 修改：新增传说牌库 legendDeck 支持；移除标记/顺序；保留装备卡逻辑

(function(global) {
    const ZONE = {
        HAND: 'hand',
        MAIN_DECK: 'mainDeck',
        COST_DECK: 'costDeck',
        FRONT_FIELD: 'frontField',
        BACK_FIELD: 'backField',
        COST_ZONE: 'costZone',
        GRAVEYARD: 'graveyard',
        EXILE: 'exile',
        PUBLIC_FIELD: 'publicField',
        PERSONAL_ZONE: 'personalZone',
        LEGEND_DECK: 'legendDeck'   // 新增传说牌库区域
    };

    const INITIAL_HAND_SIZE = 4;
    const INITIAL_COST_HAND_SIZE = 3;

    let instanceIdCounter = 0;
    let gameState = null;
    let listeners = [];

    /**
     * 本端唯一 token（★关键修复）
     * 为什么必须有：instanceId 以前是 `inst_${Date.now()}_${n}`，两端的计数都从 1 开始、
     *   时间戳粒度又只有毫秒 → 两台机器【几乎必然生成同样的 id】✗。
     *   而本端查找卡牌是 self 优先（findCardInstance 先搜 self 再搜 opponent）✗，
     *   于是"查对方那张牌"会先命中自己同 id 的卡，表现为两个 bug：
     *     ① 对方看不到我场上的「新」标记（他渲染时读到的是他自己的卡）
     *     ② 点对方场上的卡弹出的是"自己卡"的菜单（拿到的实例其实是自己的）
     * 现在 id 里带上本端随机 token → 任何两端的 id 都不会相撞 ✓
     *   （对方发来的 id 仍原样沿用，所以两端对"同一张牌"的看法依旧一致 ✓）
     */
    const CLIENT_TOKEN = Math.random().toString(36).slice(2, 10);

    function generateInstanceId() {
        instanceIdCounter++;
        return `inst_${CLIENT_TOKEN}_${Date.now()}_${instanceIdCounter}`;
    }

    function createCardInstance(cardId, owner) {
        const card = global.CardLibrary ? global.CardLibrary.getCardById(cardId) : null;
        return {
            instanceId: generateInstanceId(),
            cardId: cardId || 'unknown',
            cardData: card || null,
            owner: owner,
            zone: null,
            zoneIndex: -1,
            faceUp: true,
            faceDown: false,
            active: true,
            // 「本回合进入战场」标记（1.2）：随从跨区进入前场时置 true，回合交替时清空
            enteredThisTurn: false,
            // ===== 控制权模型（转移控制权功能）=====
            //   owner      —— 所有者（归谁）：进墓/放逐/回库 回到所有者的区域 ✓
            //   controller —— 控制者（现在谁能操作它）：默认等于 owner；「转移」只改它 ✓
            //   origin     —— 来源标记：null | 'transfer'（被转移来的） | 'copy'（复制出来的）
            //                 → 卡面特效框用（见 css/card-origin.css）✓
            controller: owner,
            origin: null,
            currentAttack: (card && card.type === 'minion') ? card.attack : null,
            currentDefense: (card && card.type === 'minion') ? card.defense : null,
            traits: [],
            customTexts: [],
            equippedCards: [],
        };
    }

    function createPlaceholderInstance(owner, zone) {
        return {
            instanceId: generateInstanceId(),
            cardId: 'placeholder',
            cardData: null,
            owner: owner,
            zone: zone,
            zoneIndex: -1,
            faceUp: false,
            faceDown: false,
            active: true,
            currentAttack: null,
            currentDefense: null,
            traits: [],
            customTexts: [],
            equippedCards: [],
        };
    }

    function createPlayerState(owner, mainDeckIds, costDeckIds, legendDeckIds = []) {
        const mainDeck = mainDeckIds.map(id => createCardInstance(id, owner));
        const costDeck = costDeckIds.map(id => createCardInstance(id, owner));
        const legendDeck = legendDeckIds.map(id => createCardInstance(id, owner));

        mainDeck.forEach(card => { card.zone = ZONE.MAIN_DECK; });
        costDeck.forEach(card => { card.zone = ZONE.COST_DECK; });
        legendDeck.forEach(card => { card.zone = ZONE.LEGEND_DECK; });

        return {
            owner: owner,
            health: 30,
            hand: [],
            frontField: new Array(5).fill(null),
            backField: new Array(5).fill(null),
            costZone: new Array(10).fill(null),
            mainDeck: mainDeck,
            costDeck: costDeck,
            legendDeck: legendDeck,     // 新增传说牌库
            graveyard: [],
            exile: [],
            personalZone: [],
            handMainCount: 0,
            handCostCount: 0,
        };
    }

    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function initGame(mainDeckIds, costDeckIds, legendDeckIds = []) {
        const shuffledMain = shuffleArray([...mainDeckIds]);
        const shuffledCost = shuffleArray([...costDeckIds]);
        const shuffledLegend = shuffleArray([...legendDeckIds]);

        gameState = {
            players: {
                self: createPlayerState('self', shuffledMain, shuffledCost, shuffledLegend),
                opponent: createPlayerState('opponent', [], [], []),
            },
            currentTurn: 'self',
            turnNumber: 1,
            phase: 'main',
            publicField: new Array(5).fill(null),
        };

        notifyListeners();
        return gameState;
    }

    function getState() {
        return gameState;
    }

    function getPlayerState(player) {
        return gameState ? gameState.players[player] : null;
    }

    function getHand(player) {
        const state = getPlayerState(player);
        return state ? state.hand : [];
    }

    function getZoneCards(player, zone, index = null) {
        const state = getPlayerState(player);
        if (!state) return null;
        if (index === null) return state[zone];
        return state[zone][index];
    }

    /* ===== 快照序列化 / 反序列化：已外迁到 js/core/snapshot.js（阶段5 拆分）=====
       这里保留同名转发 → 调用点（syncManager 等）一行都不用改 ✓ */
    function getPublicState(player) {
        return global.Snapshot ? global.Snapshot.toPublicState(player) : null;
    }

    function setPublicState(player, data) {
        if (global.Snapshot) global.Snapshot.applyPublicState(player, data);
    }

    /* 原 setPublicState 实现已外迁到 js/core/snapshot.js（阶段5）✓ 转发见上方 ✓ */

    function setOpponentPublicState(data) {
        setPublicState('opponent', data);
    }

    function addListener(fn) {
        listeners.push(fn);
    }

    function notifyListeners() {
        listeners.forEach(fn => fn(gameState));
    }

    global.GameState = {
        ZONE,
        INITIAL_HAND_SIZE,
        INITIAL_COST_HAND_SIZE,
        initGame,
        getState,
        getPlayerState,
        getHand,
        getZoneCards,
        getPublicState,
        setPublicState,
        // 实例构造：复制卡牌 / 转移控制权等需要现场造一张新实例 ✓
        createCardInstance,
        // 占位实例（牌库计数用）—— js/core/snapshot.js 还原对方牌库时要用 ✓
        createPlaceholderInstance,
        setOpponentPublicState,
        addListener,
        notifyListeners,
    };
})(window);