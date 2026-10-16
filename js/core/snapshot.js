// js/core/snapshot.js
// 公开状态快照的【序列化 / 反序列化】（阶段5 拆分：从 gameState.js 外迁）
//
//   Snapshot.toPublicState(player)          卡片 → 数据（把这一侧的状态发给对方 ✓ 含视角翻转 ✓）
//   Snapshot.applyPublicState(player, data) 数据 → 卡片（收到对方的状态时还原 ✓）
//
// 为什么单独一个模块：这里是「联机同步字段的唯一定义处」✓
//   以后新增 / 修改一个要同步的字段，只改这里一处 ✓ 不会两头漏（本项目的 counters 就漏过一次 ✗）
//
// 依赖 GameState（状态容器 / 实例构造 / 区域常量 ✓）—— 全部在【调用时】取，所以加载顺序无关 ✓
// 兼容：global.GameState.getPublicState / setPublicState 仍可用（内部转发 ✓）

(function(global) {
    function GS() { return global.GameState; }

    /**
     * 把某一侧的状态序列化成"可发出去的公开快照"✓
     * 说明：费用区【不做镜像】—— 对手的费用牌摆放与他看到的保持一致；
     *       前后场仍按原来的反向排列（视角翻转 ✓）
     */
    function toPublicState(player) {
        const G = GS();
        if (!G) return null;
        const state = G.getPlayerState(player);
        if (!state) return null;

        const mirrorArray = (arr) => arr.slice().reverse();

        const cardToData = (card) => {
            if (!card) return null;
            return {
                // ★带上实例 id：两端对"同一张牌"必须用同一个标识，
                //   否则响应连锁的箭头锚点、目标名称等在本端都找不到那张牌（只能兜底到半场）
                instanceId: card.instanceId,
                cardId: card.cardId,
                faceDown: !!card.faceDown,
                active: card.active !== false,
                // ★入场标记也要同步：否则对方看不到「本回合进入战场」这个标记
                enteredThisTurn: !!card.enteredThisTurn,
                // ★控制者 / 所有者 / 来源标记也要同步：否则接收端只能靠"卡在谁半场"推断，
                //   转移控制权后两端看法会不一致 ✗
                owner: card.owner || 'self',
                controller: card.controller || card.owner || 'self',
                origin: card.origin || null,
                currentAttack: card.currentAttack ?? null,
                currentDefense: card.currentDefense ?? null,
                traits: card.traits ? [...card.traits] : [],
                customTexts: card.customTexts ? [...card.customTexts] : [],
                equippedCards: card.equippedCards ? card.equippedCards.map(ec => ({
                    instanceId: ec.instanceId,
                    cardId: ec.cardId,
                    effectText: ec.cardData?.effectText || ec.cardData?.description || ''
                })) : []
            };
        };

        const gs = G.getState();
        return {
            health: state.health,
            frontField: mirrorArray(state.frontField).map(c => cardToData(c)),
            backField: mirrorArray(state.backField).map(c => cardToData(c)),
            costZone: state.costZone.map(c => cardToData(c)),
            mainDeckCount: state.mainDeck.length,
            costDeckCount: state.costDeck.length,
            legendDeckCount: state.legendDeck.length,
            graveyard: state.graveyard.map(c => c.cardId),
            exile: state.exile.map(c => c.cardId),
            handMainCount: state.handMainCount,
            handCostCount: state.handCostCount,
            publicField: (gs && gs.publicField) ? gs.publicField.map(c => cardToData(c)) : new Array(5).fill(null),
            personalZone: state.personalZone.map(c => cardToData(c))
        };
    }
    /** 把收到的公开快照还原进某一侧的状态 ✓（视角翻转见 owner / controller 的处理 ✓） */
    function applyPublicState(player, data) {
        const G = GS();
        if (!G || !data) return;
        const gs = G.getState();
        if (!gs) return;
        const ZONE = G.ZONE;
        const target = gs.players[player];
        if (!target) return;

        target.health = data.health;

        const dataToCard = (item, zoneName) => {
            if (!item) return null;
            const inst = G.createCardInstance(item.cardId, player);
            // ★沿用对方发来的实例 id：让两端"同一张牌"的 instanceId 完全一致
            //   （否则箭头/目标/标记都会在本端找不到对应卡牌）
            if (item.instanceId) inst.instanceId = item.instanceId;
            inst.faceDown = !!item.faceDown;
            inst.active = item.active !== false;
            inst.enteredThisTurn = !!item.enteredThisTurn;   // 入场标记随公共状态同步
            // ★所有者 / 控制者：对方发来的字段是"以对方为 self"的视角 → 落到对手身上要左右翻转 ✓
            //   （player === 'opponent'：这份数据是对方在描述他自己那一侧；
            //     player === 'self'    ：是对方在描述我这一侧 → 视角相同，不翻转 ✓）
            const flipSide = s => {
                if (player !== 'opponent') return s;
                return s === 'self' ? 'opponent' : (s === 'opponent' ? 'self' : s);
            };
            const hasOwner = (item.owner === 'self' || item.owner === 'opponent');
            const hasController = (item.controller === 'self' || item.controller === 'opponent');
            inst.owner = hasOwner ? flipSide(item.owner) : player;
            inst.controller = hasController ? flipSide(item.controller) : inst.owner;
            inst.origin = (item.origin === 'transfer' || item.origin === 'copy') ? item.origin : null;
            // ★必须写入所在区域：卡面标记（「本回合进入战场」等）依赖 card.zone 判断 ✗
            if (zoneName) inst.zone = zoneName;
            inst.currentAttack = item.currentAttack ?? null;
            inst.currentDefense = item.currentDefense ?? null;
            inst.traits = item.traits ? [...item.traits] : [];
            inst.customTexts = item.customTexts ? [...item.customTexts] : [];
            inst.equippedCards = item.equippedCards ? item.equippedCards.map(ec => {
                const equipCard = G.createCardInstance(ec.cardId, player);
                if (ec.instanceId) equipCard.instanceId = ec.instanceId;
                if (ec.effectText) {
                    equipCard.cardData = { effectText: ec.effectText, description: ec.effectText };
                }
                return equipCard;
            }) : [];
            return inst;
        };

        /** 按区域批量还原（同时写入 zone / zoneIndex，保证卡面标记与区域逻辑一致 ✓） */
        const mapZoneCards = (arr, zoneName) => (arr || []).map((item, index) => {
            const inst = dataToCard(item, zoneName);
            if (inst) inst.zoneIndex = index;
            return inst;
        });

        /** 墓场 / 放逐只传 cardId（字符串），按 id 还原并写回区域 ✓ */
        const mapIdCards = (arr, zoneName) => (arr || []).map((cardId, index) => {
            const inst = G.createCardInstance(cardId, player);
            inst.zone = zoneName;
            inst.zoneIndex = index;
            return inst;
        });

        target.frontField = mapZoneCards(data.frontField, ZONE.FRONT_FIELD);
        target.backField = mapZoneCards(data.backField, ZONE.BACK_FIELD);
        target.costZone = mapZoneCards(data.costZone, ZONE.COST_ZONE);
        target.graveyard = mapIdCards(data.graveyard, ZONE.GRAVEYARD);
        target.exile = mapIdCards(data.exile, ZONE.EXILE);

        const makePlaceholder = (zone) => (G.createPlaceholderInstance
            ? G.createPlaceholderInstance(player, zone)
            : { instanceId: 'ph_' + Math.random().toString(36).slice(2), cardId: 'placeholder', cardData: null, owner: player, zone: zone, zoneIndex: -1, active: true, traits: [], customTexts: [], equippedCards: [] });

        target.mainDeck = Array.from({ length: data.mainDeckCount || 0 }, () => makePlaceholder(ZONE.MAIN_DECK));
        target.costDeck = Array.from({ length: data.costDeckCount || 0 }, () => makePlaceholder(ZONE.COST_DECK));
        target.legendDeck = Array.from({ length: data.legendDeckCount || 0 }, () => makePlaceholder(ZONE.LEGEND_DECK));
        target.handMainCount = data.handMainCount || 0;
        target.handCostCount = data.handCostCount || 0;

        if (data.publicField) {
            gs.publicField = mapZoneCards(data.publicField, ZONE.PUBLIC_FIELD);
        }

        if (data.personalZone) {
            target.personalZone = mapZoneCards(data.personalZone, ZONE.PERSONAL_ZONE);
        }
    }

    global.Snapshot = { toPublicState, applyPublicState };
})(window);
