// js/ui/myDecksUI.js
// 「我的卡组」视图（卡组库总览）：多套卡组一览 + 新建 / 改名 / 复制 / 删除 / 设为出战 / 卡组码 / 编辑入口
//
// 分层（对齐参考项目的「牌组库 ↔ 牌组工坊」两层）：
//   · 本视图 = 卡组【库】：看有哪些卡组、改名字、加新的、决定哪一套出战 ✓
//   · 点卡片上的「✏️ 编辑」才进【卡组管理器】（js/ui/deckBuilderUI.js）改牌 ✓
// 数据全部走 js/deckManager.js（底层 js/core/deckStore.js）✓ 本文件不直接读 localStorage ✗

(function(global) {
    const MyDecksUI = {
        els: {
            grid: document.getElementById('decksGrid'),
            hint: document.getElementById('decksHint'),
            btnNew: document.getElementById('btnNewDeck'),
            btnPaste: document.getElementById('btnPasteDeckCode'),
            btnBack: document.getElementById('btnDecksBack')
        },

        init() {
            const e = this.els;
            const on = (el, fn) => { if (el && el.addEventListener) el.addEventListener('click', fn); };

            on(e.btnNew, () => this.newDeck());
            on(e.btnPaste, () => { if (global.DeckCodeUI) global.DeckCodeUI.openImport(''); });
            on(e.btnBack, () => global.UI.switchView('lobby'));

            const grid = e.grid;
            if (grid && !grid._delegateBound) {
                grid.addEventListener('click', (ev) => {
                    const card = ev.target.closest ? ev.target.closest('.deck-card') : null;
                    if (!card) return;
                    const deckId = card.getAttribute('data-deck-id');
                    const btn = ev.target.closest ? ev.target.closest('button[data-act]') : null;
                    const act = btn ? btn.getAttribute('data-act') : 'edit';   // 点卡片空白处 = 编辑 ✓
                    if (act === 'edit') this.editDeck(deckId);
                    else if (act === 'active') this.setActiveDeck(deckId);
                    else if (act === 'rename') this.renameDeck(deckId);
                    else if (act === 'duplicate') this.duplicateDeck(deckId);
                    else if (act === 'delete') this.deleteDeck(deckId);
                    else if (act === 'code') this.openCode(deckId);
                });
                grid._delegateBound = true;
            }
            this.refresh();
        },

        /** 重新渲染卡组卡片（卡组增删改后都要调 ✓） */
        refresh() {
            const grid = this.els.grid;
            if (!grid) return;
            const decks = global.DeckManager.listDecks();
            if (!decks.length) {
                grid.innerHTML = '<p class="decks-empty">还没有卡组 —— 点「＋ 新建卡组」开始吧 ✓</p>';
                return;
            }
            grid.innerHTML = decks.map(d => this._cardHtml(d)).join('');
        },

        _esc(s) {
            return String(s === undefined || s === null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        },

        _cardHtml(d) {
            const cfg = global.DeckManager.DECK_CONFIG;
            const badge = d.isActive ? '<span class="deck-badge">出战中</span>' : '';
            const state = d.isDeckReady
                ? '<div class="deck-card-state ok">✓ 卡组合法，可以准备</div>'
                : '<div class="deck-card-state bad">⚠️ 不完整（主 ' + d.mainCount + '/' + cfg.MAIN_DECK_SIZE
                    + ' · 费 ' + d.costCount + '/' + cfg.COST_DECK_SIZE + ' · 传 ' + d.legendCount + '/' + cfg.LEGEND_DECK_SIZE + '）</div>';
            return '<div class="deck-card' + (d.isActive ? ' is-active' : '') + '" data-deck-id="' + d.id + '">'
                + '<div class="deck-card-head"><span class="deck-card-name">' + this._esc(d.name) + '</span>' + badge + '</div>'
                + '<div class="deck-card-counts"><span>⚔️ 主 ' + d.mainCount + '</span><span>💎 费 ' + d.costCount + '</span><span>📜 传 ' + d.legendCount + '</span></div>'
                + state
                + '<div class="deck-card-actions">'
                + '<button class="btn btn-success btn-mini" data-act="edit" type="button">✏️ 编辑</button>'
                + '<button class="btn btn-mini" data-act="active" type="button" title="开局用这一套">📌 出战</button>'
                + '<button class="btn btn-mini" data-act="rename" type="button">改名</button>'
                + '<button class="btn btn-mini" data-act="duplicate" type="button" title="复制一份（独立卡组）">复制</button>'
                + '<button class="btn btn-mini" data-act="code" type="button" title="查看 / 复制卡组码">🔗 卡组码</button>'
                + '<button class="btn btn-danger btn-mini" data-act="delete" type="button"> 🗑️ </button>'
                + '</div></div>';
        }
    };

    /* ================= 卡片上的动作（全部走 DeckManager；本文件不碰存储 ✗） ================= */
    Object.assign(MyDecksUI, {
        /** 三处视图一起刷新（卡组管理器下拉 / 我的卡组 / VS 出战条 ✓） */
        _afterChange() {
            if (global.DeckBuilderUI && global.DeckBuilderUI.refreshDeckViews) global.DeckBuilderUI.refreshDeckViews();
            this.refresh();
            if (global.VsDeckUI && global.VsDeckUI.refresh) global.VsDeckUI.refresh();
        },

        /** ✏️ 编辑：把这份卡组装进卡组管理器并切过去（★卡组「编辑」的唯一入口 ✓） */
        editDeck(deckId) {
            if (!deckId) return;
            if (global.DeckBuilderUI && global.DeckBuilderUI.enterFromDecks) {
                global.DeckBuilderUI.enterFromDecks(deckId);
            } else {
                global.DeckManager.useDeck(deckId);
            }
            global.UI.switchView('deck');
        },

        newDeck() {
            const name = window.prompt('新卡组的名字：', '新卡组');
            if (name === null) return;
            const res = global.DeckManager.newDeck(name);
            if (res.error) { global.UI.showNotification(res.error, 'error'); return; }
            this._afterChange();
            global.UI.showNotification('➕ 已新建「' + res.deck.name + '」，点「✏️ 编辑」开始配牌 ✓', 'success', 3500);
        },

        renameDeck(deckId) {
            const S = global.DeckStore;
            const deck = S ? S.get(deckId) : null;
            if (!deck) return;
            const name = window.prompt('重命名卡组：', deck.name);
            if (name === null) return;
            const res = global.DeckManager.renameDeck(deckId, name);
            if (res.error) { global.UI.showNotification(res.error, 'error'); return; }
            this._afterChange();
            global.UI.showNotification('✏️ 已重命名为「' + res.name + '」', 'success', 2000);
        },

        duplicateDeck(deckId) {
            const res = global.DeckManager.duplicateDeck(deckId);
            if (res.error) { global.UI.showNotification(res.error, 'error'); return; }
            this._afterChange();
            global.UI.showNotification('⧉ 已复制为「' + res.deck.name + '」（独立卡组 ✓）', 'success', 3000);
        },

        deleteDeck(deckId) {
            const S = global.DeckStore;
            const deck = S ? S.get(deckId) : null;
            if (!deck) return;
            if (!window.confirm('删除卡组「' + deck.name + '」？此操作不可撤销。')) return;
            const res = global.DeckManager.deleteDeck(deckId);
            if (res.error) { global.UI.showNotification(res.error, 'error'); return; }
            this._afterChange();
            global.UI.showNotification('🗑️ 已删除「' + deck.name + '」', 'info', 2500);
        },

        setActiveDeck(deckId) {
            const res = global.DeckManager.setActiveDeck(deckId);
            if (res.error) { global.UI.showNotification(res.error, 'error'); return; }
            this._afterChange();
            const st = res.status || {};
            if (st.isDeckReady) global.UI.showNotification('📌 已设为出战卡组 ✓', 'success', 2500);
            else global.UI.showNotification('📌 已设为出战（卡组还不完整，补齐后才能准备 ✓）', 'warning', 4500);
        },

        openCode(deckId) {
            if (global.DeckCodeUI) global.DeckCodeUI.openCode(deckId);
        }
    });

    global.MyDecksUI = MyDecksUI;
})(window);
