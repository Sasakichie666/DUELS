// js/core/matchManager.js
// 对局流程：认输 / 胜负 / 再来一局（重赛投票）—— ★纯逻辑，零 DOM ✓（规矩3）
//   界面在 js/ui/matchUI.js ✓   消息分发在 js/main.js ✓
//
// 流程（与需求一一对应 ✓）：
//   ① 点「认输」→ 确认弹窗（确认 / 取消）
//   ② 确认 → 本机 broadcasts {type:'concede'}；★我方视角判【失败】✓
//      对方收到 → 判【胜利】✓（各自视角相反，正是需求要的 ✓）
//   ③ 结算窗：点「确认」或 5 秒后 → 切到第二个窗（继续对战 / 离开房间）✓
//   ④ 双方都选「继续对战」→ 房主发 game_start（复用 ✓ 不新建房间 ✓）→ 双方重开
//      任一方选「离开房间」→ 双方回大厅（resetConnection = 拆房间 ✓）
//
// ★消息全部是【加法式】新增：concede / rematch_vote ✓ 旧字段一个都没动 ✓（规矩 A8）
// ★重赛必须复位的逻辑时钟见 ChainManager.resetClock / RevealChannel.resetClock ✓（坑1）

(function (global) {
    let phase = 'none';     // none | result | choose | waiting
    let outcome = null;     // 'win' | 'lose'（★永远写【我方视角】✓）
    let myVote = null;      // null | true（继续）| false（离开）
    let oppVote = null;
    let cb = {};            // 由 main.js 注入：{ startLocal, backToLobby }

    function setCallbacks(o) { cb = o || {}; }

    function reset() {
        phase = 'none';
        outcome = null;
        myVote = null;
        oppVote = null;
    }

    function send(obj) {
        if (!global.Network || !global.Network.sendMessage) return false;
        // ★★必须 JSON.stringify ✗（本项目最容易踩的一个坑 ✓）
        //   Network.sendMessage 是直通 DataChannel 的（见 js/net/transport.js 的 sendOnConn：
        //   它只做 conn.send(data)）→ 传【对象】会被浏览器直接拒收 ⇒ 消息根本发不出去 ✗
        //   症状：我方界面正常，对面什么都不弹 ✗（排查时先看这里 ✓）
        //   本项目所有模块都是这么发的：turnManager / revealChannel / chainManager / battleLog ✓
        return global.Network.sendMessage(JSON.stringify(obj));
    }

    /** ① 我方确认认输 → 广播，并把本地判成【失败】✓
     *  ★幂等：已经结算过就不再处理（防止还没点选窗时又点一次认输 ✗） */
    function concede() {
        if (phase !== 'none') return false;
        send({ type: 'concede' });
        settle('lose');
        return true;
    }

    /** ② 收到对方认输 → 我方【胜利】✓ */
    function handleConcede() {
        if (phase !== 'none') return false;      // 双方几乎同时认输 → 以先到的为准 ✓
        settle('win');
        return true;
    }

    /** ③ 结算：弹胜负窗 →（点确认 / 5 秒）→ 进入选择窗 ✓ */
    function settle(out) {
        outcome = out;
        phase = 'result';
        const MUI = global.MatchUI;
        if (MUI && MUI.showResult) MUI.showResult(out, enterChoose);
        else enterChoose();
    }

    function enterChoose() {
        if (phase !== 'result') return;
        phase = 'choose';
        const MUI = global.MatchUI;
        if (MUI && MUI.showChoose) MUI.showChoose({ onVote: vote });
        else tryAutoStart();
    }

    /** ④ 我方选择：true = 继续对战 / false = 离开房间 ✓ */
    function vote(want) {
        if (phase === 'none' || myVote !== null) return false;
        myVote = !!want;
        send({ type: 'rematch_vote', want: !!want });

        if (!want) {                                  // 离开房间：本地拆房间回大厅 ✓
            if (cb.backToLobby) cb.backToLobby(false);
            return true;
        }
        if (oppVote === true) tryAutoStart();         // 对方早就同意了 → 直接开 ✓
        else {
            phase = 'waiting';
            const MUI = global.MatchUI;
            if (MUI && MUI.showWaiting) MUI.showWaiting();
        }
        return true;
    }

    /** 收到对方的投票 */
    function handleVote(want) {
        oppVote = !!want;
        if (!want) {                                  // 对方要走 → 本地也回大厅 ✓
            if (cb.backToLobby) cb.backToLobby(true);
            return true;
        }
        if (myVote === true) tryAutoStart();
        else {
            const MUI = global.MatchUI;
            if (MUI && MUI.notifyOpponentWants) MUI.notifyOpponentWants();
        }
        return true;
    }

    /** ⑤ 双方都同意 → ★房主发起重开（Network.startGame 可以反复调用 ✓ 不新建房间 ✓） */
    function tryAutoStart() {
        if (myVote !== true || oppVote !== true) return false;
        const Net = global.Network;
        const st = Net && Net.getState ? Net.getState() : null;
        if (!st) return false;
        phase = 'waiting';
        if (st.isHost) {
            // 房主：先把 game_start 发给对方 ✓，再本地重开 ✓（两条路径都走同一个入口 ✓）
            if (Net.startGame && Net.startGame() === false) return false;
            if (cb.startLocal) cb.startLocal();
        }
        return true;
    }

    /** 收到 game_start（重赛）→ 关掉所有弹窗，把控制权交回 main.js 去真正重开 ✓ */
    function onRemoteStart() {
        const MUI = global.MatchUI;
        if (MUI && MUI.closeAll) MUI.closeAll();
        reset();
    }

    global.MatchManager = {
        setCallbacks, reset,
        concede, handleConcede,
        vote, handleVote,
        tryAutoStart, onRemoteStart,
        getPhase: function () { return phase; },
        getOutcome: function () { return outcome; },
        isRematch: function () { return phase !== 'none'; },
        myWant: function () { return myVote; },
        oppWant: function () { return oppVote; }
    };
})(window);
