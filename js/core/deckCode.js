// js/core/deckCode.js
// 卡组码：把一份卡组编成「纯编号文本」/ 从文本还原（游戏王 YGOPro 风：只写卡牌编号，一一对应 ✓）
//
// 格式（详见 准则规范手册 A14）：
//   · 每张卡用它的【身份证号 passcode】（6 位数字，如 000123）表示 ✓
//   · 三个卡组各一行：主卡组(40) ⏎ 费用卡组(20) ⏎ 传说卡组(10)
//     例：000001000007000013… ⏎ 000040000041… ⏎ 000070…
//   · 解析容错：换行 / 空格 / 逗号 / 全角空格 一律忽略；三行并成一行也认（按 40/20/10 切）✓
//
// 纯逻辑模块（不碰 DOM ✓ 可单测 ✓）；编号的登记与查询委托给 CardLibrary ✓

(function(global) {
    const PASSCODE_PAD = 6;
    const LINE_SEP = '\n';

    const DEFAULT_CONFIG = { MAIN_DECK_SIZE: 40, COST_DECK_SIZE: 20, LEGEND_DECK_SIZE: 10, LEGEND_SERIES: '传说' };

    function config() {
        const dm = global.DeckManager;
        return (dm && dm.DECK_CONFIG) ? dm.DECK_CONFIG : DEFAULT_CONFIG;
    }

    function lib() { return global.CardLibrary || null; }

    function cardName(cardId) {
        const L = lib();
        const card = L && L.getCardById ? L.getCardById(cardId) : null;
        return card ? card.name : cardId;
    }

    /** 卡牌身份证号（没有编号 → ''） */
    function codeOf(cardId) {
        const L = lib();
        if (!L || !L.getCardCode) return '';
        const code = L.getCardCode(cardId);
        return code ? String(code).padStart(PASSCODE_PAD, '0') : '';
    }

    /** 一张卡「天然属于哪个卡组」（用于导入时判断有没有放错 ✓） */
    function naturalPile(card) {
        const cfg = config();
        if (!card) return '';
        if (card.type === 'cost') return 'costDeck';
        const series = String(card.series || '');
        const isLegend = series.split(/[,，]/).map(s => s.trim()).indexOf(cfg.LEGEND_SERIES) >= 0;
        return isLegend ? 'legendDeck' : 'mainDeck';
    }

    /** 只留数字（换行/空格/逗号/全角空格 都会被忽略 ✓） */
    function digitsOnly(text) {
        return String(text === undefined || text === null ? '' : text).replace(/[^0-9]/g, '');
    }

    /** 把一串数字按 6 位切成编号数组 */
    function chunkCodes(digits) {
        const out = [];
        for (let i = 0; i + PASSCODE_PAD <= digits.length; i += PASSCODE_PAD) {
            out.push(digits.slice(i, i + PASSCODE_PAD));
        }
        return out;
    }

    /**
     * 导出卡组码
     * @param {{mainDeck:Array,costDeck:Array,legendDeck:Array}} piles
     * @returns {{ok, text, lines, unnumbered:[{cardId,name,pile}], warnings:[], error}}
     */
    function encode(piles) {
        const cfg = config();
        const p = piles || {};
        const groups = [
            { key: 'mainDeck', label: '主卡组', size: cfg.MAIN_DECK_SIZE, list: Array.isArray(p.mainDeck) ? p.mainDeck : [] },
            { key: 'costDeck', label: '费用卡组', size: cfg.COST_DECK_SIZE, list: Array.isArray(p.costDeck) ? p.costDeck : [] },
            { key: 'legendDeck', label: '传说卡组', size: cfg.LEGEND_DECK_SIZE, list: Array.isArray(p.legendDeck) ? p.legendDeck : [] }
        ];

        const lines = [];
        const warnings = [];
        const unnumbered = [];
        groups.forEach(g => {
            const codes = [];
            g.list.forEach(cardId => {
                const code = codeOf(cardId);
                if (!code) {
                    if (!unnumbered.some(u => u.cardId === cardId)) {
                        unnumbered.push({ cardId: cardId, name: cardName(cardId), pile: g.label });
                    }
                    return;
                }
                codes.push(code);
            });
            if (g.list.length !== g.size) {
                warnings.push(g.label + '应为 ' + g.size + ' 张，当前 ' + g.list.length + ' 张');
            }
            lines.push(codes.join(''));
        });

        if (unnumbered.length) {
            return {
                ok: false,
                error: '有 ' + unnumbered.length + ' 张卡还没有身份证号，无法生成卡组码（请用卡牌编辑器补号后重新载入卡包）',
                unnumbered: unnumbered,
                warnings: warnings,
                lines: [],
                text: ''
            };
        }
        return { ok: true, text: lines.join(LINE_SEP), lines: lines, unnumbered: [], warnings: warnings, error: '' };
    }

    /**
     * 解析卡组码
     * @param {string} text
     * @returns {{ok, error, piles, lines, codeCount, missingCodes, skipped, warnings}}
     */
    function decode(text) {
        const cfg = config();
        const sizes = { mainDeck: cfg.MAIN_DECK_SIZE, costDeck: cfg.COST_DECK_SIZE, legendDeck: cfg.LEGEND_DECK_SIZE };
        const piles = { mainDeck: [], costDeck: [], legendDeck: [] };
        const warnings = [];
        const missingCodes = [];
        const skipped = [];
        const blank = { ok: false, error: '', piles: piles, lines: [], codeCount: 0, missingCodes: missingCodes, skipped: skipped, warnings: warnings };

        const lines = [];
        String(text === undefined || text === null ? '' : text).split(/\r?\n/).forEach(line => {
            const d = digitsOnly(line);
            if (d) lines.push(d);
        });
        if (!lines.length) { blank.error = '卡组码是空的'; return blank; }

        const labels = ['主卡组', '费用卡组', '传说卡组'];
        let perPile = null;
        if (lines.length >= 3) {
            // ★三行（或更多）→ 前三条依次 = 主 / 费用 / 传说（多余行忽略 ✓）
            if (lines.length > 3) warnings.push('卡组码多于三行，只取前三行（主 / 费用 / 传说）');
            lines.slice(0, 3).forEach((d, i) => {
                if (d.length % PASSCODE_PAD !== 0) {
                    warnings.push(labels[i] + '那一行多出 ' + (d.length % PASSCODE_PAD) + ' 位字符，已忽略');
                }
            });
            perPile = { mainDeck: chunkCodes(lines[0]), costDeck: chunkCodes(lines[1]), legendDeck: chunkCodes(lines[2]) };
        } else {
            // 一行连写 → 按 40 / 20 / 10 切
            const digits = lines.join('');
            const expect = sizes.mainDeck + sizes.costDeck + sizes.legendDeck;
            if (digits.length % PASSCODE_PAD !== 0) {
                blank.error = '卡组码位数不对：应为 ' + PASSCODE_PAD + ' 的倍数，实际多出 '
                    + (digits.length % PASSCODE_PAD) + ' 位（复制时可能多/少了字符）';
                return blank;
            }
            const codes = chunkCodes(digits);
            if (codes.length !== expect) {
                blank.error = '编号数量不对：需要 ' + expect + ' 个（主 ' + sizes.mainDeck + ' / 费用 ' + sizes.costDeck
                    + ' / 传说 ' + sizes.legendDeck + '），当前 ' + codes.length + ' 个。'
                    + '（三行格式请连换行一起复制 ✓）';
                blank.codeCount = codes.length;
                return blank;
            }
            perPile = {
                mainDeck: codes.slice(0, sizes.mainDeck),
                costDeck: codes.slice(sizes.mainDeck, sizes.mainDeck + sizes.costDeck),
                legendDeck: codes.slice(sizes.mainDeck + sizes.costDeck)
            };
        }

        // 编号 → 卡牌（找不到的逐条报出来 ✓；放错卡组的也报出来并跳过 ✓）
        let codeCount = 0;
        const L = lib();
        Object.keys(perPile).forEach(pileKey => {
            perPile[pileKey].forEach(code => {
                codeCount++;
                const card = (L && L.getCardByCode) ? L.getCardByCode(code) : null;
                if (!card) { missingCodes.push({ code: code, pile: pileKey }); return; }
                const target = naturalPile(card);
                if (target !== pileKey) {
                    skipped.push({ code: code, name: card.name, from: pileKey, shouldBe: target, id: card.id });
                    return;
                }
                piles[pileKey].push(card.id);
            });
        });

        if (piles.mainDeck.length !== sizes.mainDeck) warnings.push('主卡组 ' + piles.mainDeck.length + '/' + sizes.mainDeck);
        if (piles.costDeck.length !== sizes.costDeck) warnings.push('费用卡组 ' + piles.costDeck.length + '/' + sizes.costDeck);
        if (piles.legendDeck.length !== sizes.legendDeck) warnings.push('传说卡组 ' + piles.legendDeck.length + '/' + sizes.legendDeck);

        return {
            ok: true, error: '', piles: piles, lines: lines, codeCount: codeCount,
            missingCodes: missingCodes, skipped: skipped, warnings: warnings
        };
    }

    /** 展示用：按 6 位分组（带空格），方便肉眼核对 ✓ */
    function pretty(text) {
        return String(text === undefined || text === null ? '' : text).split(/\r?\n/).map(line => {
            const d = digitsOnly(line);
            const parts = [];
            for (let i = 0; i < d.length; i += PASSCODE_PAD) parts.push(d.slice(i, i + PASSCODE_PAD));
            return parts.join(' ');
        }).join(LINE_SEP);
    }

    /** 人可读卡表（群里核对/粘贴用 ✓）：3× 猎鹰 #000001 */
    function readable(piles) {
        const p = piles || {};
        const groups = [['主卡组', p.mainDeck || []], ['费用卡组', p.costDeck || []], ['传说卡组', p.legendDeck || []]];
        const out = [];
        groups.forEach(pair => {
            const label = pair[0], list = pair[1];
            if (!list.length) return;
            const counts = {};
            const order = [];
            list.forEach(id => {
                if (!counts[id]) { counts[id] = 0; order.push(id); }
                counts[id]++;
            });
            out.push('【' + label + '】共 ' + list.length + ' 张');
            order.forEach(id => {
                const code = codeOf(id);
                out.push('  ' + counts[id] + '× ' + cardName(id) + (code ? ' #' + code : ''));
            });
        });
        return out.join('\n');
    }

    global.DeckCode = {
        PASSCODE_PAD: PASSCODE_PAD,
        encode: encode,
        decode: decode,
        pretty: pretty,
        readable: readable,
        codeOf: codeOf,
        naturalPile: naturalPile,
        digitsOnly: digitsOnly
    };
})(typeof window !== 'undefined' ? window : this);
