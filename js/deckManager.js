// js/deckManager.js
// 卡组管理器（★游戏内必需组件）：卡组规则校验 + 「当前正在编辑的卡组」工作区
//   · 多份卡组的持久化 / 出战卡组 → 交给 js/core/deckStore.js ✓
//   · 卡组码导入导出 → 交给 js/core/deckCode.js ✓
//   · 对外老 API（getMainDeck / getCostDeck / getLegendDeck / getDeckStatus / DECK_CONFIG…）保持不变，
//     开局路径 main.js 零改动 ✓

(function(global) {
    const DECK_CONFIG = {
        MAIN_DECK_SIZE: 40,          // 主卡组张数（改这里即可，UI 会自动同步）
        MAIN_DECK_MAX_COPIES: 3,
        COST_DECK_SIZE: 20,
        COST_DECK_MAX_COPIES: Infinity,
        LEGEND_DECK_SIZE: 10,
        LEGEND_DECK_MAX_COPIES: 3,       // 传说卡每种最多3张
        LEGEND_SERIES: '传说',
    };

    const READY_HINT = '请使用合法的卡组，才能进行准备并开始游戏';

    let workingDeckId = '';      // 正在编辑的卡组（DeckStore 里的 id ✓）
    let mainDeck = [];
    let costDeck = [];
    let legendDeck = [];

    function store() { return global.DeckStore || null; }

    function getCardById(id) {
        return global.CardLibrary ? global.CardLibrary.getCardById(id) : null;
    }

    function hasSeries(card, seriesName) {
        if (!card || !card.series) return false;
        const seriesList = String(card.series).split(/[,，]/).map(s => s.trim());
        return seriesList.includes(seriesName);
    }

    // 统计卡组中「能在当前卡包中找到」的卡牌数量，以及失效卡牌数量
    function countDeckEntries(ids) {
        let valid = 0;
        let missing = 0;
        (ids || []).forEach(id => {
            if (getCardById(id)) valid++;
            else missing++;
        });
        return { valid, missing };
    }

    /** 规则校验（可传任意卡组槽位；不传则校验当前工作区 ✓） */
    function statusOf(piles) {
        const p = piles || { mainDeck: mainDeck, costDeck: costDeck, legendDeck: legendDeck };
        const main = countDeckEntries(p.mainDeck);
        const cost = countDeckEntries(p.costDeck);
        const legend = countDeckEntries(p.legendDeck);
        const mainOk = main.valid === DECK_CONFIG.MAIN_DECK_SIZE;
        const costOk = cost.valid === DECK_CONFIG.COST_DECK_SIZE;
        const legendOk = legend.valid === DECK_CONFIG.LEGEND_DECK_SIZE;
        return {
            mainCount: main.valid,
            costCount: cost.valid,
            legendCount: legend.valid,
            // 失效卡牌（卡包中已不存在 / 尚未加载完成）
            missingMain: main.missing,
            missingCost: cost.missing,
            missingLegend: legend.missing,
            missingTotal: main.missing + cost.missing + legend.missing,
            mainOk,
            costOk,
            legendOk,
            isDeckReady: mainOk && costOk && legendOk,
        };
    }

    function getDeckStatus() { return statusOf(null); }

    /** 某份卡组（按 id）的规则状态 —— VS 准备界面的下拉要用 ✓ */
    function getDeckStatusById(deckId) {
        const S = store();
        if (!S || !deckId) return null;
        const deck = S.get(deckId);
        if (!deck) return null;
        return statusOf(deck);
    }

    /** 把一份卡组的槽位装载进工作区（不落盘 ✓） */
    function applyPiles(piles) {
        const p = piles || {};
        mainDeck = Array.isArray(p.mainDeck) ? p.mainDeck.slice() : [];
        costDeck = Array.isArray(p.costDeck) ? p.costDeck.slice() : [];
        legendDeck = Array.isArray(p.legendDeck) ? p.legendDeck.slice() : [];
        return { success: true };
    }

    function currentPiles() {
        return { mainDeck: mainDeck.slice(), costDeck: costDeck.slice(), legendDeck: legendDeck.slice() };
    }

    /** 兼容写盘：旧版单卡组 key（老版本/回滚时仍能读到 ✓），同时也写卡组库 ✓ */
    function writeLegacyKey() {
        try {
            localStorage.setItem('savedDeck', JSON.stringify({
                mainDeck: [...mainDeck],
                costDeck: [...costDeck],
                legendDeck: [...legendDeck],
                savedAt: new Date().toISOString()
            }));
        } catch (e) { /* 忽略：隐私模式等 */ }
    }

    /** 保证有一个正在编辑的卡组（没有就自动建「我的卡组」✓） */
    function ensureWorkingDeck() {
        const S = store();
        if (!S) return '';
        if (workingDeckId && S.get(workingDeckId)) return workingDeckId;
        const deck = S.ensureActive();
        workingDeckId = deck ? deck.id : '';
        return workingDeckId;
    }

    /** 自动保存：把工作区写回当前卡组（每次增删卡都会调用 ✓） */
    function autoSaveDeck() {
        writeLegacyKey();
        const S = store();
        if (!S) return;
        const id = ensureWorkingDeck();
        if (!id) return;
        const res = S.writeCards(id, currentPiles());
        if (res && res.error) console.warn('[DeckManager] 自动保存失败：', res.error);
    }

    function addCardToMainDeck(cardId) {
        const card = getCardById(cardId);
        if (!card) return { error: '卡牌不存在' };
        if (card.type === 'cost') {
            return { error: '费用卡请添加到费用卡组' };
        }
        if (hasSeries(card, DECK_CONFIG.LEGEND_SERIES)) {
            return { error: '传说卡请添加到传说卡组' };
        }
        if (mainDeck.length >= DECK_CONFIG.MAIN_DECK_SIZE) {
            const missing = countDeckEntries(mainDeck).missing;
            const extra = missing > 0 ? `，其中 ${missing} 张为无效卡牌（不在当前卡包中），建议清空卡组后重新配置` : '';
            return { error: `主卡组已满（${DECK_CONFIG.MAIN_DECK_SIZE}张）${extra}` };
        }
        const copies = mainDeck.filter(id => id === cardId).length;
        if (copies >= DECK_CONFIG.MAIN_DECK_MAX_COPIES) {
            return { error: `每种卡最多${DECK_CONFIG.MAIN_DECK_MAX_COPIES}张` };
        }
        mainDeck.push(cardId);
        autoSaveDeck();
        return { success: true, cardName: card.name };
    }

    function removeCardFromMainDeck(index) {
        if (index >= 0 && index < mainDeck.length) {
            const card = getCardById(mainDeck[index]);
            mainDeck.splice(index, 1);
            autoSaveDeck();
            return { success: true, cardName: card ? card.name : '' };
        }
        return { error: '无效索引' };
    }

    function addCardToCostDeck(cardId) {
        const card = getCardById(cardId);
        if (!card || card.type !== 'cost') {
            return { error: '无效的费用卡' };
        }
        if (costDeck.length >= DECK_CONFIG.COST_DECK_SIZE) {
            return { error: `费用卡组已满（${DECK_CONFIG.COST_DECK_SIZE}张）` };
        }
        costDeck.push(cardId);
        autoSaveDeck();
        return { success: true, cardName: card.name };
    }

    function removeCardFromCostDeck(index) {
        if (index >= 0 && index < costDeck.length) {
            const card = getCardById(costDeck[index]);
            costDeck.splice(index, 1);
            autoSaveDeck();
            return { success: true, cardName: card ? card.name : '' };
        }
        return { error: '无效索引' };
    }

    function addCardToLegendDeck(cardId) {
        const card = getCardById(cardId);
        if (!card) return { error: '卡牌不存在' };
        if (!hasSeries(card, DECK_CONFIG.LEGEND_SERIES)) {
            return { error: '只有传说系列卡牌才能加入传说卡组' };
        }
        if (legendDeck.length >= DECK_CONFIG.LEGEND_DECK_SIZE) {
            return { error: `传说卡组已满（${DECK_CONFIG.LEGEND_DECK_SIZE}张）` };
        }
        const copies = legendDeck.filter(id => id === cardId).length;
        if (copies >= DECK_CONFIG.LEGEND_DECK_MAX_COPIES) {
            return { error: `每种传说卡最多${DECK_CONFIG.LEGEND_DECK_MAX_COPIES}张` };
        }
        legendDeck.push(cardId);
        autoSaveDeck();
        return { success: true, cardName: card.name };
    }

    function removeCardFromLegendDeck(index) {
        if (index >= 0 && index < legendDeck.length) {
            const card = getCardById(legendDeck[index]);
            legendDeck.splice(index, 1);
            autoSaveDeck();
            return { success: true, cardName: card ? card.name : '' };
        }
        return { error: '无效索引' };
    }

    function getLegendDeck() {
        return [...legendDeck];
    }

    function getMainDeck() {
        return [...mainDeck];
    }

    function getCostDeck() {
        return [...costDeck];
    }

    /* ================= 多卡组 / 出战卡组（对接 DeckStore ✓） ================= */

    /** 卡组清单（带三区张数 + 是否出战 + 规则状态） */
    function listDecks() {
        const S = store();
        if (!S) return [];
        const activeId = S.getActiveId();
        return S.list().map(entry => {
            const status = getDeckStatusById(entry.id);
            return {
                id: entry.id,
                name: entry.name,
                mainCount: entry.mainCount,
                costCount: entry.costCount,
                legendCount: entry.legendCount,
                isActive: entry.id === activeId,
                isEditing: entry.id === workingDeckId,
                isDeckReady: !!(status && status.isDeckReady),
                status: status
            };
        });
    }

    function getWorkingDeckId() { return workingDeckId; }

    function getWorkingDeck() {
        const S = store();
        return (S && workingDeckId) ? S.get(workingDeckId) : null;
    }

    function getActiveDeckId() {
        const S = store();
        return S ? S.getActiveId() : '';
    }

    function getActiveDeck() {
        const S = store();
        return S ? S.getActive() : null;
    }

    /** 把某份卡组装进编辑器（切换"正在编辑的卡组" ✓） */
    function useDeck(deckId) {
        const S = store();
        if (!S) return { error: '卡组库不可用' };
        const deck = S.get(deckId);
        if (!deck) return { error: '卡组不存在' };
        workingDeckId = deck.id;
        applyPiles(deck);
        return { success: true, deck: deck, status: getDeckStatus() };
    }

    /** 新建一份空卡组，并切到它开始编辑 */
    function newDeck(name) {
        const S = store();
        if (!S) return { error: '卡组库不可用' };
        const res = S.create(name, null);
        if (res.error) return res;
        useDeck(res.deck.id);
        return { success: true, deck: res.deck };
    }

    function renameDeck(deckId, name) {
        const S = store();
        return S ? S.rename(deckId, name) : { error: '卡组库不可用' };
    }

    /** 复制卡组（★永远独立的一份：内容一样也不合并 ✓） */
    function duplicateDeck(deckId, name) {
        const S = store();
        return S ? S.duplicate(deckId, name) : { error: '卡组库不可用' };
    }

    function deleteDeck(deckId) {
        const S = store();
        if (!S) return { error: '卡组库不可用' };
        const res = S.remove(deckId);
        if (res.error) return res;
        if (workingDeckId === deckId) {
            const deck = S.ensureActive();
            workingDeckId = deck ? deck.id : '';
            if (deck) applyPiles(deck);
        }
        return res;
    }

    /** 设为【出战卡组】（联机开局用它的三个槽位 ✓） */
    function setActiveDeck(deckId) {
        const S = store();
        if (!S) return { error: '卡组库不可用' };
        const res = S.setActive(deckId);
        if (res.error) return res;
        return { success: true, status: getDeckStatusById(deckId) };
    }

    /** 准备前门禁：卡组不合法就给统一提示语 ✓ */
    function canReady(deckId) {
        const status = deckId ? getDeckStatusById(deckId) : getDeckStatus();
        if (status && status.isDeckReady) return { ok: true, status: status, message: '' };
        return { ok: false, status: status, message: READY_HINT };
    }

    /** 保存当前工作区到「正在编辑的卡组」（允许保存不完整卡组 ✓ 是否合法由准备门禁管 ✓） */
    function saveDeck() {
        autoSaveDeck();
        const status = getDeckStatus();
        return { success: true, status: status, isDeckReady: status.isDeckReady };
    }

    /** 重新载入「正在编辑的卡组」（丢弃未保存的改动 ✓） */
    function loadDeck() {
        const S = store();
        if (S) {
            const id = ensureWorkingDeck();
            const deck = id ? S.get(id) : null;
            if (!deck) return { error: '没有找到已保存的卡组' };
            applyPiles(deck);
            return { success: true, deck: deck };
        }
        // 兜底：没有卡组库时按旧版读 savedDeck（保证老环境不白屏 ✓）
        const saved = localStorage.getItem('savedDeck');
        if (!saved) return { error: '没有找到已保存的卡组' };
        try {
            const deckData = JSON.parse(saved);
            applyPiles(deckData);
            return { success: true };
        } catch (e) {
            return { error: '卡组数据损坏，无法加载' };
        }
    }

    function clearDeck() {
        applyPiles(null);
        autoSaveDeck();
        return { success: true };
    }

    /* ================= 卡组码（对接 DeckCode ✓） ================= */

    /** 导出卡组码（默认导出当前工作区；传 deckId 则导出那一份 ✓） */
    function exportCode(deckId) {
        const DC = global.DeckCode;
        if (!DC) return { ok: false, error: '卡组码模块未加载' };
        let piles = null;
        if (deckId && deckId !== workingDeckId) {
            const S = store();
            const deck = S ? S.get(deckId) : null;
            if (!deck) return { ok: false, error: '卡组不存在' };
            piles = deck;
        } else {
            piles = currentPiles();
        }
        return DC.encode(piles);
    }

    /** 人可读卡表（群里核对用 ✓） */
    function readableOf(deckId) {
        const DC = global.DeckCode;
        if (!DC) return '';
        let piles = currentPiles();
        if (deckId && deckId !== workingDeckId) {
            const S = store();
            const deck = S ? S.get(deckId) : null;
            if (deck) piles = deck;
        }
        return DC.readable(piles);
    }

    /** 导入卡组码 → ★永远新建一份【独立】卡组（内容相同也不合并、不覆盖 ✓），并切到它开始编辑 */
    function importCode(text, name) {
        const DC = global.DeckCode;
        const S = store();
        if (!DC) return { ok: false, error: '卡组码模块未加载' };
        if (!S) return { ok: false, error: '卡组库不可用' };
        const res = DC.decode(text);
        if (!res.ok) return { ok: false, error: res.error, report: res };
        const created = S.create(name, res.piles);
        if (created.error) return { ok: false, error: created.error, report: res };
        workingDeckId = created.deck.id;
        applyPiles(created.deck);
        return { ok: true, deck: created.deck, report: res, status: getDeckStatus() };
    }

    global.DeckManager = {
        DECK_CONFIG,
        READY_HINT,
        hasSeries,
        addCardToMainDeck,
        removeCardFromMainDeck,
        addCardToCostDeck,
        removeCardFromCostDeck,
        addCardToLegendDeck,
        removeCardFromLegendDeck,
        getMainDeck,
        getCostDeck,
        getLegendDeck,
        getDeckStatus,
        getDeckStatusById,
        saveDeck,
        loadDeck,
        clearDeck,
        // ★多卡组 / 出战卡组（对接 DeckStore）
        listDecks,
        getWorkingDeckId,
        getWorkingDeck,
        getActiveDeckId,
        getActiveDeck,
        useDeck,
        newDeck,
        renameDeck,
        duplicateDeck,
        deleteDeck,
        setActiveDeck,
        canReady,
        // ★卡组码（对接 DeckCode）
        exportCode,
        importCode,
        readableOf
    };
})(window);