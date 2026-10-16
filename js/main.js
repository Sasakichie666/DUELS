// js/main.js
// 主控制模块：初始化、事件绑定、网络回调

(function() {
    const UI = window.UI;
    const Network = window.Network;
    const DeckManager = window.DeckManager;
    const GameState = window.GameState;
    const CardActions = window.CardActions;
    const DragController = window.DragController;
    const SyncManager = window.SyncManager;
    const els = UI.els;
    const TurnManager = window.TurnManager;
    const TurnUI = window.TurnUI;
    const DeckBuilderUI = window.DeckBuilderUI; // 引用新模块

    // ============ 游戏启动辅助函数 ============
    function handleGameStart() {
        // 对局一开始就隐藏手牌区：起始手牌只在「起始手牌」界面展示，
        // 双方调度结束后才渲染手牌（避免开局瞬间露出 4 张起手牌）
        if (window.MulliganManager && window.MulliganManager.hideHand) {
            window.MulliganManager.hideHand();
        }

        // ★开局用【出战卡组】（VS 准备界面选定的那一套 ✓）——不是"正在编辑器里改"的那份 ✗
        //   出战卡组由 卡组管理器 / VS 界面 决定，存在 DeckStore（key: cardgame.decks.v1）✓
        const battle = DeckManager.getActiveDeck ? DeckManager.getActiveDeck() : null;
        const mainDeckIds = battle ? battle.mainDeck.slice() : DeckManager.getMainDeck();
        const costDeckIds = battle ? battle.costDeck.slice() : DeckManager.getCostDeck();
        const legendDeckIds = battle ? battle.legendDeck.slice() : DeckManager.getLegendDeck();
        GameState.initGame(mainDeckIds, costDeckIds,legendDeckIds);

        // 起始手牌只抽主牌库 4 张（费用牌不在此阶段抽取：
        // 调度结束后才按先后手抽，先手 4 张 / 后手 5 张，见 MulliganManager）
        CardActions.drawFromDeck('self', 'mainDeck', GameState.INITIAL_HAND_SIZE);
        // 统一走状态提交入口（通知 + 重绘 ✓）
        if (window.StateCommit) window.StateCommit.refresh();

        if (SyncManager) {
            SyncManager.sendFullSync();
        }

        if (TurnManager) {
            TurnManager.init({
                onDone: (firstPlayer) => {
                    console.log('先后手决定完成，先手玩家:', firstPlayer);
                    TurnManager.setFirstPlayer(firstPlayer);
                    UI.updateTurnUI();
                    UI.showNotification(`先手玩家：${firstPlayer === 'self' ? '你' : '对手'}`, 'info');
                    // 先后手确定后进入「起始手牌」调度阶段
                    if (window.MulliganManager) {
                        window.MulliganManager.start({ isFirst: firstPlayer === 'self' });
                    }
                }
            });
            TurnManager.start();
        }
    }

    // ============ ★认输 / 再来一局（见 js/core/matchManager.js）============

    /** ★再来一局：软复位（清浮层与上局残留，★保留房间与连接）→ 无条件重开 ✓
     *  为什么必须"无条件"：第 2 局开局时 GameState 里还有上一局的状态 ✗
     *  老写法 if (!GameState.getState()) 会挡住第二局 → 牌桌不重开 ✗ */
    function restartGame() {
        // ★先把流程复位 ✗ 不复位的话：第 2 局点「认输」会被 matchManager 的幂等判断挡住
        //   （它的 phase 还停在上局的 'waiting' → concede() 直接 return false ✗）
        if (window.MatchManager) window.MatchManager.reset();
        if (UI.resetBattle) UI.resetBattle();
        // ★逻辑时钟归零：不归零的话，对方第 2 局的 rev 从 0 开始 → 会被我方直接丢弃 ✗
        //   （表现为第 2 局的响应连锁 / 展示整个失效 —— 最难查的一类 bug ✓）
        if (window.ChainManager && window.ChainManager.resetClock) window.ChainManager.resetClock();
        if (window.RevealChannel && window.RevealChannel.resetClock) window.RevealChannel.resetClock();
        handleGameStart();                       // ★无条件重开 ✓
    }

    /** 离开房间：唯一正确的做法就是 resetConnection（它就是"拆房间"✓） */
    function leaveRoom(byOpponent) {
        if (byOpponent) UI.showNotification('对方已离开房间', 'warning');
        if (window.MatchUI) window.MatchUI.closeAll();
        if (Network.resetConnection) Network.resetConnection();
        UI.resetUI();                            // 复位房间界面，回大厅 ✓
        if (window.MatchManager) window.MatchManager.reset();
    }

    // 把两个入口交给 MatchManager 回调（它不认识 UI / main.js 的内部函数 ✓ 保持低耦合 ✓）
    if (window.MatchManager && window.MatchManager.setCallbacks) {
        window.MatchManager.setCallbacks({ startLocal: restartGame, backToLobby: leaveRoom });
    }

    // ============ 事件绑定 ============
    function bindEvents() {
        // 导航切换（★阶段L2：点"联机大厅"时——在房间里就回 VS 准备界面 ✓，否则回大厅 ✓）
        els.btnLobby.addEventListener('click', () => UI.goLobby());
        els.btnDeck.addEventListener('click', () => UI.switchView('deck'));   // 卡组管理器（改牌）
        els.btnDecks.addEventListener('click', () => UI.switchView('decks'));  // 我的卡组（卡组库总览）

        // 创建房间（★阶段L1：先弹窗选「赛制 + 局数」→ 再建房 ✓）
        els.btnCreateRoom.addEventListener('click', () => {
            UI.openCreateDialog((cfg) => {
                UI.setMatchConfig(cfg);
                Promise.resolve(Network.createRoom()).then(result => {
                    if (result && result.error) UI.showNotification(result.error, 'error');
                }).catch(e => UI.showNotification(String((e && e.message) || e), 'error'));
            });
        });

        // 加入房间（★阶段L1：先弹窗输入房间号 → 再加入 ✓）
        els.btnJoinRoom.addEventListener('click', () => {
            UI.openJoinDialog((code) => {
                Promise.resolve(Network.joinRoom(code)).then(result => {
                    if (result && result.error) UI.showNotification(result.error, 'error');
                }).catch(e => UI.showNotification(String((e && e.message) || e), 'error'));
            });
        });

        // ★阶段L1：VS 准备场景的两个按钮（复制房间号 / 返回大厅）
        if (els.btnCopyRoom) {
            els.btnCopyRoom.addEventListener('click', async () => {
                const code = Network.getState().roomCode || '';
                if (!code) return;
                try {
                    await navigator.clipboard.writeText(code);
                    UI.showNotification('📋 房间号已复制：' + code, 'success');
                } catch (e) {
                    UI.showNotification('复制失败，请手动记下房间号：' + code, 'warning');
                }
            });
        }
        if (els.btnLeaveRoom) {
            els.btnLeaveRoom.addEventListener('click', () => {
                if (!window.confirm('离开房间并回到大厅？')) return;
                Network.resetConnection();
                UI.resetUI();
                UI.switchView('lobby');
                UI.showNotification('已离开房间', 'info');
            });
        }

        // 准备按钮
        els.btnReady.addEventListener('click', () => {
            const state = Network.getState();
            if (!state.isJoined || !state.isConnected) {
                UI.showNotification('请先建立P2P连接', 'warning');
                return;
            }
            if (!state.myDeckReady) {
                // ★卡组不合法：禁止准备（统一提示语见 DeckManager.READY_HINT ✓）
                UI.showNotification(DeckManager.READY_HINT, 'warning', 5000);
                UI.switchView('deck');
                if (DeckBuilderUI && DeckBuilderUI.enterFromVs) {
                    DeckBuilderUI.enterFromVs(DeckManager.getActiveDeckId());
                }
                return;
            }
            const newReady = !state.isReady;
            Network.setReady(newReady);
            els.myReadyStatus.textContent = newReady ? '✅ 已准备' : '未准备';
            els.myReadyStatus.className = 'p-status ' + (newReady ? 'ready' : '');
            els.btnReady.textContent = newReady ? '取消准备' : '✅ 准备';
            UI.updateStartButton();
        });

        // 开始对战（仅房主可发起；加入方只能等待房主开始）
        els.btnStartGame.addEventListener('click', () => {
            if (!Network.getState().isHost) {
                UI.showNotification('只有房主可以开始对战，请等待房主开始', 'warning');
                return;
            }
            if (Network.startGame()) {
                UI.showNotification('🎯 对战开始！', 'success');
                UI.markGameStarted();   // 开局门禁：从这里开始才允许构建/渲染牌桌
                UI.showBattleView();
                handleGameStart();
            } else {
                UI.showNotification('双方都需要准备', 'warning');
            }
        });

        // 卡组管理按钮的事件已移至 DeckBuilderUI，不再在此绑定
    }

    // ============ 网络回调设置 ============
    function setupNetworkCallbacks() {
        Network.setCallbacks({
            onStatusChange: (info) => {
                switch (info.type) {
                    case 'host_created':
                        els.roomCodeDisplay.textContent = info.roomCode;
                        els.roomCodeContainer.style.display = 'inline-flex';
                        UI.switchView('vs');            // ★阶段L1：建房成功 → 进 VS 准备场景 ✓
                        UI.showNotification('🏠 房间创建成功！房间号: ' + info.roomCode
                            + (String(info.roomCode).length > 4 ? '（较长，请原样复制给朋友）' : ''), 'success');
                        break;
                    case 'joining':
                        // ★阶段L1：加入方一确认房间号就进 VS 准备场景（失败会自动回大厅 ✓）
                        UI.switchView('vs');
                        if (info.attempt) {
                            UI.showNotification('⏳ 正在加入房间…（第 ' + info.attempt + '/' + info.maxAttempts + ' 次尝试）', 'info', 2000);
                        }
                        break;
                    case 'joined':
                        UI.switchView('vs');            // ★阶段L1：已连上房主 → 停在 VS 准备场景 ✓
                        break;
                    case 'signaling_lost':
                        // 信令掉线：程序会自动重连一次（局域网框架，不再有长循环）
                        UI.showNotification('📡 ' + (info.message || '与信令服务器断开，正在重连…'), 'warning', 6000);
                        break;
                    case 'signaling_failed':
                        UI.showNotification('📡 ' + (info.message || '信令连接没能恢复'), 'error', 8000);
                        break;
                    case 'connection_path':
                        // 连接路径（局域网直连 / IPv6 直连）：大厅显示 + 控制台留档 + 连上时轻提示
                        UI.showConnectionPath(info.path);
                        console.log('[联机] 本次连接路径：' + (info.path && info.path.text));
                        if (info.path && info.path.ok && info.path.reason === '已连上') {
                            UI.showNotification('🔗 连接方式：' + info.path.text, 'success', 5000);
                        }
                        break;
                    case 'signaling_ok':
                        UI.showNotification('📡 ' + (info.message || '已重新连上信令服务器'), 'success', 5000);
                        break;
                    case 'error':
                        UI.showNotification(info.message || '发生错误', 'error');
                        break;
                    case 'opponent_ready':
                        els.opponentReadyStatus.textContent = info.ready ? '✅ 已准备' : '未准备';
                        els.opponentReadyStatus.className = 'p-status ' + (info.ready ? 'ready' : '');
                        UI.updateStartButton();
                        break;
                    case 'reset':
                        UI.resetUI();
                        break;
                }
                UI.updateConnectionUI();
            },
            onConnectionChange: (info) => {
                if (info.type === 'connected') {
                    if (Network.getState().isHost) {
                        els.hostOpponentInfo.style.display = 'flex';
                        els.hostOpponentStatus.textContent = '已连接，等待准备...';
                        // ★阶段L1：房主把「赛制 / 局数」同步给对手 ✓
                        //   （新消息类型 match_config ✓ 加法式：不动任何旧字段 ✓）
                        Network.sendMessage(JSON.stringify({ type: 'match_config', config: UI.getMatchConfig() }));
                    } else {
                        els.joinOpponentInfo.style.display = 'flex';
                        els.joinOpponentStatus.textContent = '已连接到房主，等待准备...';
                    }
                    els.battleWaiting.classList.add('active');
                    UI.switchView('vs');            // ★阶段L1：连上了 → 停在 VS 准备场景 ✓
                    UI.showNotification('🔗 P2P连接已建立！', 'success');
                } else if (info.type === 'disconnected') {
                    UI.showNotification('👋 对手离开了房间', 'warning');
                    // 响应连锁窗口依赖联机，断线即关闭（不影响其它功能）
                    if (window.ChainManager) window.ChainManager.forceClose('disconnect');
                } else if (info.type === 'opponent_joined') {
                    UI.showNotification('👤 对手已加入房间！', 'success');
                }
                UI.updateConnectionUI();
            },
            onMessage: (data) => {
                try {
                    const msg = JSON.parse(data);
                    if (msg.type === 'ready_status') {
                        Network.setOpponentReady(msg.ready);
                    } else if (msg.type === 'match_config') {
                        // ★阶段L1：房主选的「赛制 / 局数」→ 显示在 VS 准备场景 ✓
                        UI.setMatchConfig(msg.config);
                    } else if (msg.type === 'game_start') {
                        UI.showNotification('🎯 对战开始！', 'success');
                        UI.markGameStarted();   // 收到房主开局消息后才构建/渲染牌桌
                        UI.showBattleView();
                        if (window.MatchManager && window.MatchManager.isRematch()) {
                            // ★再来一局：上一局的状态还在 → 必须走"无条件重开"这条路 ✓
                            window.MatchManager.onRemoteStart();
                            restartGame();
                        } else if (!GameState.getState()) {
                            handleGameStart();
                        }
                    } else if (msg.type === 'battle_log') {
                        // 对手的操作日志：以「对手」身份显示在同一条日志里
                        if (window.BattleLog && window.BattleLog.logRemote) {
                            window.BattleLog.logRemote(msg.text);
                        }
                    } else if (msg.type === 'mulligan_done') {
                        // 对手已完成起始手牌调度（确认保留）
                        if (window.MulliganManager) {
                            window.MulliganManager.handleOpponentDone();
                        }
                    } else if (msg.type === 'card_handover'
                               || msg.type === 'card_give'          // 旧消息名（兼容只刷新了一端的情况）
                               || msg.type === 'card_owner_move') {
                        // 对方把一张牌交给我（或放进我的区域：战场/手牌/墓场/放逐/牌库）✓
                        if (window.CardHandoverChannel) {
                            window.CardHandoverChannel.handle(msg);
                        }
                    } else if (msg.type === 'sync_state') {
                        if (SyncManager) {
                            SyncManager.handleSyncMessage(msg);
                        }
                    } else if (msg.type === 'turn_roll') {
                        if (TurnManager) {
                            TurnManager.handleOpponentRoll(msg.roll);
                        }
                    } else if (msg.type === 'turn_choice') {
                        if (TurnManager) {
                            TurnManager.handleOpponentChoice(msg.choice);
                        }
                    } else if (msg.type === 'turn_end') {
                        if (TurnManager) {
                            TurnManager.handleEndTurn();
                            UI.updateTurnUI();
                        }
                    } else if (msg.type === 'concede') {
                        // ★认输（加法式新消息 ✓）：对方认输 → 我方弹「胜利」✓
                        if (window.MatchManager) window.MatchManager.handleConcede();
                    } else if (msg.type === 'rematch_vote') {
                        // ★再来一局投票：对方选「继续」或「离开房间」✓
                        if (window.MatchManager) window.MatchManager.handleVote(msg.want);
                    } else if (msg.type === 'chain_sync') {
                        // 响应连锁：整窗快照（按 rev 取新），由 ChainManager 自行镜像成我方视角
                        if (window.ChainManager) window.ChainManager.handleRemote(msg);
                    } else if (msg.type === 'reveal_sync') {
                        // 展示 / 翻阅 / 检索告知：单会话快照（见 js/core/revealChannel.js）
                        if (window.RevealChannel) window.RevealChannel.handle(msg);
                    }
                } catch (e) {
                    console.error('解析P2P消息失败', e);
                }
            }
        });
    }

    // ============ 初始化 ============
    function init() {
        // ===== 首屏渲染策略 =====
        // 卡组数据与「是否可开局」的状态在启动时初始化（很轻：只读 localStorage + 内存数据），
        // 但界面渲染（卡牌库 + 卡组槽位，几百个 DOM 节点）推迟到第一次打开卡组管理器时再做，
        // 这样联机大厅阶段不会去做其它视图的渲染工作。
        if (DeckBuilderUI) {
            if (typeof DeckBuilderUI.loadSavedDeck === 'function') DeckBuilderUI.loadSavedDeck();
            if (typeof DeckBuilderUI.updateDeckStatus === 'function') DeckBuilderUI.updateDeckStatus();
            UI.registerViewHook('deck', () => DeckBuilderUI.init());
        } else {
            // 降级：只渲染卡牌库
            UI.registerViewHook('deck', () => UI.renderCardLibrary());
        }

        UI.updateConnectionUI();
        setupNetworkCallbacks();
        bindEvents();

        // ★「我的卡组」视图（卡组库总览：多套卡组 + 新建 / 改名 / 出战 / 编辑入口 ✓）
        if (window.MyDecksUI) UI.registerViewHook('decks', () => window.MyDecksUI.init());

        // ★卡组码弹窗（生成 / 复制 / 粘贴导入）
        if (window.DeckCodeUI && window.DeckCodeUI.init) {
            window.DeckCodeUI.init();
        }
        // ★VS 准备界面的「出战卡组」条（下拉切换 / 编辑 / 卡组码 / 合法性提示）
        if (window.VsDeckUI && window.VsDeckUI.init) {
            window.VsDeckUI.init();
        }

        // 连接自检按钮（联机排查用；模块缺失时静默跳过）
        if (window.DiagUI && window.DiagUI.init) {
            window.DiagUI.init();
        }

        // 费用牌 / 费用区 批量面板（点「费用牌区域」或「费用区」打开）
        if (window.CostPanelUI && window.CostPanelUI.init) {
            window.CostPanelUI.init();
        }

        if (SyncManager) {
            SyncManager.init();
        }

        

        if (window.CardDetailUI) {
            window.CardDetailUI.initHoverEvents();
        }
        if (DragController) {
            DragController.init();
        }
        if (window.OpponentPileViewer) {
            window.OpponentPileViewer.init();
        }

        // ===== 响应连锁系统（新增，完全独立；任一模块缺失都只是静默降级） =====
        if (window.ChainManager && window.ChainManager.init) {
            window.ChainManager.init();          // 订阅时点总线
        }
        if (window.ChainPanelUI && window.ChainPanelUI.init) {
            window.ChainPanelUI.init();          // 订阅窗口状态 → 渲染右侧面板
        }

        // ===== 展示 / 翻阅 / 检索（新增，同样完全独立 ✓）=====
        if (window.RevealPanelUI && window.RevealPanelUI.init) {
            window.RevealPanelUI.init();         // 对方窗口 / 手牌挑选 / 数量弹窗
        }
        if (window.DeckTakeUI && window.DeckTakeUI.init) {
            window.DeckTakeUI.init();            // 检索·翻阅 共用的取牌界面（我方面板由其驱动 ✓）
        }

        // 侧栏工具按钮属于战斗视图内部：等战斗视图真正构建后再注入
        UI.onBattleViewReady(() => {
            if (window.SidePanel && UI.els.sidePanelContainer) {
                SidePanel.init(UI.els.sidePanelContainer);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();