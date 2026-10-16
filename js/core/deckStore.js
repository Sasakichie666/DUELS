// js/core/deckStore.js
// 多卡组存储（★游戏内必需组件：卡组管理器用它管多份卡组 + 选出战卡组 ✓）
//
// 设计（对齐「准则规范手册 · A14 卡牌编号与卡组码协议」）：
//   · 单一 key：'cardgame.decks.v1' → { version, activeId, decks: [ 卡组... ] }
//   · 一份卡组 = { id, name, mainDeck[], costDeck[], legendDeck[], createdAt, updatedAt }
//     （三个数组里存的是【卡牌 id】，与 gameState.initGame 的入参一致 ✓）
//   · activeId = 当前【出战卡组】：开局时 main.js 只认它 ✓
//   · 旧数据迁移：老版本的 'savedDeck'（单份卡组）自动包成「我的卡组」并设为出战 ✓
//     旧 key 保留不删（可回滚 ✓）
//   · 纯逻辑模块（不碰 DOM ✓），localStorage 不可用时自动退化为内存存储（测试友好 ✓）

(function(global) {
    const STORAGE_KEY = 'cardgame.decks.v1';
    const LEGACY_KEY = 'savedDeck';
    const SCHEMA_VERSION = 1;
    const MAX_NAME_LEN = 20;
    const MAX_DECKS = 50;
    const DEFAULT_DECK_NAME = '我的卡组';
    const NEW_DECK_NAME = '新卡组';

    /* ---------- localStorage 兜底（file:// / 测试环境可能没有） ---------- */
    const memory = {};
    function lsGet(key) {
        try {
            if (global.localStorage) return global.localStorage.getItem(key);
        } catch (e) { /* 隐私模式等 → 退回内存 */ }
        return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    }
    function lsSet(key, value) {
        try {
            if (global.localStorage) { global.localStorage.setItem(key, value); return true; }
        } catch (e) { /* 写不进 → 退回内存 */ }
        memory[key] = value;
        return false;
    }

    /* ---------- 工具 ---------- */
    function uid() {
        return 'd_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1679616).toString(36);
    }
    function nowIso() { return new Date().toISOString(); }

    function normalizeName(name, fallback) {
        const s = String(name === undefined || name === null ? '' : name).replace(/[\r\n\t]/g, ' ').trim();
        const cut = s.slice(0, MAX_NAME_LEN);
        return cut || fallback || NEW_DECK_NAME;
    }

    /** 三个卡组槽位：只保留字符串 id（其它脏数据丢弃 ✓） */
    function normalizePiles(piles) {
        const p = piles || {};
        const pick = arr => (Array.isArray(arr) ? arr.filter(x => typeof x === 'string' && x) : []);
        return {
            mainDeck: pick(p.mainDeck),
            costDeck: pick(p.costDeck),
            legendDeck: pick(p.legendDeck)
        };
    }

    function makeDeck(name, piles) {
        const t = nowIso();
        const n = normalizePiles(piles);
        return {
            id: uid(),
            name: normalizeName(name, DEFAULT_DECK_NAME),
            mainDeck: n.mainDeck,
            costDeck: n.costDeck,
            legendDeck: n.legendDeck,
            createdAt: t,
            updatedAt: t
        };
    }

    function emptyStore() {
        return { version: SCHEMA_VERSION, activeId: '', decks: [] };
    }

    /** 修复一份卡组（字段缺失/类型不对 → 补默认值；id 丢失 → 重新发 ✓）
     *  返回 { deck, changed }：changed=true 说明修过 → 上层要把修复结果写回（否则每次读取都换新 id ✗） */
    function repairDeck(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const n = normalizePiles(raw);
        const pick = arr => (Array.isArray(arr) ? arr.filter(x => typeof x === 'string' && x) : []);
        const hasId = (typeof raw.id === 'string' && raw.id);
        const name = normalizeName(raw.name, NEW_DECK_NAME);
        const changed = !hasId
            || name !== raw.name
            || pick(raw.mainDeck).length !== n.mainDeck.length
            || pick(raw.costDeck).length !== n.costDeck.length
            || pick(raw.legendDeck).length !== n.legendDeck.length
            || typeof raw.createdAt !== 'string'
            || typeof raw.updatedAt !== 'string';
        return {
            deck: {
                id: hasId ? raw.id : uid(),
                name: name,
                mainDeck: n.mainDeck,
                costDeck: n.costDeck,
                legendDeck: n.legendDeck,
                createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso(),
                updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso()
            },
            changed: changed
        };
    }

    /** 读旧版本的 savedDeck（单份卡组）→ 迁移成一份卡组（没有则返回 null） */
    function migrateLegacy() {
        const raw = lsGet(LEGACY_KEY);
        if (!raw) return null;
        try {
            const d = JSON.parse(raw);
            if (!d || typeof d !== 'object') return null;
            return makeDeck(DEFAULT_DECK_NAME, d);
        } catch (e) {
            console.warn('[DeckStore] 旧卡组数据解析失败，已忽略：', e);
            return null;
        }
    }

    function saveStore(store) {
        try {
            lsSet(STORAGE_KEY, JSON.stringify(store));
        } catch (e) {
            console.warn('[DeckStore] 保存卡组库失败：', e);
        }
        return store;
    }

    /** 读存储（含迁移 + 修复）；损坏就重建，但尽量保住能救的卡组 ✓ */
    function load() {
        const raw = lsGet(STORAGE_KEY);
        let store = null;
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') store = parsed;
            } catch (e) {
                console.warn('[DeckStore] 卡组库数据损坏，将重建：', e);
            }
        }

        if (!store) {
            const fresh = emptyStore();
            const legacy = migrateLegacy();
            if (legacy) {
                fresh.decks.push(legacy);
                fresh.activeId = legacy.id;
                console.log('[DeckStore] 已把旧卡组（savedDeck）迁移为「' + legacy.name + '」');
                saveStore(fresh);
            }
            return fresh;
        }

        const out = emptyStore();
        const list = Array.isArray(store.decks) ? store.decks : [];
        let repaired = false;
        list.forEach(rawDeck => {
            const fixed = repairDeck(rawDeck);
            if (!fixed) return;
            if (fixed.changed) repaired = true;
            out.decks.push(fixed.deck);
        });
        if (out.decks.length > MAX_DECKS) { out.decks = out.decks.slice(0, MAX_DECKS); repaired = true; }
        out.activeId = (typeof store.activeId === 'string') ? store.activeId : '';
        if (!out.decks.some(d => d.id === out.activeId)) {
            out.activeId = out.decks.length ? out.decks[0].id : '';
            repaired = true;
        }
        if (!out.decks.length) {
            const legacy = migrateLegacy();     // 空库：看看有没有老数据可救 ✓
            if (legacy) { out.decks.push(legacy); out.activeId = legacy.id; repaired = true; }
        }
        if (repaired) saveStore(out);           // ★把修复结果写回：保证 id 稳定（不会每次读取都换号 ✗）
        return out;
    }

    /* ================= 对外 API ================= */

    /** 卡组清单（列表用：带三区张数 ✓） */
    function list() {
        return load().decks.map(d => ({
            id: d.id, name: d.name,
            mainCount: d.mainDeck.length, costCount: d.costDeck.length, legendCount: d.legendDeck.length,
            createdAt: d.createdAt, updatedAt: d.updatedAt
        }));
    }

    function get(id) {
        const deck = load().decks.filter(d => d.id === id)[0];
        return deck ? JSON.parse(JSON.stringify(deck)) : null;
    }

    function getActiveId() { return load().activeId || ''; }

    function getActive() {
        const store = load();
        const deck = store.decks.filter(d => d.id === store.activeId)[0];
        return deck ? JSON.parse(JSON.stringify(deck)) : null;
    }

    /** 设为【出战卡组】 */
    function setActive(id) {
        const store = load();
        if (!store.decks.some(d => d.id === id)) return { error: '卡组不存在' };
        store.activeId = id;
        saveStore(store);
        return { success: true };
    }

    /** 新建卡组（piles 可省 → 空卡组）；首份卡组自动成为出战卡组 ✓ */
    function create(name, piles) {
        const store = load();
        if (store.decks.length >= MAX_DECKS) return { error: '卡组数量已达上限（' + MAX_DECKS + ' 份）' };
        const deck = makeDeck(name, piles);
        store.decks.push(deck);
        if (!store.activeId) store.activeId = deck.id;
        saveStore(store);
        return { success: true, deck: JSON.parse(JSON.stringify(deck)) };
    }

    /** 保证至少有一份卡组（没有就建「我的卡组」），返回出战卡组 */
    function ensureActive() {
        const store = load();
        if (!store.decks.length) {
            const deck = makeDeck(DEFAULT_DECK_NAME, null);
            store.decks.push(deck);
            store.activeId = deck.id;
            saveStore(store);
            return JSON.parse(JSON.stringify(deck));
        }
        let deck = store.decks.filter(d => d.id === store.activeId)[0];
        if (!deck) {
            store.activeId = store.decks[0].id;
            saveStore(store);
            deck = store.decks[0];
        }
        return JSON.parse(JSON.stringify(deck));
    }

    function rename(id, name) {
        const store = load();
        const deck = store.decks.filter(d => d.id === id)[0];
        if (!deck) return { error: '卡组不存在' };
        deck.name = normalizeName(name, deck.name);
        deck.updatedAt = nowIso();
        saveStore(store);
        return { success: true, name: deck.name };
    }

    /** 复制一份卡组（★永远生成【独立】卡组：内容完全一致也不合并、不覆盖 ✓） */
    function duplicate(id, name) {
        const store = load();
        const src = store.decks.filter(d => d.id === id)[0];
        if (!src) return { error: '卡组不存在' };
        if (store.decks.length >= MAX_DECKS) return { error: '卡组数量已达上限（' + MAX_DECKS + ' 份）' };
        // 名字带后缀时先给原名留出空间，否则" 副本"会被截断 ✗
        const suffix = ' 副本';
        const base = src.name.length + suffix.length > MAX_NAME_LEN
            ? src.name.slice(0, MAX_NAME_LEN - suffix.length)
            : src.name;
        const copy = makeDeck(name || (base + suffix), src);
        store.decks.push(copy);
        saveStore(store);
        return { success: true, deck: JSON.parse(JSON.stringify(copy)) };
    }

    /** 删除卡组（不允许删掉最后一份 ✓） */
    function remove(id) {
        const store = load();
        const idx = store.decks.findIndex(d => d.id === id);
        if (idx < 0) return { error: '卡组不存在' };
        if (store.decks.length <= 1) return { error: '至少要保留一份卡组' };
        store.decks.splice(idx, 1);
        if (store.activeId === id) store.activeId = store.decks[0].id;
        saveStore(store);
        return { success: true, activeId: store.activeId };
    }

    /** 写入三个槽位（卡组管理器的自动保存走这里 ✓） */
    function writeCards(id, piles) {
        const store = load();
        const deck = store.decks.filter(d => d.id === id)[0];
        if (!deck) return { error: '卡组不存在' };
        const n = normalizePiles(piles);
        deck.mainDeck = n.mainDeck;
        deck.costDeck = n.costDeck;
        deck.legendDeck = n.legendDeck;
        deck.updatedAt = nowIso();
        saveStore(store);
        return { success: true };
    }

    global.DeckStore = {
        STORAGE_KEY: STORAGE_KEY,
        LEGACY_KEY: LEGACY_KEY,
        SCHEMA_VERSION: SCHEMA_VERSION,
        MAX_NAME_LEN: MAX_NAME_LEN,
        MAX_DECKS: MAX_DECKS,
        DEFAULT_DECK_NAME: DEFAULT_DECK_NAME,
        normalizeName: normalizeName,
        normalizePiles: normalizePiles,
        list: list,
        get: get,
        getActive: getActive,
        getActiveId: getActiveId,
        setActive: setActive,
        create: create,
        ensureActive: ensureActive,
        rename: rename,
        duplicate: duplicate,
        remove: remove,
        writeCards: writeCards,
        _load: load,        // 测试用：读整库
        _save: saveStore    // 测试用：直接写库
    };
})(typeof window !== 'undefined' ? window : this);
