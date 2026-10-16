// js/core/stateCommit.js
// 「状态提交」的唯一入口（阶段2 重构）
//
// 本项目的「状态改了」要同时做两件事：
//   ① GameState.notifyListeners() → SyncManager 节流后把公开状态发给对方 ✓
//   ② UI.refreshAll()             → 我方面板立即重绘 ✓
// 原先这两件事散落在 25+ 个地方各调一次 ✗ —— 漏一个就会出现
// 「对方看到了、我方界面没动」的双端不一致 ✗（本项目真的踩过这个 bug ✓）
// 现在统一走这里 ✓
//
// 三个 API：
//   StateCommit.commit(logText?)  ★改完状态的标准收尾：通知 + 重绘（可选写战报 ✓）
//   StateCommit.notify()          只通知对方（低层原子操作用；由调用方负责重绘 ✓）
//   StateCommit.refresh()         只重绘我方（纯渲染 / 数据没变时用 ✓）
//
// 约定（由回归测试 50-state-commit 守着 ✓）：
//   · 除 js/ui.js（refreshAll 的**定义**）外，任何地方都不直接调 UI.refreshAll() ✗
//   · 除 cardActions（低层原子操作）外，任何地方都不直接调 notifyListeners() ✗
(function(global) {
    let refreshing = false;              // 重绘中的重入保护 ✓

    /** ① 只通知对方（SyncManager 会节流发送 ✓） */
    function notify() {
        if (global.GameState && global.GameState.notifyListeners) {
            global.GameState.notifyListeners();
        }
    }

    /** ② 只重绘我方面板 */
    function refresh() {
        if (!global.UI || typeof global.UI.refreshAll !== 'function') return;
        if (refreshing) return;          // 重绘过程中又提交 → 跳过，避免递归重绘 ✓
        refreshing = true;
        try {
            global.UI.refreshAll();
        } catch (e) {
            console.error('[StateCommit] 界面重绘异常（已忽略）', e);
        } finally {
            refreshing = false;
        }
    }

    /**
     * ★状态改完之后的标准收尾（通知 + 重绘）
     * @param {string} [logText] 可选：写进对战日志的一句话
     */
    function commit(logText) {
        if (logText && global.BattleLog && global.BattleLog.log) {
            global.BattleLog.log(logText, 'self');
        }
        notify();
        refresh();
    }

    global.StateCommit = {
        commit,
        notify,
        refresh,
        isRefreshing: () => refreshing
    };
})(window);
