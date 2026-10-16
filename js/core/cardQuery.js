// js/core/cardQuery.js
// 卡牌查找（阶段3 拆分：从 cardActions.js 外迁出来的"查询组"）
//
// 为什么单独一个模块：
//   · 查找是全项目最公共的能力（ui / cardDetailUI / sidePanel / equipController /
//     dragController / chainManager … 都要用 ✓），却曾经各写一份 ✗
//   · 它【不修改任何状态】✓ → 与"移动/抽牌"这类写操作分层，改动互不影响 ✓
//
// 对外：global.CardQuery = { findCardInstance, getCardInstance, findCardBrief, zoneOf }
//   findCardInstance → { card, player, data }（覆盖公共区 + 双方所有区域 ✓）
//   getCardInstance  → 只要卡本体 ✓
//   findCardBrief    → { name, owner, controller }（日志用轻量版 ✓）
//   zoneOf           → 该卡当前所在区域 ✓
//
// 兼容：global.CardActions 仍导出同名函数（内部转发到这里 ✓），调用方无需改动 ✓

(function(global) {
    const GameState = global.GameState;

    /**
     * 找实例 + 所属方 + 卡面数据 —— 【全项目唯一的卡牌查找实现】
     * 覆盖：公共区 + 双方手牌 / 前后场 / 费用区 / 墓场 / 放逐 / 个人区 /
     *       主牌库 / 费用牌库 / 传说牌库。
     */
    function findCardInstance(instanceId) {
        if (!instanceId) return null;
        const state = GameState.getState();
        if (!state) return null;

        const withData = (card, player) => ({
            card,
            player,
            data: card.cardData
                || (global.CardLibrary && global.CardLibrary.getCardById(card.cardId))
                || null
        });

        // 公共区
        if (Array.isArray(state.publicField)) {
            const pub = state.publicField.find(c => c && c.instanceId === instanceId);
            if (pub) return withData(pub, pub.owner === 'opponent' ? 'opponent' : 'self');
        }

        for (const p of ['self', 'opponent']) {
            const ps = state.players[p];
            if (!ps) continue;
            const zones = [ps.hand, ps.frontField, ps.backField, ps.costZone,
                           ps.graveyard, ps.exile, ps.personalZone,
                           ps.mainDeck, ps.costDeck, ps.legendDeck];
            for (const z of zones) {
                if (!Array.isArray(z)) continue;
                const card = z.find(c => c && c.instanceId === instanceId);
                if (card) return withData(card, p);
            }
        }
        return null;
    }

    /** 便捷版：只要卡牌实例本体（多处调用只关心卡本身） */
    function getCardInstance(instanceId) {
        const found = findCardInstance(instanceId);
        return found ? found.card : null;
    }

    /** 轻量版：只要日志需要的 { name, owner, controller } ✓ */
    function findCardBrief(instanceId) {
        const state = GameState.getState();
        if (!state) return null;
        const zones = [];
        if (state.publicField) zones.push(state.publicField);
        ['self', 'opponent'].forEach(p => {
            const ps = state.players[p];
            if (!ps) return;
            zones.push(ps.hand, ps.frontField, ps.backField, ps.costZone,
                       ps.graveyard, ps.exile, ps.personalZone,
                       ps.mainDeck, ps.costDeck, ps.legendDeck);
        });
        for (const z of zones) {
            if (!Array.isArray(z)) continue;
            const found = z.find(c => c && c.instanceId === instanceId);
            if (found) {
                const data = found.cardData || (global.CardLibrary && global.CardLibrary.getCardById(found.cardId));
                // controller：日志/提示要按【谁在操作】归属，转移控制权后 owner ≠ 操作者 ✓
                return { name: (data && data.name) || '未知卡牌', owner: found.owner, controller: found.controller };
            }
        }
        return null;
    }

    /** 该卡当前所在区域（找不到 → null ✓） */
    function zoneOf(instanceId) {
        const found = findCardInstance(instanceId);
        return (found && found.card) ? found.card.zone : null;
    }

    global.CardQuery = { findCardInstance, getCardInstance, findCardBrief, zoneOf };
})(window);
