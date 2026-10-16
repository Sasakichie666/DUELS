// js/net/roomCode.js
// 房间号规则（阶段N0 拆分：从 js/network.js 外迁 —— 纯函数，零连接状态 ✓）
//
//   normalizeRoomInput(raw)  用户输入 → { code, peerId } 或 { error }
//   generateRoomCode()       随机生成 4 位房间号
//
// ★为什么敢外迁：只做字符串处理，不读也不写任何连接状态 ✓
//   → 出问题也只会影响"房间号输入的校验"，不会动到对战链路 ✓
//   → 而且它是全项目最该被单测的一小块（大小写 / 多余空格 / 全角输入都踩过坑 ✓）
// 兼容：global.Network 仍导出 normalizeRoomInput（内部转发 ✓）

(function(global) {

    /**
     * 规范化"加入房间"输入：既接受 4 位密码（8940），也接受房主显示的完整 ID（cardgame-8940 / 8940-k3f2）
     * —— 服务器在 ID 被占用时可能给房主加后缀，那时必须以房主实际显示的字符串为准。
     */
    function normalizeRoomInput(raw) {
        let s = String(raw == null ? '' : raw).trim();
        if (!s) return { error: '请输入房间号' };
        s = s.replace(/\s+/g, '');
        if (/^cardgame-/i.test(s)) s = s.slice('cardgame-'.length);
        if (!/^[0-9]{4}(-[a-z0-9]+)?$/i.test(s)) {
            return { error: '请输入4位数字房间号（若房主显示的是带后缀的ID，请原样完整输入）' };
        }
        return { code: s, peerId: 'cardgame-' + s };
    }

    function generateRoomCode() {
        let code = '';
        for (let i = 0; i < 4; i++) {
            code += Math.floor(Math.random() * 10);
        }
        return code;
    }

    global.NetRoomCode = {
        normalizeRoomInput,
        generateRoomCode
    };
})(window);
