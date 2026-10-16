// js/core/util.js
// 通用小工具（重构新增）：把散在各模块里的重复实现收成一份 ✓
//
// 为什么要有它（阶段1 的成果）：
//   · flipSide / sideLabel —— 原先 chainTarget / chainManager / revealChannel 各写一份 ✗
//   · isConnected          —— 原先 chainManager / revealChannel 各写一份 ✗
//   · deckLabel（牌库中文名）—— 原先 cardActions / chainManager / revealChannel / deckTakeUI 各一份 ✗
//   命名统一为 global.GameUtil ✓（不碰任何业务状态 ✗ 只提供纯函数 ✓）
//
// 使用方式：其它模块保留自己的同名包装函数，内部转调这里 ✓
//   （这样调用点一行都不用改 ✓ —— 低成本拆分的通用做法）

(function(global) {
    /** 阵营取反：self ↔ opponent（未知值按 opponent 处理，与原实现一致 ✓） */
    function flipSide(side) {
        return side === 'self' ? 'opponent' : 'self';
    }

    /** 阵营中文名 */
    function sideLabel(side) {
        return side === 'self' ? '我方' : '对方';
    }

    /** 是否已联机（Network 未加载 / 未连接 → false ✓） */
    function isConnected() {
        const n = global.Network;
        return !!(n && typeof n.getState === 'function' && n.getState().isConnected);
    }

    /** 牌库 / 堆叠的中文名（与抽牌日志、查阅界面的说法保持一致 ✓） */
    const DECK_LABELS = {
        mainDeck: '主牌库',
        costDeck: '费用牌库',
        legendDeck: '传说牌库',
        graveyard: '墓场',
        exile: '放逐区'
    };

    /** 区域 → 中文名（未知区域兜底「牌库」✓） */
    function deckLabel(zone) {
        return DECK_LABELS[zone] || '牌库';
    }

    global.GameUtil = {
        flipSide,
        sideLabel,
        isConnected,
        DECK_LABELS,
        deckLabel
    };
})(window);
