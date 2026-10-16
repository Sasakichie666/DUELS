// js/core/costZoneOps.js
// 费用区批量整理（阶段3 拆分：从 cardActions.js 外迁）
//   · firstEmptyCostSlot(player)          → 第一个空格（满则 -1 ✓）
//   · compactCostZone(player)             → 按阅读顺序左移补齐（「自动对齐」✓）
//   · swapCostZoneSlots(player, idA, idB) → 调换费用区里两张牌的位置 ✓
//
// 供「费用区界面」与「自动对齐」按钮使用 ✓
// 约定：低层模块只负责【通知对方】（走 StateCommit.notify ✓），界面重绘由调用方负责 ✓
// 兼容：global.CardActions 仍导出这三个同名函数（内部转发 ✓）

(function(global) {
    const GameState = global.GameState;

    /** 低层通知（统一走状态提交入口 ✓） */
    function notifyState() {
        if (global.StateCommit) global.StateCommit.notify();
    }

    /** 费用区第一个空格（满则返回 -1） */
    function firstEmptyCostSlot(player) {
        const p = typeof player === 'string' ? GameState.getPlayerState(player) : player;
        if (!p || !Array.isArray(p.costZone)) return -1;
        for (let i = 0; i < p.costZone.length; i++) {
            if (!p.costZone[i]) return i;
        }
        return -1;
    }

    /**
     * 费用区自动对齐：按「阅读顺序」（第一行从左到右，再第二行）把牌左移补齐。
     * 例：第一行「空空红空黄」+ 第二行「空绿绿」 → 红黄绿绿（超出第一行自然排到第二行）
     */
    function compactCostZone(player) {
        const p = typeof player === 'string' ? GameState.getPlayerState(player) : player;
        if (!p || !Array.isArray(p.costZone)) return 0;
        const cards = p.costZone.filter(Boolean);          // filter 保留的就是阅读顺序
        if (cards.length === p.costZone.length) return 0;  // 本来就没有空格
        let moved = 0;
        for (let i = 0; i < p.costZone.length; i++) {
            const next = cards[i] || null;
            if (p.costZone[i] !== next) moved++;
            p.costZone[i] = next;
            if (next) next.zoneIndex = i;
        }
        if (moved) notifyState();
        return moved;
    }

    /** 费用区调换：交换两张牌在费用区里的位置（两张都必须在该玩家的费用区里） */
    function swapCostZoneSlots(player, idA, idB) {
        const p = typeof player === 'string' ? GameState.getPlayerState(player) : player;
        if (!p || !Array.isArray(p.costZone)) return false;
        const ia = p.costZone.findIndex(c => c && c.instanceId === idA);
        const ib = p.costZone.findIndex(c => c && c.instanceId === idB);
        if (ia < 0 || ib < 0 || ia === ib) return false;
        const tmp = p.costZone[ia];
        p.costZone[ia] = p.costZone[ib];
        p.costZone[ib] = tmp;
        if (p.costZone[ia]) p.costZone[ia].zoneIndex = ia;
        if (p.costZone[ib]) p.costZone[ib].zoneIndex = ib;
        notifyState();
        return true;
    }

    global.CostZoneOps = { firstEmptyCostSlot, compactCostZone, swapCostZoneSlots };
})(window);
