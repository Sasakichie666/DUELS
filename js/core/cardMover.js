// js/core/cardMover.js
// 卡牌移动的底层（阶段3 拆分：从 cardActions.js 外迁）
//   · _moveCard(instanceId, toZone, toIndex, opts)   —— 真正改区域的原子操作 ✓
//   · placeCardInZone(player, card, zone, index)     —— 把卡放进某区域（含控制权复位判定 ✓）
//   · removeCardFromAnywhere / removeCardFromCurrentZone —— 从原区域取出 ✓
//   · resetAttackDefenseIfMinion / handleEquippedOnLeave —— 离场时的清理 ✓
//     （★handleEquippedOnLeave：装备者【离开战场】就处理身上的装备卡：
//       默认送墓保证状态合法 → 再由控制方弹窗选"掉落 / 进墓" ✓ 旧名 moveEquippedCardsToGraveyard 仍兼容 ✓）
//   · updateHandCounts(player)                       —— 手牌计数重算 ✓
//
// 为什么单独一个模块：这些是全项目最底层、最容易被误改的写操作 ✓
//   抽出来之后「谁动状态」一眼可见 ✓（上层 moveCard / 牌库操作 仍留在 cardActions ✓）
//
// 约定：低层只负责【通知对方】（走 StateCommit.notify ✓）；界面重绘由调用方负责 ✓
// 兼容：global.CardActions 仍导出同名函数（内部转发 ✓）

