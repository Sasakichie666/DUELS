// js/net/netConfig.js
// 联机配置 + 纯工具（阶段6 拆分，阶段N0 追加：从 js/network.js 外迁 —— 零连接状态 ✓）
//
//   urlParams()                URL 查询参数 ✓
//   signalingOptionsFromUrl()  ?peerhost/peerport/peerpath/peerkey/peersecure → 自定义信令服务器 ✓
//   iceServers()               当前 ICE 服务器（局域网框架下刻意为空 ✓ 只用 host 候选）
//   peerOptions()              建 Peer 时的选项（含自定义信令 ✓）
//   connTimeoutMs() / p2pTimeoutMs()  超时（可用 window.PEER_* 覆盖 ✓ 方便测试 ✓）
//   joinRetryDelayMs(attempt)  客人重试间隔（可用 window.PEER_JOIN_RETRY_SCALE 整体缩放 ✓）
//   sleep(ms)                  等待（统一走 window.setTimeout，node 里也能测 ✓）
//   signalingProbeUrl()        自检用的信令地址（与 PeerJS 客户端完全一致 ✓）
//
// ★为什么敢外迁：这一段【不读也不写任何连接状态】✓（peer / conn / 房间号全不碰 ✓）
//   所以它出问题也只会影响"参数解析"，不会动到对战链路 ✓
// 兼容：global.Network 仍导出 signalingOptionsFromUrl / iceServers（内部转发 ✓）

(function(global) {
    const DEFAULT_TIMEOUT_MS = 15000;   // 信令超时（超过就明确报错，而不是一直转圈）
    const P2P_TIMEOUT_MS = 30000;       // 数据通道兜底超时：正常情况下由 ICE 报 failed 立即失败

    // ★刻意留空：局域网联机只用 host 候选。
    //   若将来真需要公网中继，把 TURN 配置塞进这里即可
    //   （形如 { urls: 'turn:host:3478', username: 'u', credential: 'p' }）
    const ICE_SERVERS = [];

    // 客人重试间隔：局域网联机下失败几乎都是瞬时的（房间号打错 / 房主没建好），
    // 所以只快速试 3 次（≈4.5 秒），不再像以前那样拖 33 秒 ✗→✓
    const JOIN_RETRY_DELAYS_MS = [1500, 1500, 1500];

    const PEERJS_VERSION = '1.5.1';     // 仅用于自检 URL 的 version 参数（与 js/lib 内的版本一致）

    function urlParams() {
        const q = (global.location && global.location.search) || '';
        if (!q) return null;
        try {
            return new URLSearchParams(q);
        } catch (e) {
            return null;
        }
    }

    /**
     * 用 URL 参数指定"自己的信令服务器"（免改代码，方便现场排障）：
     *   ?peerhost=192.168.1.5&peerport=9000&peerpath=/&peerkey=peerjs
     * 自建信令（同一局域网下最稳，甚至可以不需要外网）：任一台机器执行
     *   npx peerjs --port 9000 --path /
     * 然后两边都打开 index.html?peerhost=<那台机器的局域网 / 虚拟网卡 IP>&peerport=9000
     */
    function signalingOptionsFromUrl() {
        const p = urlParams();
        if (!p) return null;
        const host = p.get('peerhost');
        if (!host) return null;
        return {
            host,
            port: Number(p.get('peerport')) || 9000,
            path: p.get('peerpath') || '/',
            key: p.get('peerkey') || 'peerjs',
            secure: p.get('peersecure') === '1'
        };
    }

    /** 当前使用的 ICE 服务器（局域网框架下刻意为空 —— 只用 host 候选，不打洞） */
    function iceServers() {
        return ICE_SERVERS.slice();
    }

    function peerOptions() {
        const opts = {
            config: { iceServers: iceServers() },
            debug: Number(global.PEER_DEBUG) || 1        // 控制台想看细节：设置 window.PEER_DEBUG = 3
        };
        const custom = signalingOptionsFromUrl();
        if (custom) {
            Object.assign(opts, custom);
            console.log('[联机] 使用自定义信令服务器：' + custom.host + ':' + custom.port + custom.path);
        }
        return opts;
    }

    function connTimeoutMs() {
        return Number(global.PEER_CONNECT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
    }

    function p2pTimeoutMs() {
        return Number(global.PEER_P2P_TIMEOUT_MS) || P2P_TIMEOUT_MS;
    }

    function joinRetryDelayMs(attempt) {
        const base = JOIN_RETRY_DELAYS_MS[attempt - 1] || JOIN_RETRY_DELAYS_MS[JOIN_RETRY_DELAYS_MS.length - 1];
        const scale = Number(global.PEER_JOIN_RETRY_SCALE) || 1;   // 测试用：整体缩短等待
        return Math.max(1, Math.round(base * scale));
    }

    function sleep(ms) {
        return new Promise(resolve => global.setTimeout(resolve, ms));
    }

    /**
     * 构造一条【与 PeerJS 客户端完全一致】的信令地址。
     * 旧版自检直接连 wss://0.peerjs.com/（根路径）→ 服务器只认 /peerjs?key=...，
     * 必然握手失败，会误报"被屏蔽 / 无外网"（而真实的 PeerJS 连接其实是好的）。
     */
    function signalingProbeUrl() {
        const custom = signalingOptionsFromUrl();
        const o = custom || { host: '0.peerjs.com', port: 443, path: '/', key: 'peerjs', secure: true };
        let base = (o.secure ? 'wss://' : 'ws://') + o.host + ':' + o.port + (o.path || '/');
        if (base.charAt(base.length - 1) !== '/') base += '/';
        const rnd = () => Math.random().toString(36).slice(2, 10);
        return base + 'peerjs?key=' + encodeURIComponent(o.key)
            + '&id=' + encodeURIComponent('cardgame-diag' + rnd())
            + '&token=' + encodeURIComponent(rnd())
            + '&version=' + PEERJS_VERSION;
    }

    global.NetConfig = {
        DEFAULT_TIMEOUT_MS,
        P2P_TIMEOUT_MS,
        ICE_SERVERS,
        urlParams,
        signalingOptionsFromUrl,
        iceServers,
        peerOptions,
        connTimeoutMs,
        p2pTimeoutMs,
        joinRetryDelayMs,
        sleep,
        signalingProbeUrl,
        JOIN_RETRY_DELAYS_MS,
        PEERJS_VERSION
    };
})(window);
