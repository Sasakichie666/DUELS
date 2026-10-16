// js/net/iceInspect.js
// ICE / SDP 解析（阶段6 拆分：从 js/network.js 外迁 —— 纯解析，零状态 ✓）
//
//   addrFamily(addr)       IPv4 / IPv6 ✓
//   sdpCandidates(sdp)     从 SDP 的 a=candidate 行解析候选 ✓
//      为什么这么做：新版 Chromium 的 getStats() 候选对象里**不再给 address**（打印成空 ✗），
//      而 SDP 仍带完整地址 → 用「端口(+类型)」回填，才看得出走的是哪张网卡 / IPv4 还是 IPv6 / 是不是 .local ✓
//   candText(c)            候选的人类可读文本（地址取不到时至少给出 类型/协议:端口 ✓）
//
// ★外迁原因：这三个是纯函数（输入→输出✓）→ 可以直接单测 ✓（以前埋在 1300 行里测不到 ✗）
// 兼容：global.Network 仍导出内部使用（同名转发 ✓）

(function(global) {
    function addrFamily(addr) {
        if (!addr) return '';
        return String(addr).indexOf(':') >= 0 ? 'IPv6' : 'IPv4';
    }

    /** 从 SDP 里解析候选（返回 [{ proto, addr, port, type }] ✓） */
    function sdpCandidates(sdp) {
        const out = [];
        if (!sdp) return out;
        String(sdp).split(/\r?\n/).forEach(line => {
            const m = line.match(/^a=candidate:\S+\s+\d+\s+(udp|tcp)\s+\d+\s+(\S+)\s+(\d+)\s+typ\s+(\w+)/i);
            if (!m) return;
            out.push({
                proto: m[1].toUpperCase(),
                addr: m[2],
                port: Number(m[3]),
                type: m[4].toLowerCase()
            });
        });
        return out;
    }

    /** 候选的人类可读文本（地址取不到时至少给出 类型/协议:端口，不留空白 ✓） */
    function candText(c) {
        if (!c) return '?';
        const proto = c.proto || '?';
        const port = c.port ? (':' + c.port) : '';
        if (!c.addr) return c.type + '/' + proto + port;
        const tag = /\.local$/i.test(c.addr) ? '（mDNS隐藏）' : '';
        return c.type + '/' + proto + ' ' + c.addr + port + tag;
    }

    global.IceInspect = { addrFamily, sdpCandidates, candText };
})(window);
