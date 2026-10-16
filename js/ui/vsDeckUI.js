// js/ui/vsDeckUI.js
// VS 准备界面的「出战卡组」条：下拉切换 / 去编辑 / 看卡组码 / 合法性提示
//   · 卡组不合法 → 「准备」按钮被拦下，提示语见 DeckManager.READY_HINT ✓
//   · 双方各看自己的卡组（不需要联网同步：对手用什么卡组与我无关 ✓）

(function(global) {
    const VsDeckUI = {
        els: {
            bar: document.getElementById('vsDeckBar'),
            select: document.getElementById('vsDeckSelect'),
            btnEdit: document.getElementById('btnVsEditDeck'),
            btnCode: document.getElementById('btnVsDeckCode'),
            status: document.getElementById('vsDeckStatus')
        },

        init() {
            const e = this.els;
            if (e.select) {
                e.select.addEventListener('change', () => {
                    const res = global.DeckManager.setActiveDeck(e.select.value);
                    if (res.error) { global.UI.showNotification(res.error, 'error'); return; }
                    this.refresh();
                    if (global.DeckBuilderUI && global.DeckBuilderUI.renderDeckList) global.DeckBuilderUI.renderDeckList();
                    if (global.DeckBuilderUI && global.DeckBuilderUI.updateDeckStatus) global.DeckBuilderUI.updateDeckStatus();
                });
            }
            if (e.btnEdit) {
                e.btnEdit.addEventListener('click', () => {
                    global.UI.switchView('deck');
                    if (global.DeckBuilderUI && global.DeckBuilderUI.enterFromVs) {
                        global.DeckBuilderUI.enterFromVs(global.DeckManager.getActiveDeckId());
                    }
                });
            }
            if (e.btnCode) {
                e.btnCode.addEventListener('click', () => {
                    global.DeckCodeUI.openCode(global.DeckManager.getActiveDeckId());
                });
            }
            this.refresh();
        },

        refresh() {
            const e = this.els;
            if (!e.select) return;
            const activeId = global.DeckManager.getActiveDeckId();
            const decks = global.DeckManager.listDecks();

            // 下拉：名称 + 三区张数（不合法时标出来 ✓）
            e.select.innerHTML = decks.map(d => {
                const mark = d.isDeckReady ? '' : '（主' + d.mainCount + '/费' + d.costCount + '/传' + d.legendCount + '）';
                return '<option value="' + d.id + '"' + (d.id === activeId ? ' selected' : '') + '>'
                    + this._esc(d.name) + mark + '</option>';
            }).join('');
            if (!decks.length) {
                e.select.innerHTML = '<option value="">（还没有卡组）</option>';
            }

            // 状态文字：合法的说法 / 不合法要差量 + 统一提示语 ✓
            const status = activeId ? global.DeckManager.getDeckStatusById(activeId) : null;
            const cfg = global.DeckManager.DECK_CONFIG;
            if (e.status) {
                if (status && status.isDeckReady) {
                    e.status.textContent = '✓ 卡组合法，可以准备';
                    e.status.className = 'vs-deck-status ok';
                } else {
                    const parts = [];
                    if (status) {
                        if (!status.mainOk) parts.push('主 ' + status.mainCount + '/' + cfg.MAIN_DECK_SIZE);
                        if (!status.costOk) parts.push('费 ' + status.costCount + '/' + cfg.COST_DECK_SIZE);
                        if (!status.legendOk) parts.push('传 ' + status.legendCount + '/' + cfg.LEGEND_DECK_SIZE);
                        if (status.missingTotal > 0) parts.push('失效 ' + status.missingTotal + ' 张');
                    }
                    e.status.textContent = '⚠️ ' + global.DeckManager.READY_HINT + '（' + (parts.join('，') || '卡组为空') + '）';
                    e.status.className = 'vs-deck-status bad';
                }
            }
            if (e.bar) e.bar.classList.toggle('is-blocked', !(status && status.isDeckReady));
            return status;
        },

        _esc(s) {
            return String(s === undefined || s === null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        },

        /** 准备门禁（main.js 的「准备」按钮用 ✓） */
        requireReady() {
            return global.DeckManager.canReady(global.DeckManager.getActiveDeckId());
        }
    };

    global.VsDeckUI = VsDeckUI;
})(window);
