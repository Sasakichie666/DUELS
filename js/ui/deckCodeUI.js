// js/ui/deckCodeUI.js
// 卡组码弹窗（生成 / 复制 / 粘贴导入）—— 属于【卡组管理器】这一侧（游戏内必需组件 ✓）
//   · 生成：DeckManager.exportCode(deckId) → 三行 6 位编号
//   · 复制：navigator.clipboard + execCommand 兜底（file:// 打开时剪贴板 API 常常不可用 ✓）
//   · 导入：★永远新建一份【独立】卡组（内容相同也不合并、不覆盖 ✓）

(function(global) {
    const DeckCodeUI = {
        els: {
            modal: document.getElementById('deckCodeModal'),
            hint: document.getElementById('deckCodeHint'),
            text: document.getElementById('deckCodeText'),
            btnCopy: document.getElementById('btnCopyDeckCode'),
            btnCopyReadable: document.getElementById('btnCopyDeckReadable'),
            btnClose: document.getElementById('btnDeckCodeClose'),
            importModal: document.getElementById('deckImportModal'),
            importText: document.getElementById('deckImportText'),
            importPreview: document.getElementById('deckImportPreview'),
            btnImportConfirm: document.getElementById('btnDeckImportConfirm'),
            btnImportCancel: document.getElementById('btnDeckImportCancel'),
            btnImportClose: document.getElementById('btnDeckImportClose')
        },

        _currentDeckId: '',

        init() {
            const e = this.els;
            const on = (el, fn) => { if (el && el.addEventListener) el.addEventListener('click', fn); };

            on(e.btnClose, () => this.close());
            on(e.btnCopy, () => {
                const text = e.text ? e.text.value : '';
                if (!text) return;
                this.copyText(text, '📋 卡组码已复制，直接发给朋友即可');
            });
            on(e.btnCopyReadable, () => {
                const txt = global.DeckManager.readableOf(this._currentDeckId);
                if (!txt) { global.UI.showNotification('这个卡组还没有内容', 'warning'); return; }
                this.copyText(txt, '📝 卡表已复制（带卡名与编号，方便群里核对）');
            });

            on(e.btnImportClose, () => this.closeImport());
            on(e.btnImportCancel, () => this.closeImport());
            on(e.btnImportConfirm, () => this.doImport());
            if (e.importText) e.importText.addEventListener('input', () => this.previewImport());

            [e.modal, e.importModal].forEach(modal => {      // 点遮罩关闭
                if (!modal || !modal.addEventListener) return;
                modal.addEventListener('click', ev => {
                    if (ev.target !== modal) return;
                    if (modal === e.modal) this.close(); else this.closeImport();
                });
            });
        },

        /* ---------- 剪贴板（带 file:// 兜底 ✓） ---------- */
        copyText(text, okMsg) {
            const done = (ok) => {
                if (ok) global.UI.showNotification(okMsg, 'success', 2200);
                else global.UI.showNotification('复制失败：请手动全选复制（Ctrl+C）', 'warning', 3500);
            };
            const fallback = () => {
                try {
                    const ta = document.createElement('textarea');
                    ta.value = text;
                    ta.setAttribute('readonly', 'readonly');
                    ta.style.position = 'fixed';
                    ta.style.left = '-9999px';
                    document.body.appendChild(ta);
                    ta.select();
                    let ok = false;
                    try { ok = document.execCommand && document.execCommand('copy'); } catch (err) { ok = false; }
                    document.body.removeChild(ta);
                    done(ok);
                } catch (err) { done(false); }
            };
            if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
                global.navigator.clipboard.writeText(text).then(() => done(true), fallback);
            } else {
                fallback();
            }
        },

        /* ---------- 生成 / 复制卡组码 ---------- */
        openCode(deckId) {
            const e = this.els;
            if (!e.modal) return false;
            this._currentDeckId = deckId || global.DeckManager.getWorkingDeckId();
            const res = global.DeckManager.exportCode(this._currentDeckId);
            if (!res.ok) {
                let msg = res.error || '生成卡组码失败';
                if (res.unnumbered && res.unnumbered.length) {
                    msg += '：' + res.unnumbered.slice(0, 5).map(u => u.name).join('、')
                        + (res.unnumbered.length > 5 ? ' 等' : '');
                }
                global.UI.showNotification(msg, 'error', 6000);
                return false;
            }
            if (e.text) e.text.value = res.text;
            if (e.hint) {
                const deck = (deckId ? global.DeckStore.get(deckId) : global.DeckManager.getWorkingDeck()) || {};
                e.hint.textContent = '卡组：' + (deck.name || '（未命名）') + '　'
                    + (res.warnings.length ? '⚠️ ' + res.warnings.join('；') + '（仍可复制）' : '✓ 三行分别是 主 / 费用 / 传说');
            }
            e.modal.hidden = false;
            return true;
        },

        close() { if (this.els.modal) this.els.modal.hidden = true; },

        /* ---------- 粘贴导入 ---------- */
        openImport(prefill) {
            const e = this.els;
            if (!e.importModal) return false;
            if (e.importText) e.importText.value = prefill || '';
            this.previewImport();
            e.importModal.hidden = false;
            return true;
        },

        closeImport() { if (this.els.importModal) this.els.importModal.hidden = true; },

        /** 实时预览：解出张数 / 缺卡 / 放错卡组 —— 让用户先看清再导入 ✓ */
        previewImport() {
            const e = this.els;
            if (!e.importPreview) return;
            const text = e.importText ? e.importText.value : '';
            if (!String(text).trim()) {
                e.importPreview.textContent = '把卡组码粘进来，这里会先给你看解析结果 ✓';
                return;
            }
            const res = global.DeckCode.decode(text);
            if (!res.ok) { e.importPreview.textContent = '❌ ' + res.error; return; }
            const parts = [
                '识别到 ' + res.codeCount + ' 个编号',
                '主 ' + res.piles.mainDeck.length + ' / 费 ' + res.piles.costDeck.length + ' / 传 ' + res.piles.legendDeck.length
            ];
            if (res.missingCodes.length) {
                parts.push('本机卡库没有这些编号：' + res.missingCodes.slice(0, 6).map(m => m.code).join('、')
                    + (res.missingCodes.length > 6 ? ' 等 ' + res.missingCodes.length + ' 个' : ''));
            }
            if (res.skipped.length) parts.push('放错卡组已跳过：' + res.skipped.length + ' 张');
            if (res.warnings.length) parts.push('提示：' + res.warnings.join('；'));
            e.importPreview.textContent = parts.join('　|　');
        },

        /** 导入 = ★永远新建一份独立卡组（不合并、不覆盖 ✓） */
        doImport() {
            const e = this.els;
            const text = e.importText ? e.importText.value : '';
            const stamp = new Date();
            const p2 = n => String(n).padStart(2, '0');
            const name = '导入 ' + p2(stamp.getMonth() + 1) + '-' + p2(stamp.getDate()) + ' ' + p2(stamp.getHours()) + ':' + p2(stamp.getMinutes());
            const res = global.DeckManager.importCode(text, name);
            if (!res.ok) {
                global.UI.showNotification(res.error || '导入失败', 'error', 6000);
                return;
            }
            const r = res.report || {};
            let msg = '📥 已新建卡组「' + res.deck.name + '」';
            if (r.missingCodes && r.missingCodes.length) msg += '（有 ' + r.missingCodes.length + ' 个编号在本机卡库找不到）';
            global.UI.showNotification(msg, (r.missingCodes && r.missingCodes.length) ? 'warning' : 'success', 5000);
            this.closeImport();
            this.afterDecksChanged();
        },

        /** 卡组列表变了：刷新管理器侧栏与 VS 准备界面 ✓ */
        afterDecksChanged() {
            if (global.DeckBuilderUI && global.DeckBuilderUI.refreshDeckViews) global.DeckBuilderUI.refreshDeckViews();
            if (global.MyDecksUI && global.MyDecksUI.refresh) global.MyDecksUI.refresh();
            if (global.DeckBuilderUI && global.DeckBuilderUI.renderDeckSlots) global.DeckBuilderUI.renderDeckSlots();
            if (global.VsDeckUI && global.VsDeckUI.refresh) global.VsDeckUI.refresh();
        }
    };

    global.DeckCodeUI = DeckCodeUI;
})(window);
