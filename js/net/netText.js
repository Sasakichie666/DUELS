// js/net/netText.js
// 联机文案（阶段N0 拆分：从 js/network.js 外迁 —— 纯字符串，零连接状态 ✓）
//
//   describePeerError(err)  PeerJS 错误 → 用户能看懂的一句话
//   logConnectGuide(stage)  连接失败时的控制台排查指引（局域网版）
//   failureAdvice()         失败时给用户的"人话"建议
//
// ★为什么敢外迁：这三段【不读也不写任何连接状态】✓（只拼字符串 / 打控制台 ✓）
//   → 出问题也只会影响"提示文字"，绝不会动到对战链路 ✓
//   → 以后改文案 / 加排障提示，都不用再碰 network.js 这个命脉文件 ✓
// 兼容：global.Network 仍导出同名入口（内部转发 ✓）

(function(global) {

    /** 连接失败的排查指引（控制台输出，界面只给一句简短提示）——局域网版 */
    function logConnectGuide(stage) {
        console.error('[Network] 连接失败：' + stage
            + '\n本框架走"局域网直连"，所以只有两种情况：'
            + '\n  ① 信令没接上（连房间号都找不到）→ 检查外网；控制台若出现 "Lost connection to server." '
            + '就是信令掉线（保持页面在前台即可，程序会自动重连一次）'
            + '\n  ② 信令没问题但连不上 → 两台机器不在同一局域网 ✗ 处理：'
            + '\n     · 用 UU加速器的「UU联机」/ 蒲公英 / Tailscale 组网，两台进同一个房间'
            + '\n     · ★两台都要点「🩺 连接自检」面板里的「🔧 允许暴露内网 IP」（否则虚拟网卡地址会被浏览器藏成 .local）'
            + '\n     · 重跑自检确认两边的【内网地址】在同一网段'
            + '\n  ③ 某一台电脑的防火墙 / 安全软件拦了 WebRTC 的 UDP → 把 Wi-Fi 设为"专用网络"、允许浏览器通过防火墙'
            + '\n  ④ 电脑上开着 VPN / 加速器（非组网模式）/ 代理，可能劫持流量 → 只保留组网软件'
            + '\n自查：Network.diagnose() + Network.testIce()，或点界面上的「🩺 连接自检」');
    }

    /** 失败时的"人话"建议（局域网框架只有一条主路线） */
    function failureAdvice() {
        return '本框架只走「局域网直连」，所以要先让两台机器在同一局域网：'
            + '\n  ① 用 UU加速器的「UU联机」/ 蒲公英 / Tailscale 组网（两台进同一房间）'
            + '\n  ② ★两台都点「🩺 连接自检」→「🔧 允许暴露内网 IP」'
            + '\n     （浏览器默认会把虚拟网卡地址藏成 xxxx.local，藏起来就用不了 ✗）'
            + '\n  ③ 重跑自检，确认两边的【内网地址】在同一网段（例如都在 172.16.0.0/24）后重新建房/加入'
            + '\n  ④ 嫌麻烦也可让房主执行 npx peerjs --port 9000 --path /，用 ?peerhost= 走自建信令（更稳）';
    }

    /** PeerJS 错误 → 用户能看懂的一句话 */
    function describePeerError(err) {
        const type = err && err.type;
        switch (type) {
            case 'unavailable-id': return '房间号已被占用，请重新创建房间';
            case 'peer-unavailable': return '找不到房主（对方不在线或房间号不对）';
            case 'network': return '网络异常，与信令服务器的连接中断';
            case 'server-error': return '信令服务器出错，请稍后重试';
            case 'socket-error': return '与信令服务器的连接出错，请检查网络';
            case 'socket-closed': return '与信令服务器的连接被关闭，请检查网络';
            case 'browser-incompatible': return '当前浏览器不支持 WebRTC 联机';
            case 'ssl-unavailable': return '信令服务器 SSL 不可用（可能被网络拦截）';
            case 'invalid-id': return '房间 ID 无效，请重新创建';
            default: return (err && err.message) || '发生未知错误';
        }
    }

    global.NetText = {
        logConnectGuide,
        failureAdvice,
        describePeerError
    };
})(window);