(function(global) {
    const GameState = global.GameState;
    const ZoneManager = global.ZoneManager;

    /** 低层通知（统一走状态提交入口 ✓ —— 界面重绘由调用方负责 ✓） */
    function notifyState() {
        if (global.StateCommit) global.StateCommit.notify();
    }

    /** 手牌计数重算（主手牌 / 费用手牌分开统计 ✓） */
    function updateHandCounts(player) {
        let main = 0, cost = 0;
        player.hand.forEach(instance => {
            if (!instance) return;
            const card = instance.cardData || global.CardLibrary?.getCardById(instance.cardId);
            if (card && card.type === 'cost') cost++;
            else main++;
        });
        player.handMainCount = main;
        player.handCostCount = cost;
    }

    /** 离场：把攻防复位成卡面值 ✓ */
    function resetAttackDefenseIfMinion(card) {
        if (card && card.cardData && card.cardData.type === 'minion') {
            card.currentAttack = card.cardData.attack;
            card.currentDefense = card.cardData.defense;
        }
    }

    /** 装备卡归属对方时，单独通知对方（常规同步只发自己那一侧 ✗） */
    function notifyEquipOwnerToGrave(equipCard) {
        if (equipCard.owner !== 'self' &&
            global.CardHandoverChannel && global.CardHandoverChannel.handover) {
            global.CardHandoverChannel.handover(equipCard, { zone: 'graveyard' });
        }
    }

    /**
     * 身上的装备卡：先按默认去向放进墓场 ✓（放置 + 可选：通知所有者）
     * @param {boolean} [deferNotify] true = 暂不通知对方
     *   ★为什么延后：归属对方的卡"默认进墓"只是让状态立刻合法 ✓
     *     玩家随后若选了"掉落"，对面就会先收到"进墓"、再变成"在对方后场" ✗
     *     （交接通道只有"送给所有者"一种语义，没有"撤回" ✓）
     *   → 归属对方的那次通知，等去向定下来再发 ✓（见 handleEquippedOnLeave）
     */
    function sendEquipToGraveyard(equipCard, state, deferNotify) {
        const ownerState = state.players[equipCard.owner];
        if (!ownerState) return;
        ownerState.graveyard.push(equipCard);
        equipCard.zone = GameState.ZONE.GRAVEYARD;
        equipCard.zoneIndex = ownerState.graveyard.length - 1;
        if (!deferNotify) notifyEquipOwnerToGrave(equipCard);
    }

    /** 统一提示（提示条缺了就静默 ✓） */
    function notify(msg, type) {
        if (global.UI && global.UI.showNotification) global.UI.showNotification(msg, type || 'info');
    }

    /**
     * 装备卡现在归谁控制（●「控制方」＝这张牌现在能操作它的人 ✓）
     *   控制权转移过 → 按转移后的算；取不到控制信息 → 退回 owner ✓
     */
    function controllerOf(card) {
        if (global.ControlManager && global.ControlManager.getController) {
            const who = global.ControlManager.getController(card);
            if (who) return who;
        }
        return (card && card.owner) || 'self';
    }

    /** 该方后场第一个空格的下标（没有空位 → -1 ✓） */
    function firstEmptyBackSlot(playerState) {
        if (!playerState || !Array.isArray(playerState.backField)) return -1;
        for (let i = 0; i < playerState.backField.length; i++) {
            if (!playerState.backField[i]) return i;
        }
        return -1;
    }

    /** 卡名（弹窗 / 提示里显示 ✓） */
    function displayName(card, fallback) {
        return (card && card.cardData && card.cardData.name) || fallback;
    }

    /** 逐张弹窗问控制方：掉落 还是 进墓 ✓（★多张装备卡 → 排队逐个问 ✓） */
    function askEquipDestinations(queue) {
        if (!queue || queue.length === 0) return;
        const ChoiceUI = global.EquipChoiceUI;
        if (!ChoiceUI || !ChoiceUI.ask) {                  // 没有弹窗界面（纯逻辑 / 测试）→ 全部按进墓收尾 ✓
            queue.forEach(item => notifyEquipOwnerToGrave(item.card));
            queue.length = 0;
            return;
        }
        const state = GameState.getState();
        if (!state) return;

        const item = queue.shift();
        const canDrop = firstEmptyBackSlot(state.players['self']) >= 0;   // ★掉落的前提：后场要有空格 ✓
        ChoiceUI.ask(item.card, { hostName: item.hostName, canDrop: canDrop }, function (choice) {
            if (choice === 'drop') { pickDropSlot(item, queue); return; }
            notifyEquipOwnerToGrave(item.card);            // 进墓 = 去向定了 → 补发"归属对方"的交接 ✓
            notify('「' + displayName(item.card, '装备卡') + '」进墓场', 'info');
            askEquipDestinations(queue);                   // 接着问下一张 ✓
        });
    }

    /** 掉落：亮起自己后场的空格 → 点中就把卡从墓场移过去 ✓（取消 / 没空格 = 留在墓场 ✓） */
    function pickDropSlot(item, queue) {
        const TF = global.TargetFlowUI;
        if (!TF || !TF.startSelectionOnSide) { onEquipKeptInGrave(item, queue); return; }
        const started = TF.startSelectionOnSide(['backField'], 'self', function (index) {
            const moved = dropEquipFromGraveyard(item.card, index);
            if (!moved) { onEquipKeptInGrave(item, queue); return; }   // 移不过去（格被占等）→ 留在墓场 ✓
            notify('「' + displayName(item.card, '装备卡') + '」掉落到后场 ' + (index + 1) + ' 号位', 'success');
            if (global.StateCommit && global.StateCommit.refresh) global.StateCommit.refresh();
            askEquipDestinations(queue);                   // 接着问下一张 ✓
        }, function () {                                   // 取消（点别处 / Esc）→ 留在墓场 ✓
            onEquipKeptInGrave(item, queue);
        });
        if (!started) onEquipKeptInGrave(item, queue);      // 没空格 / 起不来 → 留在墓场 ✓
    }

    /** 掉落没成（取消 / 没空格）：就当进墓 ✓（卡已经在墓场，只需补通知 + 提示 ✓） */
    function onEquipKeptInGrave(item, queue) {
        notifyEquipOwnerToGrave(item.card);
        notify('「' + displayName(item.card, '装备卡') + '」留在墓场', 'info');
        askEquipDestinations(queue);
    }

    /**
     * 把已在墓场的装备卡移到【控制方（＝本机）】后场指定格 ✓
     *   走标准移动（取出 ✓ / 落区 ✓ / 通知对面 ✓）—— 生产环境还带对战日志 + 入场时点 ✓
     */
    function dropEquipFromGraveyard(card, index) {
        card.faceDown = false;                              // 掉落＝明置在自己后场（玩家可自行翻盖 ✓）
        // ★noActivate：掉落落到后场【不视为"在后场发动"】→ 不广播 tactic:activate ✓
        //   （否则响应连锁会为一张只是掉下来的卡开窗 ✗）
        const opts = { toPlayer: 'self', noActivate: true };
        if (global.CardActions && global.CardActions.moveCard) {
            return global.CardActions.moveCard(card.instanceId, GameState.ZONE.BACK_FIELD, index, opts);
        }
        return _moveCard(card.instanceId, GameState.ZONE.BACK_FIELD, index, opts);   // 纯逻辑环境（测试）✓
    }

    /* ================= 手动「卸下」：把身上的装备卸到后场空位（菜单入口 ✓） ================= */

    /**
     * ★卸下：把这张卡身上的装备卡卸到【自己后场】的空位 ✓（不经过墓场）
     *   · 直接亮起后场空格 → 点中落位 ✓（多张装备 → 排队逐个选位 ✓）
     *   · 没有装备 / 装备由对方控制 / 后场没空格 → 只提示，不动任何数据 ✓
     *   · 取消选位 = 那张继续留在身上（不会丢卡 ✓）
     * @returns {boolean} true = 已经亮起格子（开始选位 ✓）
     */
    function unequipToBackField(targetCard) {
        if (!targetCard || !Array.isArray(targetCard.equippedCards) || targetCard.equippedCards.length === 0) {
            notify('这张卡身上没有装备', 'warning');
            return false;
        }
        const state = GameState.getState();
        if (!state) return false;

        const mine = targetCard.equippedCards.filter(c => controllerOf(c) === 'self');
        if (mine.length === 0) { notify('身上的装备由对方控制，不能由你卸下', 'warning'); return false; }
        if (firstEmptyBackSlot(state.players['self']) < 0) { notify('后场没有空格，无法卸下', 'warning'); return false; }

        askUnequipSlots(targetCard, mine.slice());
        return true;
    }

    /** 逐张问落点（取消 → 这张留在身上 ✓ 队列继续问下一张 ✓） */
    function askUnequipSlots(hostCard, queue) {
        if (!queue || queue.length === 0) return;
        const TF = global.TargetFlowUI;
        const card = queue.shift();
        if (!TF || !TF.startSelectionOnSide) { notify('无法选位（选格界面缺失）', 'warning'); return; }

        const started = TF.startSelectionOnSide(['backField'], 'self', function (index) {
            unequipOneToSlot(hostCard, card, index);
            askUnequipSlots(hostCard, queue);            // 还有装备 → 接着问 ✓
        }, function () {
            askUnequipSlots(hostCard, queue);            // 取消 → 留在身上 ✓
        });
        if (!started) notify('后场没有空格，卸下停止', 'warning');
    }

    /**
     * 把一张装备卡从"身上"摘下来，落进自己后场指定格 ✓
     *   ★摘除 + 落位必须在同一个同步节拍内做完 ✗
     *     （中间那一步它是"不在任何区域"的，一同步对面就会看到它凭空消失 ✗）
     */
    function unequipOneToSlot(hostCard, equipCard, index) {
        const state = GameState.getState();
        const me = state && state.players['self'];
        if (!me || !Array.isArray(me.backField) || me.backField[index]) return false;   // 格被占了 → 不动 ✓

        if (Array.isArray(hostCard.equippedCards)) {
            const at = hostCard.equippedCards.indexOf(equipCard);
            if (at >= 0) hostCard.equippedCards.splice(at, 1);
        }
        equipCard.faceDown = false;                      // 卸下＝明置（玩家可自行翻盖 ✓）
        // ★走 placeCardInZone 直接落区（不经 afterZoneEnter）→ 天然不广播入区时点 ✓
        //   卸下＝把这件装备挪到后场，不算"在后场发动" ✗（不触发发动的响应系统 ✓）
        placeCardInZone(me, equipCard, GameState.ZONE.BACK_FIELD, index);
        notify('「' + displayName(equipCard, '装备卡') + '」已卸到后场 ' + (index + 1) + ' 号位', 'success');
        notifyState();                                   // ★同步给对面 ✓
        if (global.StateCommit && global.StateCommit.refresh) global.StateCommit.refresh();
        return true;
    }

    /**
     * ★离场装备处理：装备者【离开战场】时，身上的每一张装备卡都要定个去向 ✓
     *   · 不看卡的类型 / 关键字 —— 只要装备在它身上，一律处理 ✓
     *   · 离开战场就触发（进墓 / 回手 / 回库 / 放逐 / 个人区 … 都算 ✓）
     *
     *   ① 先按默认去向【送墓】→ 状态立刻合法 ✓（上层紧接着就要同步给对面 ✗ 不能让卡"悬空"）
     *   ② 控制方是我 → 弹窗问「掉落 / 进墓」：
     *        进墓   → 不用动它（已经在墓场 ✓）+ 补发"归属对方"的交接通知 ✓
     *        掉落   → 亮起后场空格，点中后把卡从墓场移到自己后场 ✓（★要有空格才能掉落 ✓）
     *        取消 / 没空格 → 就留在墓场（＝进墓 ✓ 任何时刻都合法 ✓）
     *   ③ 控制方是对面 → 由对面那侧处理（它那边同样会弹窗 ✓）；本机只送墓 ✓
     *   ④ 没有弹窗界面（纯逻辑 / 测试）→ 全部按进墓收尾 ✓
     */
    function handleEquippedOnLeave(targetCard) {
        if (!targetCard || !targetCard.equippedCards || targetCard.equippedCards.length === 0) return;
        const state = GameState.getState();
        if (!state) return;

        const hostName = displayName(targetCard, '装备者');
        const queue = [];                                   // 要由控制方决定的卡：[{ card, hostName }]
        targetCard.equippedCards.forEach(equipCard => {
            if (!equipCard.cardData && equipCard.cardId) {
                equipCard.cardData = global.CardLibrary ? global.CardLibrary.getCardById(equipCard.cardId) : null;
            }
            if (controllerOf(equipCard) === 'self') {
                sendEquipToGraveyard(equipCard, state, true);            // 默认送墓；通知延后到"去向定了"✓
                queue.push({ card: equipCard, hostName: hostName });
            } else {
                sendEquipToGraveyard(equipCard, state);                  // 对面控制的：照旧立刻通知 ✓
            }
        });

        targetCard.equippedCards = [];
        askEquipDestinations(queue);
    }

    /** 从任意区域取出（公共区优先 ✓）；返回 { card, player } 或 null ✓ */
    function removeCardFromAnywhere(instanceId) {
        const state = GameState.getState();
        if (!state) return null;

        if (state.publicField) {
            const pubIndex = state.publicField.findIndex(c => c && c.instanceId === instanceId);
            if (pubIndex !== -1) {
                const card = state.publicField[pubIndex];
                state.publicField[pubIndex] = null;
                return { card, player: state.players['self'] };
            }
        }

        return removeCardFromCurrentZone(instanceId);
    }

    /** 从"当前所在区域"取出（按个人区 → 手牌 → 前场 → 后场 → 费用区 → 各堆叠 顺序找 ✓） */
    function removeCardFromCurrentZone(instanceId) {
        const state = GameState.getState();
        if (!state) return null;

        for (const playerKey of ['self', 'opponent']) {
            const player = state.players[playerKey];

            const personalIndex = player.personalZone.findIndex(c => c && c.instanceId === instanceId);
            if (personalIndex !== -1) {
                const card = player.personalZone.splice(personalIndex, 1)[0];
                return { card, player };
            }

            const handIndex = player.hand.findIndex(c => c && c.instanceId === instanceId);
            if (handIndex !== -1) {
                const card = player.hand.splice(handIndex, 1)[0];
                updateHandCounts(player);
                return { card, player };
            }

            for (let i = 0; i < player.frontField.length; i++) {
                if (player.frontField[i] && player.frontField[i].instanceId === instanceId) {
                    const card = player.frontField[i];
                    player.frontField[i] = null;
                    return { card, player };
                }
            }

            for (let i = 0; i < player.backField.length; i++) {
                if (player.backField[i] && player.backField[i].instanceId === instanceId) {
                    const card = player.backField[i];
                    player.backField[i] = null;
                    return { card, player };
                }
            }

            for (let i = 0; i < player.costZone.length; i++) {
                if (player.costZone[i] && player.costZone[i].instanceId === instanceId) {
                    const card = player.costZone[i];
                    player.costZone[i] = null;
                    return { card, player };
                }
            }

            const pileZones = ['mainDeck', 'costDeck', 'legendDeck', 'graveyard', 'exile'];
            for (const pileZone of pileZones) {
                const idx = player[pileZone].findIndex(c => c && c.instanceId === instanceId);
                if (idx !== -1) {
                    const card = player[pileZone].splice(idx, 1)[0];
                    return { card, player };
                }
            }
        }
        return null;
    }
    /** 把卡放进指定区域（含控制权复位判定、手牌计数重算、堆叠顶 zoneIndex 维护 ✓） */
    function placeCardInZone(player, card, zone, index) {
        if (zone !== GameState.ZONE.FRONT_FIELD &&
            zone !== GameState.ZONE.BACK_FIELD &&
            zone !== GameState.ZONE.COST_ZONE &&
            zone !== GameState.ZONE.PUBLIC_FIELD) {
            card.active = true;
        }

        // ★控制权复位判定（见 controlManager.resetControlOnLeave）✓
        //   进墓 / 放逐 / 回库 → 复位为所有者；回手 / 费用区 / 个人区 / 公共区 / 战场内移动 → 保留 ✓
        if (global.ControlManager && global.ControlManager.resetControlOnLeave) {
            global.ControlManager.resetControlOnLeave(card, zone);
        }

        card.zone = zone;
        card.zoneIndex = index;

        switch (zone) {
            case GameState.ZONE.HAND:
                if (index === undefined || index < 0 || index >= player.hand.length) {
                    player.hand.push(card);
                    card.zoneIndex = player.hand.length - 1;
                } else {
                    player.hand.splice(index, 0, card);
                }
                updateHandCounts(player);
                break;
            case GameState.ZONE.FRONT_FIELD:
                if (index >= 0 && index < player.frontField.length) {
                    player.frontField[index] = card;
                }
                break;
            case GameState.ZONE.BACK_FIELD:
                if (index >= 0 && index < player.backField.length) {
                    player.backField[index] = card;
                }
                break;
            case GameState.ZONE.COST_ZONE:
                if (index >= 0 && index < player.costZone.length) {
                    player.costZone[index] = card;
                }
                break;
            case GameState.ZONE.MAIN_DECK:
                player.mainDeck.unshift(card);
                card.zoneIndex = 0;
                for (let i = 1; i < player.mainDeck.length; i++) {
                    player.mainDeck[i].zoneIndex = i;
                }
                break;
            case GameState.ZONE.COST_DECK:
                player.costDeck.unshift(card);
                card.zoneIndex = 0;
                for (let i = 1; i < player.costDeck.length; i++) {
                    player.costDeck[i].zoneIndex = i;
                }
                break;
            case GameState.ZONE.LEGEND_DECK:
                player.legendDeck.unshift(card);
                card.zoneIndex = 0;
                for (let i = 1; i < player.legendDeck.length; i++) {
                    player.legendDeck[i].zoneIndex = i;
                }
                break;
            case GameState.ZONE.GRAVEYARD:
                player.graveyard.push(card);
                card.zoneIndex = player.graveyard.length - 1;
                break;
            case GameState.ZONE.EXILE:
                player.exile.push(card);
                card.zoneIndex = player.exile.length - 1;
                break;
        }
    }
    /**
     * 真正的"跨区移动"原子操作：
     *   ① 从原区域取出（公共区优先 ✓）  ② 离场清理（攻防复位 / 装备送墓 ✓）
     *   ③ 落进目标区域（placeCardInZone ✓）  ④ 通知对方（notifyState ✓）
     * 注意：这里【不做】时点广播 / 入场标记 —— 那些由上层 moveCard → afterZoneEnter 负责 ✓
     *      （这样的分层让"移动"与"入场副作用"互不干扰 ✓）
     */
    function _moveCard(instanceId, toZone, toIndex, opts) {
        const state = GameState.getState();
        if (!state) return false;

        let card = null;
        let player = null;
        const publicIndex = state.publicField ? state.publicField.findIndex(c => c && c.instanceId === instanceId) : -1;
        if (publicIndex !== -1) {
            card = state.publicField[publicIndex];
            state.publicField[publicIndex] = null;
            player = state.players['self'];
        } else {
            const result = removeCardFromCurrentZone(instanceId);
            if (!result) return false;
            card = result.card;
            player = result.player;
        }

        const sourceZone = card.zone;

        // 归属覆盖：把卡放进"指定玩家"的区域（不指定时 = 它当前所在方 ✓ 原行为不变）
        if (opts && opts.toPlayer && state.players[opts.toPlayer]) {
            player = state.players[opts.toPlayer];
        }

        // 从战场移到非战场区域时，重置攻防并处理身上的装备卡 ✓
        if ((sourceZone === GameState.ZONE.FRONT_FIELD || sourceZone === GameState.ZONE.BACK_FIELD) &&
            (toZone !== GameState.ZONE.FRONT_FIELD && toZone !== GameState.ZONE.BACK_FIELD)) {
            resetAttackDefenseIfMinion(card);
            handleEquippedOnLeave(card);          // ★只要离开战场就处理（不再限定"进墓场"✓）
        }

        if (toZone === GameState.ZONE.HAND) {
            card.faceDown = false;
        }
        if (toZone === GameState.ZONE.PERSONAL_ZONE) {
            card.faceDown = false;
            player.personalZone.push(card);
            card.zone = GameState.ZONE.PERSONAL_ZONE;
            card.zoneIndex = player.personalZone.length - 1;
            notifyState();
            return true;
        }

        if (toZone === GameState.ZONE.PUBLIC_FIELD) {
            if (toIndex < 0 || toIndex >= state.publicField.length) {
                placeCardInZone(player, card, card.zone, card.zoneIndex);
                notifyState();
                return false;
            }
            if (state.publicField[toIndex] !== null) {
                if (card.zone === GameState.ZONE.PUBLIC_FIELD) {
                    state.publicField[card.zoneIndex] = card;
                } else {
                    placeCardInZone(player, card, card.zone, card.zoneIndex);
                }
                notifyState();
                return false;
            }
            state.publicField[toIndex] = card;
            card.zone = GameState.ZONE.PUBLIC_FIELD;
            card.zoneIndex = toIndex;
            notifyState();
            return true;
        }

        if (ZoneManager.isSlotZone(toZone)) {
            if (!ZoneManager.isSlotAvailable(player.owner, toZone, toIndex)) {
                if (card.zone === GameState.ZONE.PUBLIC_FIELD) {
                    state.publicField[card.zoneIndex] = card;
                } else {
                    placeCardInZone(player, card, card.zone, card.zoneIndex);
                }
                notifyState();
                return false;
            }
        }

        placeCardInZone(player, card, toZone, toIndex);
        notifyState();
        return true;
    }

    global.CardMover = {
        _moveCard,
        placeCardInZone,
        removeCardFromAnywhere,
        removeCardFromCurrentZone,
        resetAttackDefenseIfMinion,
        moveEquippedCardsToGraveyard: handleEquippedOnLeave,   // 兼容旧名（同一件事 ✓）
        handleEquippedOnLeave,
        controllerOf,
        firstEmptyBackSlot,
        dropEquipFromGraveyard,
        unequipToBackField,
        updateHandCounts
    };
})(window);
