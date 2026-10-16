// js/core/cardEntry.js
// 「进入新区域之后」的副作用（阶段3 拆分：从 cardActions.js 外迁）
//   ① emitTimePoint           —— 广播时点（响应连锁感知：minion:enter / tactic:activate / flip:declare ✓）
//   ② emitFlipTimePoint       —— 玩家手动「翻盖」行动广播 ✓
//   ③ applyAutoToggle         —— 费牌进费用区自动「切换」（与手动切换同一条路 ✓）
//   ④ markBattlefieldEntry    —— 随从进前场打「本回合进入战场」标记 + 立即补同步 ✓
//   ⑤ clearEnteredThisTurnMarks —— 回合交替统一清空标记 ✓
//   ⑥ afterZoneEnter          —— 上面①②③的统一入口（moveCard 调用 ✓）
//
// 说明：本模块【不负责界面重绘】（低层副作用 ✓）；改状态的模块由调用方决定何时重绘 ✓
// 兼容：global.CardActions 仍导出同名函数（内部转发 ✓）

(function(global) {
    const GameState = global.GameState;

    // 同名的局部别名 → 下面搬过来的代码可以【一个字都不用改】✓
    function findCardInstance(instanceId) {
        return global.CardQuery ? global.CardQuery.findCardInstance(instanceId) : null;
    }

    /** 战场区域（前场 / 后场）—— 战场内互相移动不算"登场" ✓ */
    function isBattlefieldZone(zone) {
        return zone === GameState.ZONE.FRONT_FIELD || zone === GameState.ZONE.BACK_FIELD;
    }

    /**
     * 位置变动后广播「时点」事件（供响应连锁系统感知）。
     * 连锁系统不存在 / 被关闭时，这里只是往空的总线 emit，零副作用 ✓
     */
    function emitTimePoint(instanceId, toZone, fromZone, opts) {
        if (!global.TimePointBus || !global.TimePointBus.emit) return;

        // ★装备「掉落 / 卸下」落到后场：不算"在后场进行发动" → 不广播 tactic:activate ✗
        //   （否则响应连锁会为一张只是被卸下来的卡开窗 ✗ 由调用方给 opts.noActivate ✓）
        const noActivate = !!(opts && opts.noActivate);

        // ★响应连锁的呼出条件：只有【从非战场区域进入战场】才广播时点 ✓
        //   已经在战场上的卡在前/后场之间挪格子 → 不触发响应连锁界面 ✗
        if (isBattlefieldZone(toZone) && isBattlefieldZone(fromZone)) return;

        const found = findCardInstance(instanceId);
        if (!found || !found.card) return;
        const actor = found.player === 'opponent' ? 'opponent' : 'self';
        const type = found.data ? found.data.type : null;

        if (toZone === GameState.ZONE.FRONT_FIELD) {
            if (!found.card.faceDown) {                 // 伏盖不算"登场"
                global.TimePointBus.emit({ type: 'minion:enter', actor, card: found.card, toZone });
            }
        } else if (toZone === GameState.ZONE.BACK_FIELD && type === 'tactic' && !noActivate) {
            global.TimePointBus.emit({ type: 'tactic:activate', actor, card: found.card, toZone });
        }

        // ★「翻盖」时点：盖伏着进入战场（手牌菜单的「翻盖」= 盖伏登场 ✓）也算一次翻盖行动 ✓
        //   （正因为是盖伏，上面那句 minion:enter 被跳过了，所以这里不会重复开窗 ✓）
        if (isBattlefieldZone(toZone) && !isBattlefieldZone(fromZone) && found.card.faceDown) {
            global.TimePointBus.emit({
                type: 'flip:declare', actor, card: found.card, toZone, reason: 'enter'
            });
        }
    }

    /**
     * 「翻盖」时点：玩家执行「翻盖」行动后广播，供响应连锁呼出窗口 ✓
     *   · 只有【战场上】的卡才算翻盖行动（前场 / 后场右键菜单里的「翻盖」✓）
     *   · 翻成盖伏、或把盖伏翻回正面，点的是同一个「翻盖」按钮 → 都算一次翻盖行动 ✓
     */
    function emitFlipTimePoint(card) {
        if (!card || !global.TimePointBus || !global.TimePointBus.emit) return;
        if (card.zone !== GameState.ZONE.FRONT_FIELD && card.zone !== GameState.ZONE.BACK_FIELD) return;
        const found = findCardInstance(card.instanceId);
        const actor = (found && found.player === 'opponent') ? 'opponent' : 'self';
        global.TimePointBus.emit({
            type: 'flip:declare', actor, card, faceDown: !!card.faceDown, reason: 'toggle'
        });
    }
    /**
     * 进区后自动「切换」（横置 / 竖置）—— 等同玩家手动点右键菜单的「切换」。
     * 触发条件（只在【跨区进入】时触发）：费牌进入费用区 ✓
     * 注意（1.2 改动）：随从进入前场【不再自动切换】✗ → 改成打「本回合进入战场」标记 ✓
     */
    function applyAutoToggle(instanceId, toZone, fromZone) {
        if (!toZone || fromZone === toZone) return;
        const found = findCardInstance(instanceId);
        if (!found || !found.card) return;
        const type = found.data ? found.data.type : null;
        if (toZone !== GameState.ZONE.COST_ZONE || type !== 'cost') return;

        if (global.MenuAction && global.MenuAction.toggleActive) {
            global.MenuAction.toggleActive(found.card);        // 与手动「切换」完全一致
        } else {
            found.card.active = !found.card.active;
            if (global.UI && global.UI.applyCardMarkers) global.UI.applyCardMarkers();
        }
    }

    /**
     * 把「本回合进入战场」标记的变化同步给对手（只同步自己的卡）✓
     * 为什么必须单独补一次同步：moveCard 内部是先落区（这时联机已经发过状态），
     *   本标记是在那之后才设置的 ✗ → 若不补发，对方会看到随从入场、却看不到「新」标记 ✗
     */
    function syncEnteredMark(found) {
        if (!found || found.player !== 'self') return;
        if (global.SyncManager && global.SyncManager.sendPublicState) {
            global.SyncManager.sendPublicState('self');
        }
    }

    /**
     * 「本回合进入战场」标记：
     *   · 随从【跨区进入前场】→ 打上 card.enteredThisTurn = true（伏盖不算「登场」✓）
     *   · 进入前场以外的区域 → 清掉标记
     *   · 回合交替时统一清空 —— 见 clearEnteredThisTurnMarks()
     */
    function markBattlefieldEntry(instanceId, toZone, fromZone) {
        const found = findCardInstance(instanceId);
        if (!found || !found.card) return;
        const card = found.card;
        const type = found.data ? found.data.type : null;

        const enteringFront = (toZone === GameState.ZONE.FRONT_FIELD
            && type === 'minion'
            && !isBattlefieldZone(fromZone)      // ★战场内移动不重新打「新」标记（与连锁口径一致 ✓）
            && !card.faceDown);

        const before = !!card.enteredThisTurn;

        if (enteringFront) {
            card.enteredThisTurn = true;
        } else if (toZone !== GameState.ZONE.FRONT_FIELD) {
            card.enteredThisTurn = false;      // 离开前场 → 标记作废
        }

        if (card.enteredThisTurn !== before) syncEnteredMark(found);   // ★变化才同步，避免无意义刷屏
    }

    /** 回合交替：清空【两端】所有「本回合进入战场」标记（返回清掉的数量） */
    function clearEnteredThisTurnMarks() {
        const state = GameState.getState();
        if (!state || !state.players) return 0;
        let cleared = 0;
        let selfCleared = 0;
        ['self', 'opponent'].forEach(p => {
            const ps = state.players[p];
            if (!ps) return;
            ['frontField', 'backField'].forEach(zoneName => {
                if (!Array.isArray(ps[zoneName])) return;
                ps[zoneName].forEach(c => {
                    if (c && c.enteredThisTurn) {
                        c.enteredThisTurn = false;
                        cleared++;
                        if (p === 'self') selfCleared++;
                    }
                });
            });
        });
        syncEnteredMark(selfCleared > 0 ? { player: 'self' } : null);   // 自己的卡变了 → 补一次同步 ✓
        return cleared;
    }

    /** 进入新区域后的统一处理：① 广播时点 ② 费牌进费用区自动切换 ③ 入场标记 */
    function afterZoneEnter(instanceId, toZone, fromZone, opts) {
        emitTimePoint(instanceId, toZone, fromZone, opts);
        applyAutoToggle(instanceId, toZone, fromZone);
        markBattlefieldEntry(instanceId, toZone, fromZone);
    }

    global.CardEntry = {
        isBattlefieldZone,
        emitTimePoint,
        emitFlipTimePoint,
        applyAutoToggle,
        syncEnteredMark,
        markBattlefieldEntry,
        clearEnteredThisTurnMarks,
        afterZoneEnter
    };
})(window);
