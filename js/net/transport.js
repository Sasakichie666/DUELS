// js/net/transport.js
// 传输层（阶段N3：把"对 Peer / RTCPeerConnection / DataConnection 的操作"全部收口到这里 ✓）
//
//   ★设计铁律（准则规范手册 / 任务进度与待办 第十一节 N3）：【只搬操作，不搬状态】✗
//     · network.js 仍然持有全部连接状态（peer / conn / roomCode / signaling* … ✓）
//     · 本模块【不持有任何连接状态】✓：所有函数都是"给它对象 → 干活 → 返回结果" ✓
//   ★收益：
//     · 以后换联机方式（换信令 / 换成房间服务器 / 加中继）只改这一个文件 ✓
//     · network.js 里"哪些是传输动作"一眼可见，且不再直接认识 PeerJS 的 API ✓
//   ★注入点（阶段N1）：window.__PeerCtor / window.__RtcCtor → 默认就是浏览器全局 ✓
//     测试用它驱动真实状态机（其他/tests/cases/80-net-flow.js ✓）默认路径行为完全一致 ✓
//   ★兼容：global.Network 对外接口完全不变（network.js 里留同名转发 ✓）
(function(global) {
    /* ---------- 注入点：默认 = 浏览器全局 ✓（必须先于能力检测 ✓） ---------- */
    const PeerCtor = () => global.__PeerCtor || global.Peer;
    const RtcCtor = () => global.__RtcCtor || global.RTCPeerConnection;

    /* ---------- 能力检测（network.js 判断"库未加载"用它 ✓） ---------- */
    function hasPeerLib() { return typeof PeerCtor() !== 'undefined'; }
    function rtcAvailable() { return !!RtcCtor(); }

    /* ---------- 构造 ---------- */
    function newPeer(wantId, opts) {
        return wantId ? new (PeerCtor())(wantId, opts) : new (PeerCtor())(opts);
    }
    function newRtc(config) { return new (RtcCtor())(config); }

    /* ---------- Peer：属性读取 / 动作 ---------- */
    function isPeerOpen(p) { return !!(p && p.open); }
    function isPeerDisconnected(p) { return !!(p && p.disconnected); }
    function isPeerDestroyed(p) { return !!(p && p.destroyed); }
    function connectPeer(p, targetId, opts) { return p.connect(targetId, opts); }
    function destroyPeer(p) { try { if (p) p.destroy(); } catch (e) { /* 忽略 */ } }
    function reconnectPeer(p) { try { if (p) p.reconnect(); } catch (e) { /* 已销毁/已在重连，忽略 */ } }

    /* ---------- DataConnection：属性读取 / 动作 ---------- */
    function isConnOpen(conn) { return !!(conn && conn.open); }
    function connPeerConnection(conn) { return conn && conn.peerConnection; }
    function closeConn(conn) { try { if (conn) conn.close(); } catch (e) { /* 忽略 */ } }
    function closeRtc(pc) { try { if (pc) pc.close(); } catch (e) { /* 忽略 */ } }
    /** 发数据：通道没开就返回 false（不抛异常 ✓ 与原来的 sendMessage 行为一致 ✓） */
    function sendOnConn(conn, data) {
        if (!isConnOpen(conn)) return false;
        conn.send(data);
        return true;
    }

    /* ---------- 事件接线：只负责"怎么接"，接到后做什么仍由 network.js 决定 ✓ ---------- */
    function bindPeerOpen(p, fn) { try { p.on('open', fn); } catch (e) { /* 忽略 */ } }
    function unbindPeerEvent(p, ev, fn) { try { p.removeListener(ev, fn); } catch (e) { /* 忽略 */ } }
    function bindPeerEvents(p, h) {
        h = h || {};
        if (h.onOpen) { try { p.on('open', h.onOpen); } catch (e) { /* 忽略 */ } }
        if (h.onConnection) { try { p.on('connection', h.onConnection); } catch (e) { /* 忽略 */ } }
        if (h.onDisconnected) { try { p.on('disconnected', h.onDisconnected); } catch (e) { /* 忽略 */ } }
        if (h.onError) { try { p.on('error', h.onError); } catch (e) { /* 忽略 */ } }
    }
    function bindConnEvents(conn, h) {
        h = h || {};
        if (h.onOpen) { try { conn.on('open', h.onOpen); } catch (e) { /* 忽略 */ } }
        if (h.onData) { try { conn.on('data', h.onData); } catch (e) { /* 忽略 */ } }
        if (h.onClose) { try { conn.on('close', h.onClose); } catch (e) { /* 忽略 */ } }
        if (h.onError) { try { conn.on('error', h.onError); } catch (e) { /* 忽略 */ } }
    }

    /* ---------- ICE：状态读取 ---------- */
    function iceState(pc) {
        return pc ? { ice: pc.iceConnectionState, gathering: pc.iceGatheringState } : null;
    }

    /**
     * 监听底层 RTCPeerConnection 的 ICE 状态：一旦变成 failed 就立刻判定"这条路走不通"。
     * ★为什么需要它：对称型 NAT 打不通时 ICE 一般 5~8 秒内就会自己报 failed；
     *   以前用一个固定超时（10s）去等，既慢又容易误杀"慢但在成功"的连接 ✗
     * （阶段N3 从 network.js 逐字搬来 ✓ 行为不变 ✓）
     */
    function watchIceFailure(pc, onFailed) {
        if (!pc || typeof pc.addEventListener !== 'function') return function () { };
        let fired = false;
        const check = () => {
            if (fired) return;
            const st = pc.iceConnectionState;
            if (st === 'failed') {
                fired = true;
                try { onFailed(st); } catch (e) { /* 忽略 */ }
            }
        };
        try { pc.addEventListener('iceconnectionstatechange', check); } catch (e) { /* 忽略 */ }
        setTimeout(check, 0);      // 挂上时也看一眼当前状态
        return function () {
            try { pc.removeEventListener('iceconnectionstatechange', check); } catch (e) { /* 忽略 */ }
        };
    }

    global.NetTransport = {
        PeerCtor, RtcCtor,
        hasPeerLib, rtcAvailable,
        newPeer, newRtc,
        isPeerOpen, isPeerDisconnected, isPeerDestroyed,
        connectPeer, destroyPeer, reconnectPeer,
        isConnOpen, connPeerConnection, closeConn, closeRtc, sendOnConn,
        bindPeerOpen, unbindPeerEvent, bindPeerEvents, bindConnEvents,
        iceState, watchIceFailure
    };
})(window);
