// js/ui/deckTakeUI.js
// 牌库取牌界面（检索 / 翻阅 共用的唯一实现）
//
// 为什么能共用：检索与翻阅本质是同一条流水线 ——
//   「取牌范围 → 检索式面板 → 选落点取走 → 告知对方」
// 差异只有两处，且全部收口在本文件的两张配置里：
//   ① 牌面范围：检索 = 整个牌库          / 翻阅 = 牌库顶 N 张
//   ② 取牌之后：检索 = 洗切 + 弹"检索告知" / 翻阅 = 不洗切 + 告知"翻到了这张"
// 其余（落点动作、面板外观、刷新时机、关闭回调）完全一致 ✓
//
// 对外（MenuAction 只调这几行，业务细节都在这里 ✓）：
//   DeckTakeUI.init()             订阅会话 → 驱动我方翻阅面板（打开 / 原地刷新 / 收起）
//   DeckTakeUI.openSearch(zone)   打开检索面板
//   DeckTakeUI.openPeek(zone, n)  打开翻阅面板（顶 n 张）
//   DeckTakeUI.ACTIONS            取牌落点表（供其它界面复用 ✓）

(function(global) {
    /** 取牌落点：检索与查阅一模一样 ✓ */
    const ACTIONS = [
        { value: 'hand', label: '加入手牌' },
        { value: 'frontField', label: '放前场' },
        { value: 'backField', label: '放后场' },
        { value: 'graveyard', label: '送墓' },
        { value: 'exile', label: '放逐' }
    ];

    /**
     * ★翻阅专属落点：在上面 5 个之外多两个「回顶 / 回底」✓
     *   回顶 / 回底会按【卡牌类型】把牌放回对应牌库：
     *   费用卡 → 费用牌库 · 传说系列 → 传说牌库 · 其余 → 主牌库 ✓
     *   （也算"处理完一张" → 翻阅的剩余张数照常 -1 ✓）
     */
    const PEEK_ACTIONS = [
        { value: 'hand', label: '加入手牌' },
        { value: 'frontField', label: '放前场' },
        { value: 'backField', label: '放后场' },
        { value: 'graveyard', label: '送墓' },
        { value: 'exile', label: '放逐' },
        { value: 'deckTop', label: '回顶（按类型回库）' },
        { value: 'deckBottom', label: '回底（按类型回库）' }
    ];

    /**
     * ★查阅（墓场 / 放逐区）专属落点：
     *   · 第一项「仅查阅」= 只看不动（点牌不会移走 ✓ 面板留在原地 ✓）
     *   · 尾部追加「回顶 / 回底」（按【卡牌类型】放回对应牌库 ✓）
     *   · 本区自己那一项丢掉（墓场不给「送墓」/ 放逐区不给「放逐」✓）
     */
    const BROWSE_ACTIONS = [
        { value: 'keep', label: '仅查阅' },
        { value: 'hand', label: '加入手牌' },
        { value: 'frontField', label: '放前场' },
        { value: 'backField', label: '放后场' },
        { value: 'graveyard', label: '送墓' },
        { value: 'exile', label: '放逐' },
        { value: 'deckTop', label: '回顶（按类型回库）' },
        { value: 'deckBottom', label: '回底（按类型回库）' }
    ];

    /** 查阅面板的落点表：按所在区域裁一次 ✓ */
    function browseActions(zone) {
        return BROWSE_ACTIONS.filter(a => a.value !== zone);
    }

    // 牌库中文名统一来自 core/util.js ✓（保留本地兜底 → 与加载顺序无关 ✓）
    const DECK_LABEL = (global.GameUtil && global.GameUtil.DECK_LABELS) || {
        mainDeck: '主牌库', costDeck: '费用牌库', legendDeck: '传说牌库',
        graveyard: '墓场', exile: '放逐区'
    };

    /**
     * ★三种模式 = 同一条流水线的三组配置（差异只有这两列 ✓）
     *   source   ：deck=整个牌库 / top=牌库顶 N 张 / zone=墓场·放逐区
     *   announce ：是否先告诉对方"我正在行动"（查阅=否 → 仅查阅纯私下 ✓）
     *   shuffle  ：取牌后洗不洗（只有检索洗 ✓）
     *   notify   ：取牌后对方看到什么（那张牌 / 翻到了这张 / 查阅了这张 ✓）
     */
    const MODES = {
        search: {
            icon: '🔎', source: 'deck', announce: 'search', notify: 'search', shuffle: true,
            title: zone => `${zoneLabel(zone)}检索`,
            hint: '检索后自动洗切牌库'
        },
        peek: {
            icon: '🃏', source: 'top', announce: 'peek', notify: 'peek', shuffle: false,
            title: (zone, n) => `${zoneLabel(zone)} 翻阅（牌库顶 ${n} 张）`,
            // ★翻阅 = 逐张处理：取一张不关面板，剩余张数同步给对方，全处理完才结束 ✓
            //   （★阶段F2 唯一改动：对方那边的"取牌确认界面"要等我方全部处理完才呼出 ✓）
            //   「回顶 / 回底」按卡牌类型回对应牌库（费用卡→费用库 / 传说→传说库 / 其余→主库 ✓）
            hint: '翻阅中：把翻到的每一张都处理完才结束（不洗切牌库）· 回顶/回底按卡牌类型回库 · 对方要等你全部处理完才会看到取牌确认界面'
        },
        browse: {
            icon: '🗂', source: 'zone', announce: null, notify: 'browse', shuffle: false,
            title: zone => `${zoneLabel(zone)}查阅`,
            hint: '查阅：默认「仅查阅」只看不动；一旦取牌，对方会看到是哪一张 · 尾部「回顶 / 回底」按卡牌类型回库'
        }
    };

    let activeId = null;      // 本模块当前驱动着的会话 id（换会话必然重开 ✓）
    let unsub = null;

    function rc() { return global.RevealChannel; }
    function viewer() { return global.ViewerUI; }

    function zoneLabel(zone) {
        const U = global.GameUtil;
        return (U && U.deckLabel) ? U.deckLabel(zone) : (DECK_LABEL[zone] || '牌库');
    }

    /** 我方某区域里的卡牌（牌库 / 墓场 / 放逐区 都是普通数组 ✓） */
    function zoneInstances(zone) {
        const GS = global.GameState;
        const st = GS && GS.getState ? GS.getState() : null;
        const arr = st && st.players && st.players.self ? st.players.self[zone] : null;
        return Array.isArray(arr) ? arr : [];
    }

    /** 面板公共配置（三种模式共用 ✓，差异只有 icon / hint） */
    function panelBase(modeKey, zone) {
        const M = MODES[modeKey] || MODES.search;
        return {
            // 翻阅 → 多「回顶 / 回底」；查阅 → 多「仅查阅」+「回顶 / 回底」（按区域裁一次 ✓）；检索 → 原样 ✓
            actions: modeKey === 'peek' ? PEEK_ACTIONS
                : (modeKey === 'browse' ? browseActions(zone) : ACTIONS),
            // ★查阅的默认动作 = 仅查阅（点牌不会误移走 ✓）
            defaultAction: modeKey === 'browse' ? 'keep' : 'hand',
            icon: M.icon,
            hint: M.hint,
            onClose: () => { const R = rc(); if (R) R.close(); }   // 只看不取 → 直接收尾 ✓
        };
    }

    function warn(msg) {
        if (global.UI && global.UI.showNotification) global.UI.showNotification(msg, 'warning');
    }

    /**
     * 取走一张 —— ★三种模式的唯一差异点（洗不洗 + 怎么告知对方）都在这里 ✓
     * @param {string} mode 'search' | 'peek' | 'browse'
     */
    function take(zone, instance, action, mode) {
        const MA = global.MenuAction;
        if (!MA || !MA.takeCardFromDeck) return false;
        if (action === 'keep') return false;                 // ★仅查阅：不移动、不告知（由 pickHandler 拦下 ✓）
        const M = MODES[mode] || MODES.search;
        return MA.takeCardFromDeck(zone, instance, action, {
            noShuffle: !M.shuffle,
            notify: M.notify
        });
    }

    /**
     * 面板里点击一张牌的处理入口 ✓
     * @returns {boolean} true = 取牌后【留在面板里继续】；其它 = 按老规矩关闭面板 ✓
     *   · 检索 / 查阅 → 取一张就收工（关闭 ✓）
     *   · 翻阅       → 翻到的牌还有没处理的 → 留着，全部处理完才关 ✓
     */
    function pickHandler(zone, modeKey) {
        return (inst, action) => {
            if (action === 'keep') return true;                  // ★「仅查阅」：只看不动，面板留着 ✓
            if (!take(zone, inst, action, modeKey)) return false;
            if (modeKey !== 'peek') return false;
            const R = rc();
            const s = R && R.getSession ? R.getSession() : null;
            return !!(s && s.kind === 'peek' && s.stage === 'open');    // ★还有剩余 → 留在面板 ✓
        };
    }

    /* ================= 检索 / 查阅：静态列表（整库 / 墓场 / 放逐区） ================= */

    function openZonePanel(modeKey, zone) {
        const V = viewer(), R = rc();
        const M = MODES[modeKey];
        if (!V || !R || !M) return false;

        const cards = zoneInstances(zone);
        if (!cards.length) { warn(`${zoneLabel(zone)}是空的`); return false; }

        if (M.announce === 'search') R.startSearch(zone);   // 检索先告知"正在检索" ✓（查阅不告知 ✓）
        activeId = null;                                    // 静态面板不参与"翻阅刷新" ✓
        V.show(
            cards.slice(),
            M.title(zone),
            pickHandler(zone, modeKey),
            panelBase(modeKey, zone)
        );
        return true;
    }

    /** 检索：整个牌库（取牌后洗切 + 告知对方"检索了哪张" ✓） */
    function openSearch(zone) { return openZonePanel('search', zone); }

    /** 查阅：墓场 / 放逐区（先不告知 ✓；取牌才弹"查阅了这张" ✓；不洗切 ✓） */
    function openBrowse(zone) { return openZonePanel('browse', zone); }

    /* ================= 翻阅：牌库顶 N 张 ================= */

    function openPeek(zone, count) {
        const R = rc();
        if (!R) return false;
        return R.startPeek(zone, count);              // 会话建好 → onSession 会开面板 ✓
    }

    /** 我方翻阅面板：按会话驱动（打开 / 原地刷新 / 收起 ✓） */
    function onSession(s) {
        const V = viewer(), R = rc();
        if (!V) return;

        const minePeek = !!(s && s.owner === 'self' && s.kind === 'peek' && s.stage === 'open');
        if (!minePeek) {
            if (activeId) { activeId = null; if (V.hide) V.hide(); }
            return;
        }

        const cards = R.myVisibleInstances();
        // ★标题按"剩余待处理张数"写（取走一张后同步变小 ✓）
        const title = `${s.note || zoneLabel(s.zone) + ' 翻阅'}（剩余 ${s.count} 张）`;
        const reopened = activeId !== s.id || (V.isOpen && !V.isOpen());

        if (reopened) {
            // 新会话（含"第二次翻阅"✓）或面板被关掉 → 重新打开 ✓
            activeId = s.id;
            V.show(cards, title, pickHandler(s.zone, 'peek'), Object.assign(
                panelBase('peek', s.zone),
                {
                    controls: [
                        { type: 'checkbox', label: '公开给对手', checked: !!s.revealed, onChange: v => R.setRevealed(v) },
                        { type: 'button', label: '+1 张', onClick: () => R.addCount(1) },
                        { type: 'button', label: '收起', onClick: () => R.close() }
                    ]
                }
            ));
        } else {
            V.update(cards, title, { revealed: !!s.revealed });   // 原地刷新（不重开、不重置筛选 ✓）
        }
    }

    function init() {
        const R = rc();
        if (!R || !R.subscribe) {
            console.warn('[DeckTakeUI] RevealChannel 未加载，取牌界面停用');
            return false;
        }
        if (!unsub) unsub = R.subscribe(onSession);
        return true;
    }

    global.DeckTakeUI = { init, openSearch, openPeek, openBrowse, take, ACTIONS, PEEK_ACTIONS, BROWSE_ACTIONS, browseActions, MODES, zoneLabel };
})(window);
