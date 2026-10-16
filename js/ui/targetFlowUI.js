// js/ui/targetFlowUI.js
// 「点格子选落点」流程（阶段4 拆分：从 core/menuAction.js 外迁 —— core 不该碰 DOM ✗）
//
//   startSelection(card, targetZone)            登场 / 发动 / 支付（单区域 ✓）
//   startSelectionMultiZone(card, zones, fd)    翻盖（前场 + 后场 都可点 ✓）
//   startSelectionOnSide(zones, side, onPick [, onCancel])
//                                               转移 / 复制 / 装备掉落（可指定对方半场 ✓）
//                                               onCancel 可选：点别处 / Esc 取消时回调 ✓
//   cancelSelection()                           收掉高亮 / 取消（其它流程也会调 ✓）
//
// 依赖：CardActions.moveCard（落子）· StateCommit.refresh（重绘）· UI.showNotification（提示 ✓）
// 兼容：global.MenuAction 仍导出 startSelectionOnSide / cancelSelection（内部转发 ✓）

(function(global) {
    let selectionState = null;
    let boundSlots = [];
    let globalCancelHandler = null;

    function notify(msg, type) {
        if (global.UI && global.UI.showNotification) global.UI.showNotification(msg, type || 'info');
    }
    function refreshAll() {
        if (global.StateCommit) global.StateCommit.refresh();
    }

    /**
     * 点亮某方某区域的空格
     * @param {string} zone 'frontField' | 'backField' | 'costZone'
     * @param {string} [side] 'self'（默认 ✓）| 'opponent'（转移控制权时点亮对方半场 ✓）
     */
    function highlightEmptySlots(zone, side) {
        const who = (side === 'opponent') ? 'opponent' : 'self';
        const idMap = {
            frontField: who + '-front-field',
            backField: who + '-back-field',
            costZone: who + '-cost-zone'
        };

        const container = document.getElementById(idMap[zone] || '');
        if (!container) return [];
        const emptySlots = container.querySelectorAll('.field-slot.empty');
        emptySlots.forEach(slot => slot.classList.add('selectable'));
        return Array.from(emptySlots);
    }

    function highlightEmptySlotsMulti(zones) {
        let allSlots = [];
        zones.forEach(zone => {
            allSlots = allSlots.concat(highlightEmptySlots(zone));
        });
        return allSlots;
    }

    function clearHighlights() {
        boundSlots.forEach(slot => {
            slot.classList.remove('selectable');
            if (slot._menuActionHandler) {
                slot.removeEventListener('click', slot._menuActionHandler);
                delete slot._menuActionHandler;
            }
        });
        boundSlots = [];
    }

    function bindGlobalCancel() {
        if (globalCancelHandler) return;
        globalCancelHandler = (e) => {
            if (!e.target.closest('.field-slot.selectable')) {
                cancelSelection();
            }
        };
        document.addEventListener('mousedown', globalCancelHandler, true);
    }

    function cancelSelection() {
        const state = selectionState;
        if (state) {
            clearHighlights();
            selectionState = null;
        }
        document.body.classList.remove('place-select');
        if (globalCancelHandler) {
            document.removeEventListener('mousedown', globalCancelHandler, true);
            globalCancelHandler = null;
        }
        // ★可选的取消回调（没设就是纯取消 ✓ 老流程一行都不用改 ✓）
        if (state && typeof state.onCancel === 'function') state.onCancel();
    }
    function startSelection(card, targetZone) {
        if (selectionState) cancelSelection();

        const slots = highlightEmptySlots(targetZone);
        if (slots.length === 0) {
            notify('没有可用的空位', 'warning');
            return false;
        }

        slots.forEach(slot => {
            const handler = (e) => {
                e.stopPropagation();
                handleSlotClick(slot, card, targetZone, false);
            };
            slot.addEventListener('click', handler);
            slot._menuActionHandler = handler;
            boundSlots.push(slot);
        });

        selectionState = { card, targetZone, faceDown: false };
        document.body.classList.add('place-select');
        bindGlobalCancel();
        return true;
    }

    function startSelectionMultiZone(card, zones, faceDown) {
        if (selectionState) cancelSelection();

        const slots = highlightEmptySlotsMulti(zones);
        if (slots.length === 0) {
            notify('没有可用的空位', 'warning');
            return false;
        }

        slots.forEach(slot => {
            const handler = (e) => {
                e.stopPropagation();
                handleSlotClickMultiZone(slot, card, zones, faceDown);
            };
            slot.addEventListener('click', handler);
            slot._menuActionHandler = handler;
            boundSlots.push(slot);
        });

        selectionState = { card, targetZones: zones, faceDown: faceDown };
        document.body.classList.add('place-select');
        bindGlobalCancel();
        return true;
    }

    /**
     * 落子：把卡放进某个空格（菜单里点「登场 / 发动 / 盖伏」后再点格子走这里）
     * handleSlotClick 与 handleSlotClickMultiZone 原来是两份 95% 相同的代码，
     * 现合并到这里：多区域版先解析出具体区域，再走同一套放置逻辑。
     */
    function placeCardInSlot(slot, card, zoneKey, faceDown) {
        const zone = mapZone(zoneKey);
        if (!zone) return;
        card.faceDown = faceDown;
        const ok = global.CardActions.moveCard(card.instanceId, zone, getIndexFromSlot(slot, zoneKey));
        if (ok) refreshAll();
        else notify('放置失败', 'error');
        cancelSelection();
    }

    /**
     * 点亮某方【多个区域】的空格（前场 + 后场 一起用）✓
     * @returns {Array} [{ slot, zone }] 带区域信息的格子列表
     */
    function highlightEmptySlotsForSide(zones, side) {
        const list = [];
        (Array.isArray(zones) ? zones : [zones]).forEach(zone => {
            highlightEmptySlots(zone, side).forEach(slot => list.push({ slot: slot, zone: zone }));
        });
        return list;
    }

    /** 从格子反推它属于哪个区域（只认候选区域里的 ✓，按指定半场判断） */
    function zoneFromSlotForSide(slot, zones, side) {
        const who = (side === 'opponent') ? 'opponent' : 'self';
        const list = Array.isArray(zones) ? zones : [zones];
        if (list.indexOf('frontField') >= 0 && slot.closest('#' + who + '-front-field')) return 'frontField';
        if (list.indexOf('backField') >= 0 && slot.closest('#' + who + '-back-field')) return 'backField';
        if (list.indexOf('costZone') >= 0 && slot.closest('#' + who + '-cost-zone')) return 'costZone';
        return null;
    }
    /**
     * 通用「点格子」流程（支持指定半场 + 多个区域）
     * 转移控制权 / 复制卡牌 用它选落点：战场 = 前场 + 后场 都可点 ✓
     * @param {string|Array} zoneOrZones 'frontField' 或 ['frontField','backField']
     * @param {string} side   'self' | 'opponent'
     * @param {function} onPick (index, slot, zone) => void
     * @returns {boolean} 是否进入选格状态
     */
    function startSelectionOnSide(zoneOrZones, side, onPick, onCancel) {
        if (selectionState) cancelSelection();

        const zones = Array.isArray(zoneOrZones) ? zoneOrZones : [zoneOrZones];
        const picked = highlightEmptySlotsForSide(zones, side);
        if (picked.length === 0) {
            notify('没有可用的空位', 'warning');
            return false;
        }

        picked.forEach(entry => {
            const slot = entry.slot;
            const zone = entry.zone;
            const handler = (e) => {
                e.stopPropagation();
                const index = getIndexFromSlot(slot, zone);
                const hitZone = zoneFromSlotForSide(slot, zones, side) || zone;
                if (selectionState) selectionState.onCancel = null;   // ★"点中"不算"取消"✓
                cancelSelection();                    // 先收掉高亮，再执行动作 ✓
                if (typeof onPick === 'function') onPick(index, slot, hitZone);
            };
            slot.addEventListener('click', handler);
            slot._menuActionHandler = handler;
            boundSlots.push(slot);
        });

        selectionState = { zones: zones, side: side, onPick: onPick, onCancel: onCancel };
        document.body.classList.add('place-select');
        bindGlobalCancel();
        return true;
    }

    function handleSlotClick(slot, card, targetZone, faceDown) {
        placeCardInSlot(slot, card, targetZone, faceDown);
    }

    function handleSlotClickMultiZone(slot, card, zones, faceDown) {
        const zoneKey = determineZoneFromSlot(slot, zones);
        if (!zoneKey) return;
        placeCardInSlot(slot, card, zoneKey, faceDown);
    }

    function determineZoneFromSlot(slot, zones) {
        if (zones.includes('frontField') && slot.closest('#self-front-field')) return 'frontField';
        if (zones.includes('backField') && slot.closest('#self-back-field')) return 'backField';
        return null;
    }

    /** 格子的 data-index → 区域下标（费用区是两行 × 5 列 ✓） */
    function getIndexFromSlot(slot, zone) {
        if (zone === 'costZone') {
            const costZone = slot.closest('.cost-zone');
            const rowEl = slot.closest('.cost-row');
            if (costZone && rowEl) {
                const rows = Array.from(costZone.querySelectorAll('.cost-row'));
                const rowIndex = rows.indexOf(rowEl);
                const colIndex = parseInt(slot.getAttribute('data-index') || '0', 10);
                return rowIndex * 5 + colIndex;
            }
            return 0;
        }
        return parseInt(slot.getAttribute('data-index') || '0', 10);
    }

    /** 区域简称 → GameState 区域常量 ✓ */
    function mapZone(zone) {
        if (zone === 'frontField') return global.GameState.ZONE.FRONT_FIELD;
        if (zone === 'backField') return global.GameState.ZONE.BACK_FIELD;
        if (zone === 'costZone') return global.GameState.ZONE.COST_ZONE;
        return null;
    }

    global.TargetFlowUI = {
        startSelection,
        startSelectionMultiZone,
        startSelectionOnSide,
        cancelSelection,
        isSelecting: () => !!selectionState
    };
})(window);
