/* ガン・スプラッシュ 取扱説明書 — viewer + page art.
 * - 総ルビ: text nodes of .page are converted to <ruby> from RUBY (longest match) and explicit ｜漢字《よみ》 marks.
 * - Screen photos: GS.boot({headless:true}) then GS.still(screen, state). 2-colour pages get duo5().
 *   manual.html is <html data-live>: GS.boot waits until its module installs the game.mjs rules (GS.installApp),
 *   so the stills and maps use the real stage data. Before that, and for good if game.mjs cannot be loaded, the
 *   photos show placeholders and the maps stay blank; the other pictures need no stage data.
 * - Viewer: spread / single page, scan-like / crisp, ruby on/off, text mode, zoom (double tap/click, pinch on the page),
 *   swipe, keys, hash #pN, embed=1 (posts {gs:'manual-close'} / {gs:'manual-page', page}) or standalone.
 * manual.html loads core.js, the sprites, data.js and the title / play / result screens before this file, so GS and
 * every screen exist here.
 */
(function () {
  'use strict';
  const GS = window.GS;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const body = document.body;
  // embedded in the game's iframe: ?embed=1, or <html data-embed> (play.html's blob: manual, see shell.js)
  const EMBED = (/[?&]embed=1/.test(location.search) || document.documentElement.hasAttribute('data-embed')) && window.parent && window.parent !== window;
  const DEBUG = /[?&]debug=1/.test(location.search);
  const QS = new URLSearchParams(location.search);
  const R = Math.round;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // =====================================================================
  // pages and views (表1, 表2, p1..p20, 表3, 表4 = 24 pages, then the e-only appendix)
  // =====================================================================
  // page geometry in page px (manual.css: one page is 340x496, 85x124 mm at 4 px per mm)
  const PAGE_W = 340, PAGE_H = 496, SPREAD_W = 2 * PAGE_W;
  const PAGES = ['cover1', 'cover2'];
  for (let i = 1; i <= 20; i++) PAGES.push('p' + i);
  PAGES.push('cover3', 'cover4');
  const ALL = PAGES.concat(['extra']);
  const SPREADS = [['cover1'], ['cover2', 'p1']];
  for (let n = 2; n <= 18; n += 2) SPREADS.push(['p' + n, 'p' + (n + 1)]);
  SPREADS.push(['p20', 'cover3'], ['cover4'], ['extra']);
  const SINGLES = ALL.map(p => [p]);
  const label = id => (id === 'extra' ? '付録' : id.indexOf('cover') === 0 ? '表' + id.slice(5) : 'p.' + id.slice(1));
  function viewLabel(v) {
    if (v.length === 1) return label(v[0]);
    const a = v[0], b = v[1];
    if (a[0] === 'p' && b[0] === 'p') return 'p.' + a.slice(1) + '–' + b.slice(1);
    return label(a) + '–' + label(b);
  }
  const pageEl = id => document.getElementById(id);
  const titleOf = id => { const e = pageEl(id); return (e && e.dataset.title) || ''; };
  // the title a view goes by: its first page's, except the 表2+p1 spread, which goes by p1 (もくじ)
  const viewTitle = v => titleOf(v.length === 2 && v[0] === 'cover2' ? v[1] : v[0]);

  // =====================================================================
  // viewer prefs (per viewer, localStorage; failures are ignored)
  // =====================================================================
  const PREF_KEY = 'gs-manual-viewer-v1';
  const prefs = GS.loadPrefs(PREF_KEY, { view: 'auto', look: 'scan', ruby: true, text: false },
    { view: ['auto', 'spread', 'single'], look: ['scan', 'crisp'] });
  function savePrefs() { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) { /* storage unavailable */ } }

  // =====================================================================
  // 総ルビ
  // key = kanji (+ optional kana for context), value = reading of the kanji part only
  // =====================================================================
  const RUBY = {
    // 1 kanji defaults
    '悪': 'わる', '暗': 'くら', '印': 'しるし', '引': 'ひ', '右': 'みぎ', '雨': 'あめ', '影': 'かげ', '円': 'えん', '押': 'お',
    '横': 'よこ', '穏': 'おだ', '音': 'おと', '下': 'した', '何': 'なに', '回': 'かい', '開': 'ひら', '外': 'そと', '街': 'まち',
    '角': 'かど', '楽': 'たの', '顔': 'かお', '旗': 'はた', '気': 'き', '起': 'お', '休': 'やす', '急': 'いそ', '強': 'つよ',
    '曲': 'ま', '禁': 'きん', '近': 'ちか', '金': 'きん', '係': 'かかり', '形': 'かたち', '撃': 'う', '決': 'き', '見': 'み',
    '減': 'へ', '光': 'ひかり', '向': 'む', '好': 'す', '広': 'ひろ', '攻': 'せ', '合': 'あ', '込': 'こ', '今': 'いま',
    '左': 'ひだり', '残': 'のこ', '使': 'つか', '四': 'よ', '始': 'はじ', '指': 'ゆび', '止': 'と', '持': 'も', '時': 'とき',
    '次': 'つぎ', '斜': 'なな', '者': 'もの', '弱': 'よわ', '取': 'と', '守': 'まも', '受': 'う', '終': 'お', '重': 'かさ',
    '出': 'で', '順': 'じゅん', '所': 'ところ', '書': 'か', '勝': 'か', '小': 'ちい', '少': 'すこ', '消': 'き', '上': 'うえ',
    '乗': 'の', '色': 'いろ', '新': 'あたら', '進': 'すす', '人': 'にん', '水': 'みず', '数': 'かず', '制': 'せい', '正': 'ただ',
    '生': 'い', '声': 'こえ', '誠': 'まこと', '赤': 'あか', '跡': 'あと', '切': 'き', '先': 'さき', '戦': 'たたか', '扇': 'おうぎ',
    '前': 'まえ', '窓': 'まど', '送': 'おく', '側': 'がわ', '足': 'た', '速': 'はや', '続': 'つづ', '多': 'おお', '対': 'たい',
    '待': 'ま', '大': 'おお', '短': 'みじか', '弾': 'たま', '知': 'し', '着': 'つ', '中': 'なか', '丁': 'ちょう', '朝': 'あさ',
    '長': 'なが', '直': 'なお', '通': 'とお', '敵': 'てき', '点': 'てん', '渡': 'わた', '度': 'ど', '当': 'あ', '動': 'うご',
    '同': 'おな', '道': 'みち', '読': 'よ', '届': 'とど', '難': 'むずか', '入': 'はい', '倍': 'ばい', '発': 'はつ', '飛': 'と',
    '表': 'ひょう', '秒': 'びょう', '付': 'つ', '負': 'ま', '物': 'もの', '分': 'ふん', '壁': 'かべ', '別': 'べつ', '変': 'か',
    '歩': 'ある', '方': 'かた', '北': 'きた', '満': 'まん', '名': 'めい', '明': 'あか', '目': 'め', '遊': 'あそ', '落': 'お',
    '粒': 'つぶ', '両': 'りょう', '量': 'りょう', '連': 'つら', '買': 'か', '部': 'ぶ', '全': 'ぜん', '最': 'さい', '以': 'い',
    '一': 'いち', '期': 'き', '地': 'ち', '自': 'じ', '本': 'ほん', '奥': 'おく', '逃': 'に',
    // kanji + kana context
    '分け': 'わ', '分か': 'わ', '分だ': 'ぶん', '出し': 'だ', '足あ': 'あし', '入れか': 'い', '光っ': 'ひか', '少な': 'すく', '数え': 'かぞ',
    '上げ': 'あ', '方で': 'かた', '名と': 'めい', '中くら': 'ちゅう', '時間切れ': 'じかんぎ', '名前': 'なまえ',
    // compounds
    '案内役': 'あんないやく', '以下': 'いか', '位置': 'いち', '威力': 'いりょく', '意味': 'いみ', '移動': 'いどう',
    '一時停止': 'いちじていし', '一度': 'いちど', '右半分': 'みぎはんぶん', '運転': 'うんてん', '英語': 'えいご',
    '延長': 'えんちょう', '演出': 'えんしゅつ', '応援': 'おうえん', '横持': 'よこも', '音量': 'おんりょう', '何人': 'なんにん',
    '画面': 'がめん', '回数': 'かいすう', '回転': 'かいてん', '回復': 'かいふく', '開始': 'かいし', '開始時': 'かいしじ',
    '確認': 'かくにん', '確保': 'かくほ', '角度': 'かくど', '間隔': 'かんかく', '関係': 'かんけい', '基本': 'きほん',
    '気分': 'きぶん', '距離': 'きょり', '共通': 'きょうつう', '禁無断転載': 'きんむだんてんさい', '金色': 'きんいろ',
    '区画': 'くかく', '具合': 'ぐあい', '決着': 'けっちゃく', '決定': 'けってい', '元気者': 'げんきもの', '交互': 'こうご',
    '交代': 'こうたい', '攻撃': 'こうげき', '攻防': 'こうぼう', '合計': 'ごうけい', '合図': 'あいず', '左右': 'さゆう',
    '左半分': 'ひだりはんぶん', '再使用': 'さいしよう', '最後': 'さいご', '最初': 'さいしょ', '最大': 'さいだい',
    '作戦': 'さくせん', '使用': 'しよう', '使用上': 'しようじょう', '試合': 'しあい', '試合中': 'しあいちゅう',
    '時間': 'じかん', '時間中': 'じかんちゅう', '時点': 'じてん', '自己': 'じこ', '自動': 'じどう', '自分': 'じぶん',
    '射線': 'しゃせん', '射程': 'しゃてい', '取扱説明書': 'とりあつかいせつめいしょ', '重要': 'じゅうよう', '出撃': 'しゅつげき',
    '瞬間': 'しゅんかん', '準備': 'じゅんび', '初級': 'しょきゅう', '勝負': 'しょうぶ', '照準': 'しょうじゅん',
    '紹介': 'しょうかい', '上下': 'じょうげ', '上級': 'じょうきゅう', '上手': 'じょうず', '場外': 'じょうがい', '場所': 'ばしょ',
    '状態': 'じょうたい', '人数': 'にんずう', '陣地': 'じんち', '水源': 'すいげん', '水場': 'みずば',
    '水滴': 'すいてき', '水鉄砲': 'みずでっぽう', '水鉄砲大図鑑': 'みずでっぽうだいずかん', '水辺': 'みずべ', '水面': 'すいめん',
    '水路': 'すいろ', '水色': 'みずいろ', '数字': 'すうじ', '性能': 'せいのう', '成績表': 'せいせきひょう', '正確': 'せいかく',
    '設定': 'せってい', '説明': 'せつめい', '説明書': 'せつめいしょ', '戦況': 'せんきょう', '戦線': 'せんせん', '選択': 'せんたく',
    '前進': 'ぜんしん', '全員': 'ぜんいん', '全体': 'ぜんたい', '全部': 'ぜんぶ', '全滅': 'ぜんめつ', '操作': 'そうさ',
    '操作位置': 'そうさいち', '操作中': 'そうさちゅう', '早見表': 'はやみひょう', '早送': 'はやおく', '足元': 'あしもと',
    '体力': 'たいりょく', '隊員': 'たいいん', '大事': 'だいじ', '大小': 'だいしょう', '大切': 'たいせつ',
    '大半': 'たいはん', '弾以外': 'たまいがい', '地形': 'ちけい', '地図': 'ちず', '中央': 'ちゅうおう',
    '中級': 'ちゅうきゅう', '中止': 'ちゅうし', '中庭': 'なかにわ', '中立': 'ちゅうりつ', '注意': 'ちゅうい', '賃貸': 'ちんたい',
    '点滅': 'てんめつ', '電子版': 'でんしばん', '同時': 'どうじ', '内容': 'ないよう', '日付': 'ひづけ', '入門': 'にゅうもん',
    '背中': 'せなか', '配置': 'はいち', '倍率': 'ばいりつ', '発射': 'はっしゃ', '半分': 'はんぶん', '反応': 'はんのう',
    '反動': 'はんどう', '反動中': 'はんどうちゅう', '番号': 'ばんごう', '表紙': 'ひょうし', '裏表紙': 'うらびょうし', '表示': 'ひょうじ',
    '秒間': 'びょうかん', '秒数': 'びょうすう', '武器': 'ぶき', '部屋': 'へや', '復活': 'ふっかつ', '複製': 'ふくせい',
    '片方': 'かたほう', '保管': 'ほかん', '補給': 'ほきゅう', '方角': 'ほうがく', '方向': 'ほうこう',
    '味方': 'みかた', '無断': 'むだん', '命中': 'めいちゅう', '目印': 'めじるし', '矢印': 'やじるし', '予告線': 'よこくせん',
    '利用': 'りよう', '理由': 'りゆう', '両手': 'りょうて', '両方': 'りょうほう', '冷静': 'れいせい', '連射': 'れんしゃ',
    '大図鑑': 'だいずかん', '気持': 'きも', '試合開始': 'しあいかいし', '試合開始時': 'しあいかいしじ', '三本': 'さんぼん',
    '路地': 'ろじ',
  };
  const RUBY_BY_FIRST = new Map();
  Object.keys(RUBY).forEach(k => { const a = RUBY_BY_FIRST.get(k[0]) || []; a.push(k); RUBY_BY_FIRST.set(k[0], a); });
  RUBY_BY_FIRST.forEach(a => a.sort((x, y) => y.length - x.length));
  const isKanji = ch => /[一-鿿々]/.test(ch);
  const missingRuby = new Map();   // kanji with no RUBY key -> count (reported with ?debug=1)
  const usedRuby = new Set();      // RUBY keys that matched somewhere (the others are reported with ?debug=1)
  function rubyNodes(s) {
    const out = []; let plain = '', i = 0, changed = false;
    const flush = () => { if (plain) { out.push(document.createTextNode(plain)); plain = ''; } };
    // spans, not <ruby>/<rt>: the reading is placed by manual.css (absolutely, in the half-leading), and Safari does
    // not let a <rt> be positioned (it drops it below its base instead). The reading is hidden from screen readers,
    // which read the base text.
    const ruby = (base, rt) => {
      flush(); changed = true;
      const r = document.createElement('span'); r.className = 'ruby'; r.append(base);
      const t = document.createElement('span'); t.className = 'rt'; t.setAttribute('aria-hidden', 'true'); t.textContent = rt;
      r.append(t); out.push(r);
    };
    while (i < s.length) {
      const ch = s[i];
      if (ch === '｜') {
        const a = s.indexOf('《', i), b = s.indexOf('》', a);
        if (a > i && b > a) { ruby(s.slice(i + 1, a), s.slice(a + 1, b)); i = b + 1; continue; }
      }
      if (isKanji(ch)) {
        const keys = RUBY_BY_FIRST.get(ch) || [];
        let hit = null;
        for (const k of keys) if (s.startsWith(k, i)) { hit = k; break; }
        if (hit) {
          usedRuby.add(hit);
          let n = 0; while (n < hit.length && isKanji(hit[n])) n++;
          ruby(hit.slice(0, n), RUBY[hit]); plain += hit.slice(n); i += hit.length; continue;
        }
        missingRuby.set(ch, (missingRuby.get(ch) || 0) + 1);
      }
      plain += ch; i++;
    }
    flush();
    return changed ? out : null;
  }
  const NO_RUBY = '.ruby, ruby, rt, rp, script, style, textarea, input, canvas, svg, .rom, .noruby';
  function applyRuby(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (/[一-鿿々｜]/.test(n.nodeValue) && !(n.parentElement && n.parentElement.closest(NO_RUBY)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    const list = []; while (walker.nextNode()) list.push(walker.currentNode);
    list.forEach(n => { const nodes = rubyNodes(n.nodeValue); if (nodes) n.replaceWith(...nodes); });
    // ROM quotes keep their kanji bare (ROM text), but drop any explicit marks
    $$('.rom', root).forEach(e => { if (/[｜《》]/.test(e.textContent)) e.textContent = e.textContent.replace(/｜([^《]+)《[^》]*》/g, '$1'); });
  }

  // =====================================================================
  // MEMO (p20): typed into, kept in this browser's localStorage
  // =====================================================================
  const MEMO_KEY = 'gs-manual-memo-v1';
  const MEMO_COLS = ['日付', 'ステージ', '勝ち負け', '確保タイム', 'ひとこと'];
  function buildMemo() {
    const tb = $('#memo-body'); if (!tb) return;
    let data = [];
    try { data = JSON.parse(localStorage.getItem(MEMO_KEY) || '[]') || []; } catch (e) { data = []; }
    let timer = 0;
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const rows = $$('tr', tb).map(tr => $$('input', tr).map(i => i.value));
        try { localStorage.setItem(MEMO_KEY, JSON.stringify(rows)); } catch (e) { /* storage unavailable: keep showing */ }
      }, 250);
    };
    for (let r = 0; r < 8; r++) {
      const tr = document.createElement('tr');
      MEMO_COLS.forEach((c, k) => {
        const td = document.createElement('td'), inp = document.createElement('input');
        inp.type = 'text'; inp.maxLength = k === 4 ? 40 : 12; inp.autocomplete = 'off';
        inp.setAttribute('aria-label', (r + 1) + '行目の' + c);
        inp.value = (data[r] && typeof data[r][k] === 'string') ? data[r][k] : '';
        inp.addEventListener('input', save);
        td.append(inp); tr.append(td);
      });
      tb.append(tr);
    }
  }

  // =====================================================================
  // page art (all pixel data through GS; nothing loaded from files)
  // =====================================================================
  // the game.mjs stage data is in (data.js GS.setGameData, run inside GS.installApp). Until then GS.STAGES must not
  // be read: the photos show placeholders and the maps stay blank instead of logging errors. It never comes in when
  // game.mjs cannot be loaded (manual.html then installs the app without rules).
  const stageData = () => GS.isReady() && GS.hasGameData();
  function ctxOf(cv) { const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; return c; }

  // ---------------------------------------------------------------------
  // 2-colour printing (表2, p1, p6, p7, p14, p15, p20, 表3): 5 inks = 墨 / 特色 / 平網(水色30%) / 墨10% / 紙.
  // Photos get a 4x4 Bayer halftone between neighbouring inks (like a printed screen); sprites and drawings
  // are posterised flat, with the manual's own tints.
  // ---------------------------------------------------------------------
  const DUO_INKS = ['#203848', '#3090A8', '#B8D0C8', '#D8D8C0', '#F0E8D0'].map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
  // source luminance -> position on the ink scale 0..4 (piecewise linear). ROM window grounds and frames
  // (luminance <= 0.2) print as solid 墨 so the white ROM text keeps full contrast; water and ground (~0.4) are
  // mostly 特色; light UI tones fall on the flat tints.
  const DUO_CURVE = [[0.20, 0], [0.42, 1], [0.72, 2], [0.84, 3], [0.93, 4]];
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  function duoPos(l) {
    const C = DUO_CURVE;
    if (l <= C[0][0]) return 0;
    for (let i = 1; i < C.length; i++) if (l <= C[i][0]) return C[i - 1][1] + (l - C[i - 1][0]) / (C[i][0] - C[i - 1][0]) * (C[i][1] - C[i - 1][1]);
    return 4;
  }
  function duo5(cv, dither) {
    const c = cv.getContext('2d', { willReadFrequently: true }), W = cv.width, H = cv.height;
    const img = c.getImageData(0, 0, W, H), d = img.data;
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i += 4) {
        if (!d[i + 3]) continue;
        const p = duoPos((0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255);
        let k;
        if (dither) { const lo = Math.min(3, Math.floor(p)); k = (p - lo) * 16 > BAYER4[((y & 3) << 2) | (x & 3)] + 0.5 ? lo + 1 : lo; }
        else k = R(p);
        const t = DUO_INKS[k]; d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2];
      }
    }
    c.putImageData(img, 0, 0);
  }

  // ---------------------------------------------------------------------
  // screen photos and the logo are rendered at the displayed device resolution, not as 256x224 bitmaps scaled by
  // CSS: a nearest-neighbour shrink drops whole 1px rows and columns (HUD text, window frames).
  // ---------------------------------------------------------------------
  const HI_MAX = 4;   // backing px per page px, at most (memory)
  function devRatio() {
    const k = prefs.text ? 1 : scale * zoom;
    return clamp(k * (window.devicePixelRatio || 1), 0.5, HI_MAX);
  }
  // content box of a canvas in page px, also while its page is display:none (computed width/height)
  function cssBox(cv, dw, dh) {
    if (cv.clientWidth && cv.clientHeight) return [cv.clientWidth, cv.clientHeight];
    const cs = getComputedStyle(cv), bb = cs.boxSizing === 'border-box', n = v => parseFloat(v) || 0;
    const w = parseFloat(cs.width), h = parseFloat(cs.height);
    const ex = bb ? n(cs.borderLeftWidth) + n(cs.borderRightWidth) + n(cs.paddingLeft) + n(cs.paddingRight) : 0;
    const ey = bb ? n(cs.borderTopWidth) + n(cs.borderBottomWidth) + n(cs.paddingTop) + n(cs.paddingBottom) : 0;
    return [w > 0 ? w - ex : dw, h > 0 ? h - ey : dh];
  }
  // photo: smooth high-quality resample of the still (the 4:3 stretch happens here); nearest-neighbour only when a
  // ROM pixel gets 2 device px or more. 2-colour pages: the 5-ink halftone after the resample.
  function renderShot(cv) {
    const src = cv._src; if (!src) return;
    const [w, h] = cssBox(cv, 256, 224), r = devRatio();
    const W = Math.max(1, R(w * r)), H = Math.max(1, R(h * r));
    const nn = Math.min(W / src.width, H / src.height) >= 2;
    const key = W + 'x' + H + (nn ? 'n' : 's');
    if (cv._key === key) return;
    cv._key = key; cv._r = W / w;
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = !nn; c.imageSmoothingQuality = 'high';
    c.drawImage(src, 0, 0, W, H);
    if (isC2(cv)) duo5(cv, true);
    cv.classList.toggle('nn', nn);
  }
  // logo: title.js draws it on a 4px grid with 1px edges (GS.screens.title.logoCanvas). Read the grid cells back
  // from that bitmap and redraw them as vectors at S device px per ROM px, so the 1px ink edge and white inner line
  // stay even at any book scale (表1 is the ROM logo x1.5).
  const LOGO_BANDS = ['waterHi', 'waterShallow', 'water', 'waterDk'];
  let logoData = null;
  function logoCells() {
    if (logoData) return logoData;
    const t = GS.screens.title, lg = t.logoCanvas();
    const B = t.LOGO_BOX, w = lg.cv.width, h = lg.cv.height;
    const tmp = GS.makeCanvas(w, h), tc = tmp.getContext('2d', { willReadFrequently: true });
    tc.drawImage(lg.cv, 0, 0);
    const d = tc.getImageData(0, 0, w, h).data;
    const at = (x, y) => { if (x >= w || y >= h) return -1; const i = (y * w + x) * 4; return d[i + 3] ? (d[i] << 16) | (d[i + 1] << 8) | d[i + 2] : -1; };
    const key = tok => { const c = GS.rgb(GS.PAL[tok]); return (c[0] << 16) | (c[1] << 8) | c[2]; };
    const bigFace = new Set(['white'].concat(LOGO_BANDS).map(key)), cream = key('cream');
    const big = new Set(), small = new Set();
    let top = Infinity;
    // sample 2 px of each cell (rows 2 and 3: row 2 of the top big row can be under the ガン・ outline)
    for (let cy = 0; B.oy + cy * 4 + 3 < h; cy++) {
      for (let cx = 0; B.ox + cx * 4 + 3 < w; cx++) {
        const x = B.ox + cx * 4 + 2, y = B.oy + cy * 4, a = at(x, y + 2), b = at(x, y + 3);
        if (a === cream || b === cream) small.add(cx + ',' + cy);
        else if (bigFace.has(a) || bigFace.has(b)) { big.add(cx + ',' + cy); top = Math.min(top, B.oy + cy * 4); }
      }
    }
    if (!big.size) return null;
    logoData = { big, small, ox: B.ox, oy: B.oy, w, h, top };
    return logoData;
  }
  function renderLogo(cv) {
    const L = logoCells(); if (!L) return false;
    const kCss = cv.classList.contains('cv-logo') ? 1.5 : 1;          // page px per ROM px (表1 x1.5, 表4 x1)
    cv.style.width = L.w * kCss + 'px'; cv.style.height = L.h * kCss + 'px';
    const shown = cv.clientWidth > 0 ? cv.clientWidth / L.w : kCss;   // text mode shows both at 300px
    const S = clamp(Math.ceil(shown * devRatio() - 0.1), 1, 12);  // round up: the browser then only shrinks
    cv.classList.add('hi');
    if (cv._key === 'L' + S) return true;
    cv._key = 'L' + S; cv._r = S / shown;
    cv.width = L.w * S; cv.height = L.h * S;
    const c = cv.getContext('2d'), P = GS.PAL, C = 4 * S, e = Math.max(1, R(S * 1.3));
    c.clearRect(0, 0, cv.width, cv.height);
    const cellsOf = set => Array.from(set, k => { const [cx, cy] = k.split(',').map(Number); return { cx, cy, x: (L.ox + cx * 4) * S, y: (L.oy + cy * 4) * S }; });
    // same layering as title.js: ink edge around the extruded shape, the extrusion, the face (+ inner bands)
    function layer(set, depth, side, face, bands) {
      const cs = cellsOf(set), D = depth * S;
      c.fillStyle = P.ink; cs.forEach(q => { for (let t = 0; t <= D; t++) c.fillRect(q.x - e + t, q.y - e + t, C + 2 * e, C + 2 * e); });
      c.fillStyle = P[side]; cs.forEach(q => { for (let t = 1; t <= D; t++) c.fillRect(q.x + t, q.y + t, C, C); });
      c.fillStyle = P[face]; cs.forEach(q => c.fillRect(q.x, q.y, C, C));
      if (!bands) return;
      const has = (x, y) => set.has(x + ',' + y), wI = S, top = L.top * S, bh = 10 * S;
      cs.forEach(q => {
        const x0 = q.x + (has(q.cx - 1, q.cy) ? 0 : wI), x1 = q.x + C - (has(q.cx + 1, q.cy) ? 0 : wI);
        const y1 = q.y + C - (has(q.cx, q.cy + 1) ? 0 : wI);
        let y = q.y + (has(q.cx, q.cy - 1) ? 0 : wI);
        while (y < y1) {
          const b = clamp(Math.floor((y - top) / bh), 0, bands.length - 1);
          const yb = b < bands.length - 1 ? Math.min(y1, top + (b + 1) * bh) : y1;
          c.fillStyle = P[bands[b]]; c.fillRect(x0, y, x1 - x0, yb - y); y = yb;
        }
      });
    }
    layer(L.big, 3, 'night', 'white', LOGO_BANDS);   // スプラッシュ
    layer(L.small, 2, 'sun', 'cream', null);         // ガン・ (over スプラッシュ)
    return true;
  }
  let hiTimer = 0;
  function scheduleHiRes() { clearTimeout(hiTimer); hiTimer = setTimeout(refreshHiRes, 120); }
  function refreshHiRes() {
    (prefs.text ? $$('#book .page') : $$('#book .page.on')).forEach(p => {
      $$('canvas[data-still]', p).forEach(cv => { if (cv._src) renderShot(cv); });
      $$('canvas[data-art="logo"]', p).forEach(cv => { if (cv.classList.contains('hi')) renderLogo(cv); });
    });
  }
  function bust(c, name, pal, x, y, flipX) { GS.spr(c, name, x, y, { pal, flipX: !!flipX }); }
  // the orange team side by side as on p3 (カイ, レン, ナギ, mirrored), 96x32 at 0,0: the 表1 cover and its reflection
  function orangeTrio(c) {
    ['bust_win2', 'bust_ready', 'bust_win1'].forEach((name, i) => bust(c, name, 'orange', i * 32, 0, true));
  }
  function townline(c, w, baseY, seed, cols) {
    let s = seed >>> 0; const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    let x = 0;
    while (x < w) {
      const bw = 8 + Math.floor(rnd() * 14), bh = 8 + Math.floor(rnd() * 22), col = cols[Math.floor(rnd() * cols.length)];
      GS.rect(c, x, baseY - bh, bw, bh, col);
      if (rnd() < 0.3) GS.rect(c, x + 2, baseY - bh - 3, 2, 3, col);
      for (let yy = baseY - bh + 3; yy < baseY - 2; yy += 4) for (let xx = x + 2; xx < x + bw - 1; xx += 3) if (rnd() < 0.22) GS.px(c, xx, yy, rnd() < 0.5 ? 'gold' : 'sun');
      x += bw;
    }
  }
  function ground(c, w, h, cola, colb) {
    GS.rect(c, 0, 0, w, h, cola);
    for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < w; x += 8) GS.px(c, x, y, colb);
  }
  const STAGE_IDS = ['tutorial', 'lanes', 'alleys', 'maze'];
  function initialLevels(st) { return st.pools.map(p => GS.poolLevel(p.initial, p.capacity)); }
  // a stage's ground and its puddles at their initial levels, at scale sc with the top-left at 0,0 (returns the
  // stage). The callers add the zone, the pumps and the spawn points, each in its own order.
  function drawStageMap(c, id, sc) {
    const st = GS.stage(id);
    c.drawImage(GS.mapCanvas(id, sc), 0, 0);
    GS.drawPuddles(c, id, initialLevels(st), 0, 0, sc, 0);
    return st;
  }

  const ART = {
    logo(cv) { cv._key = null; return renderLogo(cv); },
    'cover-town'(cv) { const c = ctxOf(cv); c.clearRect(0, 0, cv.width, cv.height); townline(c, 170, 40, 7, ['night', 'band', 'sky1']); return true; },
    'cover-orange'(cv) { orangeTrio(ctxOf(cv)); return true; },
    'cover-reflect'(cv) {
      const c = ctxOf(cv); c.clearRect(0, 0, cv.width, cv.height);
      // sun glitter
      for (let i = 0; i < 9; i++) { const w = 18 - i * 2; if (w > 0) GS.rect(c, 139 - (w >> 1), 2 + i * 4, w, 1, i % 2 ? 'sun' : 'sky5'); }
      // orange trio upside down, every other row (water)
      const tmp = GS.makeCanvas(96, 32), tc = ctxOf(tmp);
      orangeTrio(tc);
      c.globalAlpha = 0.4;
      for (let y = 0; y < 32; y++) { if (y % 3 === 2) continue; const dx = (y >> 2) % 2; c.drawImage(tmp, 0, 31 - y, 96, 1, 37 + dx, y, 96, 1); }
      c.globalAlpha = 1;
      for (let y = 6; y < 40; y += 7) GS.rect(c, 10 + ((y * 37) % 120), y, 18, 1, 'waterHi');
      return true;
    },
    'cover-blue'(cv) {
      const c = ctxOf(cv); c.clearRect(0, 0, cv.width, cv.height);
      bust(c, 'bust_ready', 'blue', -4, 2, false);
      bust(c, 'bust_ready', 'blue', 58, 2, true);
      bust(c, 'bust_win1', 'blue', 27, 0, false);
      return true;
    },
    'p2-scene'(cv) {
      const c = ctxOf(cv), W = 170;
      GS.gradRows(c, 0, 63, ['sky1', 'sky2', 'sky3', 'sky4', 'sky5'], { x: 0, w: W, band: 8 });
      GS.circle(c, 126, 50, 9, 'sun', { fill: true });
      townline(c, W, 60, 21, ['night', 'band']);
      c.save(); c.translate(0, 60); ground(c, W, 40, 'g1a', 'g1b'); c.restore();
      const puddle = (cx, cy, rx, ry) => {
        GS.ellipse(c, cx, cy, rx + 1, ry + 1, 'sand', { fill: true });
        GS.ellipse(c, cx, cy, rx, ry, 'waterShallow', { fill: true });
        GS.ellipse(c, cx, cy, rx - 2, ry - 1, 'sky4', { fill: true });
        GS.rect(c, cx - rx + 4, cy - 1, (rx - 4) * 2, 1, 'sky5');
        GS.rect(c, cx - (rx >> 1), cy + 1, rx, 1, 'sun');
        GS.px(c, cx - rx + 2, cy - ry + 1, 'foam');
      };
      puddle(40, 84, 26, 7); puddle(124, 90, 30, 6); puddle(150, 70, 12, 3);
      GS.actor(c, 30, 76, { team: 'blue', aimDir16: 0, tank: 4, self: true });
      GS.actor(c, 52, 81, { team: 'blue', aimDir16: 1, tank: 6 });
      GS.actor(c, 136, 77, { team: 'orange', faceLeft: true, aimDir16: 8, tank: 5 });
      GS.spr(c, 'splash_2', 86, 68, { pal: 'water' });
      return true;
    },
    'mark-corners'(cv) { return mark(cv, { team: 'blue', corners: true, tank: 4 }); },
    'mark-gold'(cv) { return mark(cv, { team: 'blue', gold: true, tank: 4 }); },
    'mark-recoil'(cv) { return mark(cv, { team: 'blue', recoil: 3, tank: 3, gunDim: true }); },
    'mark-tank'(cv) { return mark(cv, { team: 'blue', tank: 6, aimDir16: 8, faceLeft: true }); },
    'mark-hp'(cv) { return mark(cv, { team: 'orange', hpBar: 0.5, tank: 4, faceLeft: true, aimDir16: 8 }); },
    'pump-1'(cv) { return pumpScene(cv, 1); },
    'pump-2'(cv) { return pumpScene(cv, 2); },
    'pump-3'(cv) { return pumpScene(cv, 3); },
    // p10 / p11: the whole tutorial stage (320x192); each page shows one half
    'map-tutorial'(cv) {
      if (!stageData()) return false;
      const sc = 1 / 3.75, c = ctxOf(cv), st = drawStageMap(c, 'tutorial', sc);
      GS.drawZone(c, 0, 0, sc, 'neutral', 0);
      GS.drawPumps(c, 'tutorial', st.taps.map(() => ({ level: 4 })), 0, 0, sc, 0);
      const S = GS.SPAWN;
      S.blue.ys.forEach((y, i) => GS.actor(c, S.blue.x * sc, y * sc, { team: 'blue', aimDir16: 0, tank: 4, self: i === 0 }));
      S.orange.ys.forEach(y => GS.actor(c, S.orange.x * sc, y * sc, { team: 'orange', faceLeft: true, aimDir16: 8, tank: 4 }));
      return true;
    },
    'weak-icon'(cv) {
      const c = ctxOf(cv); GS.rect(c, 0, 0, 16, 16, 'band');
      GS.spr(c, 'bullet_weak', 2, 6, { pal: 'blue' }); GS.spr(c, 'bullet_weak', 7, 6, { pal: 'blue' }); GS.spr(c, 'bullet_weak', 12, 6, { pal: 'blue' });
      return true;
    },
  };
  // p16: one small map per stage (100x60), the spawn points as 2x2 team-colour dots
  STAGE_IDS.forEach((id, i) => {
    ART['preview-' + (i + 1)] = function (cv) {
      if (!stageData()) return false;
      const sc = 1 / 12, c = ctxOf(cv);
      drawStageMap(c, id, sc);
      GS.drawPumps(c, id, null, 0, 0, sc, 0);
      GS.drawZone(c, 0, 0, sc, 'neutral', 0);
      const S = GS.SPAWN;
      S.blue.ys.forEach(y => GS.rect(c, R(S.blue.x * sc) - 1, R(y * sc) - 1, 2, 2, 'blue'));
      S.orange.ys.forEach(y => GS.rect(c, R(S.orange.x * sc) - 1, R(y * sc) - 1, 2, 2, 'orange'));
      return true;
    };
  });
  function mark(cv, a) {
    const c = ctxOf(cv); ground(c, 28, 28, 'g1a', 'g1b');
    GS.actor(c, 14, 13, Object.assign({ aimDir16: 0 }, a));
    return true;
  }
  // p13 pump steps, drawn with the game's own pump layout (GS.PUMP_LAYOUT): 1 stop on the footprints,
  // 2 walk to the operating spot by itself, 3 work the lever facing left (water flies from the spout to the pool)
  function pumpScene(cv, k) {
    const c = ctxOf(cv), Lo = GS.PUMP_LAYOUT;
    ground(c, 44, 36, 'g1a', 'g1b');
    const x = 16, y = 21, op = k === 3;          // tap point
    const pool = { x: 5, y: 32 };                 // the pool this pump feeds: lower left, by the spout
    GS.ellipse(c, pool.x, pool.y, 10, 6, 'sand', { fill: true });
    GS.ellipse(c, pool.x, pool.y, 9, 5, 'waterShallow', { fill: true });
    GS.ellipse(c, pool.x, pool.y, 7, 3, 'water', { fill: true });
    GS.spr(c, 'foot', x + Lo.foot[0], y + Lo.foot[1], { pal: 'footOn' });
    GS.spr(c, 'pump', x + Lo.body[0], y + Lo.body[1], { pal: 'pump' });
    GS.spr(c, 'lever_' + (op ? 1 : 0), x + Lo.lever[0], y + Lo.lever[1], { pal: 'pump' });
    const gx = x + Lo.gauge[0], gy = y + Lo.gauge[1];
    GS.rect(c, gx - 1, gy - 1, 4, 10, 'ink'); GS.rect(c, gx, gy, 2, 8, 'dim'); GS.rect(c, gx, gy + 2, 2, 6, 'water');
    const sx = x + Lo.stand[0], sy = y + Lo.stand[1];   // operating spot
    const you = { team: 'blue', faceLeft: true, aimDir16: 8, tank: 3, self: true };
    if (k === 1) GS.actor(c, sx, sy + 10, you);
    else if (k === 2) { GS.actor(c, sx, sy + 5, you); GS.px(c, sx - 2, sy + 15, 'white'); GS.px(c, sx + 1, sy + 14, 'white'); }
    else {
      GS.actor(c, sx, sy, { team: 'blue', pose: 'pump', faceLeft: true, tank: 3, corners: true, frame: 1 });
      const fx = x + Lo.dropFrom[0], fy = y + Lo.dropFrom[1];
      [0.3, 0.6, 0.9].forEach(s => GS.spr(c, 'drop', R(fx + (pool.x - fx) * s) - 4, R(fy + (pool.y - fy) * s) - 4, { pal: 'water' }));
    }
    return true;
  }

  // generic sprite canvases: data-spr, data-pal, data-flip="x", data-self. A data-spr name that no sprite has is
  // left undrawn (false).
  function drawSpr(cv) {
    const name = cv.dataset.spr;
    if (!GS.hasSprite(name)) return false;
    const sz = GS.sprSize(name);
    cv.width = sz.w; cv.height = sz.h;
    const c = ctxOf(cv); c.clearRect(0, 0, cv.width, cv.height);
    GS.spr(c, name, 0, 0, { pal: cv.dataset.pal || 'blue', flipX: cv.dataset.flip === 'x' });
    if (cv.dataset.self) GS.spr(c, 'marker_self', cv.width - 8, 0, { pal: 'self' });
    return true;
  }

  // neutral placeholder when a photo cannot be drawn (no stage data, or GS.still failed)
  function placeholder(cv, text) {
    cv.width = 256; cv.height = 224;
    const c = cv.getContext('2d');
    c.fillStyle = '#D8D8C0'; c.fillRect(0, 0, 256, 224);
    c.strokeStyle = 'rgba(32,56,72,.25)'; c.lineWidth = 1;
    for (let i = -224; i < 256; i += 16) { c.beginPath(); c.moveTo(i, 224); c.lineTo(i + 224, 0); c.stroke(); }
    c.fillStyle = '#203848'; c.font = '700 18px "BIZ UDPGothic", sans-serif'; c.textAlign = 'center';
    c.fillText('SCREEN', 128, 104); c.font = '14px monospace'; c.fillText(text, 128, 128);
  }

  const isC2 = cv => !!cv.closest('.page.c2');
  function drawAll(final) {
    const missing = [];
    // 2-colour pages are read back by duo5(): create their contexts as read-friendly first
    $$('.page.c2 canvas').forEach(cv => { if (!cv._wrf) { try { cv.getContext('2d', { willReadFrequently: true }); } catch (e) { /* ignore */ } cv._wrf = 1; } });
    const stills = {};   // one GS.still per screen/state (play/normal is used 3 times)
    const haveData = stageData();
    $$('canvas[data-still]').forEach(cv => {
      const [id, st] = cv.dataset.still.split('/');
      const def = GS.screens[id];
      let src = null;
      if (haveData && def && (!st || def.states.indexOf(st) >= 0)) {
        const k = id + '/' + st;
        try { src = stills[k] || (stills[k] = GS.still(id, st)); } catch (e) { console.error('[manual] still ' + k, e); }
      }
      if (src) {
        cv._src = src; cv._key = null;
        renderShot(cv);
      } else {
        cv._src = null; cv._key = null; cv.classList.remove('nn');
        placeholder(cv, cv.dataset.still);
        if (final) missing.push(cv.dataset.still);
      }
    });
    $$('canvas[data-art]').forEach(cv => {
      const f = ART[cv.dataset.art];
      let done = false;
      try { done = f ? f(cv) !== false : false; } catch (e) { console.error('[manual] art ' + cv.dataset.art, e); }
      if (done && isC2(cv)) duo5(cv, false);
      // 表1's logo (the last child of its box), when it cannot be drawn (see logoCells), gives way to its name in text
      if (done && cv.dataset.art === 'logo' && cv.hidden) {
        cv.hidden = false; const fb = cv.nextElementSibling; if (fb && fb.classList.contains('fallback')) fb.remove();
      }
      if (!done && cv.dataset.art === 'logo' && !cv.nextElementSibling) {
        const fb = document.createElement('p'); fb.className = 'fallback'; fb.textContent = 'ガン・スプラッシュ'; cv.after(fb); cv.hidden = true;
      }
    });
    $$('canvas[data-spr]').forEach(cv => { if (drawSpr(cv) && isC2(cv)) duo5(cv, false); });
    if (final && missing.length) console.info('[manual] pictures not drawn, placeholder shown:', Array.from(new Set(missing)).join(', '));
    thumbsDirty = true;
  }

  // =====================================================================
  // leaders (name labels and the numbered callouts of p8)
  // =====================================================================
  const SVGNS = 'http://www.w3.org/2000/svg';
  function pagePos(el, page) {
    let x = 0, y = 0, e = el;
    while (e && e !== page) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }
  function svgFor(page) {
    let s = $('svg.leaders', page);
    if (!s) { s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('class', 'leaders'); s.setAttribute('viewBox', '0 0 ' + PAGE_W + ' ' + PAGE_H); s.setAttribute('aria-hidden', 'true'); page.append(s); }
    s.textContent = ''; return s;
  }
  function lead(svg, x0, y0, x1, y1) {
    const ln = document.createElementNS(SVGNS, 'line');
    ln.setAttribute('x1', x0); ln.setAttribute('y1', y0); ln.setAttribute('x2', x1); ln.setAttribute('y2', y1); svg.append(ln);
    const h = document.createElementNS(SVGNS, 'circle'); h.setAttribute('class', 'halo'); h.setAttribute('cx', x1); h.setAttribute('cy', y1); h.setAttribute('r', 2.6); svg.append(h);
    const d = document.createElementNS(SVGNS, 'circle'); d.setAttribute('cx', x1); d.setAttribute('cy', y1); d.setAttribute('r', 1.5); svg.append(d);
  }
  function edgePoint(b, tx, ty) {
    const cx = Math.max(b.x, Math.min(tx, b.x + b.w)), cy = Math.max(b.y, Math.min(ty, b.y + b.h));
    return [cx, cy];
  }
  // the numbered pins ①..⑫ of p8, in the order of GS.screens.play.anchors.normal. key: the anchor the leader points
  // to (ROM px; at: a point given here instead). side: where the pin sits: 'top' 8 px above the photo, 'bottom' 9 px
  // below it (moved dx sideways), 'right' 13 px right of it (at the point's height), 'in' on the photo at (dx, dy)
  // from the point.
  const CALLOUTS = [
    { key: 'timer', side: 'top' }, { key: 'blueGauge', side: 'top' }, { key: 'orangeGauge', side: 'top' },
    { key: 'alive', side: 'top' }, { key: 'attackX2', side: 'top' }, { key: 'message', side: 'right', at: [244, 48] },
    { key: 'zone', side: 'in', dx: 24, dy: -22 }, { key: 'self', side: 'in', dx: -24, dy: -20 },
    { key: 'hp', side: 'bottom', dx: -12 }, { key: 'water', side: 'bottom', dx: 12 }, { key: 'weapon', side: 'bottom' }, { key: 'radar', side: 'bottom' },
  ];
  function drawLeaders() {
    if (prefs.text) return;
    // measure with every page laid out (offsets are in unscaled page px, so the zoom does not matter)
    const was = $$('#book .page.on'), bookHidden = book.hidden;
    book.hidden = false;
    $$('#book .page').forEach(p => p.classList.add('on'));
    try { drawLeadersNow(); } finally {
      $$('#book .page').forEach(p => p.classList.toggle('on', was.indexOf(p) >= 0));
      book.hidden = bookHidden;
    }
  }
  function drawLeadersNow() {
    $$('#book .page').forEach(page => {
      const tags = $$('.tag[data-to]', page), fig = $('.callout-fig', page);
      if (!tags.length && !fig) return;
      const svg = svgFor(page);
      tags.forEach(t => {
        const [tx, ty] = t.dataset.to.split(',').map(Number), b = pagePos(t, page);
        if (tx >= b.x && tx <= b.x + b.w && ty >= b.y && ty <= b.y + b.h) return;
        const [sx, sy] = edgePoint(b, tx, ty); lead(svg, sx, sy, tx, ty);
      });
      if (fig) {
        $$('.num.pin', page).forEach(p => p.remove());
        const cv = $('canvas', fig), fb = pagePos(cv, page);
        const ax = fb.x + 1, ay = fb.y + 1, kx = (fb.w - 2) / 256, ky = (fb.h - 2) / 224;
        const key = (fig.dataset.anchors || 'play.normal').split('.');
        const A = GS.screens[key[0]].anchors[key[1]];   // the screen's own ROM coordinates (play.js anchors)
        CALLOUTS.forEach((c, i) => {
          const a = c.at || A[c.key]; if (!a) return;
          const tx = ax + a[0] * kx, ty = ay + a[1] * ky;
          let px, py;
          if (c.side === 'top') { px = tx; py = fb.y - 8; }
          else if (c.side === 'bottom') { px = tx + (c.dx || 0); py = fb.y + fb.h + 9; }
          else if (c.side === 'right') { px = fb.x + fb.w + 13; py = ty; }
          else { px = tx + c.dx; py = ty + c.dy; }   // 'in'
          const d = Math.hypot(tx - px, ty - py);
          if (d > 8) { const ux = (tx - px) / d, uy = (ty - py) / d; lead(svg, px + ux * 7, py + uy * 7, tx, ty); }
          const pin = document.createElement('i');
          pin.className = 'a num pin'; pin.textContent = String(i + 1); pin.setAttribute('aria-hidden', 'true');
          pin.style.left = R(px - 7) + 'px'; pin.style.top = R(py - 7) + 'px';
          page.append(pin);
        });
      }
    });
  }

  // =====================================================================
  // viewer state + layout
  // =====================================================================
  const stage = $('#mv-stage'), fit = $('#mv-fit'), slide = $('#mv-slide'), book = $('#book'), extra = $('#extra');
  const posEl = $('#mv-pos'), range = $('#mv-range'), rangeOut = $('#mv-range-out'), live = $('#mv-live');
  range.max = String(ALL.length - 1);   // the slider's value is an index into ALL
  const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
  // 動きをへらす: the OS setting, else the shell's live setting (same origin), else what the shell passed in the URL
  // (&reduced=1) or by postMessage {gs:'manual-prefs', reduced}. Under file:// the parent is an opaque origin and
  // cannot be read, so only the last two reach the manual there.
  let parentReduced = QS.has('reduced') ? QS.get('reduced') === '1' : null;
  window.addEventListener('message', e => {
    const d = e.data;
    if (!EMBED || e.source !== window.parent || !d || typeof d !== 'object' || d.gs !== 'manual-prefs') return;
    if ('reduced' in d) parentReduced = !!d.reduced;
  });
  function reduced() {
    if (mqReduce.matches) return true;
    try {
      const pg = window.parent !== window && window.parent.GS;
      if (pg && pg.state) return !!pg.state.reduced;
    } catch (e) { /* opaque parent (file://): fall through */ }
    return !!parentReduced;
  }
  let cur = 'p1', spread = false, scale = 1, zoom = 1;
  const views = () => (spread ? SPREADS : SINGLES);
  const viewOf = id => views().find(v => v.indexOf(id) >= 0) || views()[0];
  function decideSpread() {
    if (prefs.view === 'spread') return true;
    if (prefs.view === 'single') return false;
    const vw = window.innerWidth, vh = window.innerHeight;
    return vw >= vh && vh >= 560 && vw >= 760;
  }
  function computeScale() {
    const vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
    // stage height = viewport minus both bars, including their safe-area insets (offsetHeight ignores scrollbars)
    const sh = stage.offsetHeight || (vh - 104);
    if (spread) return Math.max(0.3, Math.min((vw - 96) / SPREAD_W, (sh - 16) / PAGE_H));
    const shortLand = vw > vh && vh < 560;
    if (shortLand) return Math.max(0.3, Math.min(3, (vw - 96) / PAGE_W));
    if (vw < vh) return Math.max(0.3, Math.min((vw - 16) / PAGE_W, (sh - 12) / PAGE_H));
    return Math.max(0.3, Math.min((vw - 96) / PAGE_W, (sh - 16) / PAGE_H));
  }
  function applyFit() {
    const v = viewOf(cur);
    if (prefs.text) {   // text mode: no page scale, no zoom (Esc then closes the manual straight away)
      zoom = 1; fit.style.width = ''; fit.style.height = ''; book.style.transform = '';
      body.classList.remove('ht', 'mv-zoomed'); scheduleHiRes(); return;
    }
    if (v[0] === 'extra') { fit.style.width = Math.min(720, window.innerWidth - 32) + 'px'; fit.style.height = 'auto'; book.style.transform = ''; body.classList.remove('ht'); return; }
    scale = computeScale();
    const k = scale * zoom, w = (v.length === 2 ? SPREAD_W : PAGE_W);
    book.style.width = w + 'px'; book.style.height = PAGE_H + 'px';
    book.style.transform = 'scale(' + k + ')';
    fit.style.width = R(w * k) + 'px'; fit.style.height = R(PAGE_H * k) + 'px';
    body.classList.toggle('ht', k >= 2);
    body.classList.toggle('mv-zoomed', zoom > 1);
    scheduleHiRes();
  }
  function setZoom(z, cx, cy) {
    z = Math.max(1, Math.min(4, z));
    if (prefs.text || z === zoom) return;
    const fr = fit.getBoundingClientRect();
    const px = (cx - fr.left) / (scale * zoom), py = (cy - fr.top) / (scale * zoom);
    zoom = z; applyFit();
    const nr = fit.getBoundingClientRect();
    stage.scrollLeft += nr.left + px * scale * zoom - cx;
    stage.scrollTop += nr.top + py * scale * zoom - cy;
  }
  function toggleZoom(cx, cy) { setZoom(zoom > 1 ? 1 : 2, cx, cy); }

  // the current page goes into the address (#pN) and, embedded, to the shell, which reopens the manual there
  let lastPosted = null;
  function notifyPage() {
    const hash = '#' + cur;
    if (location.hash !== hash) { try { history.replaceState(null, '', hash); } catch (e) { /* file:// sandbox */ } }
    if (EMBED && lastPosted !== cur) { lastPosted = cur; try { window.parent.postMessage({ gs: 'manual-page', page: cur }, '*'); } catch (e) { /* ignore */ } }
  }
  function show(id, opts) {
    opts = opts || {};
    if (ALL.indexOf(id) < 0) id = 'p1';
    const prevView = viewOf(cur);
    cur = id;
    const v = viewOf(cur);
    const changed = prevView !== v;
    if (prefs.text) {
      $$('#book .page').forEach(p => p.classList.add('on')); extra.hidden = false; extra.classList.add('on');
      const el = id === 'extra' ? extra : pageEl(id);
      applyFit();   // drops the page mode's scale / zoom classes; photos are re-rendered at the text column width
      if (el && !opts.noScroll) stage.scrollTop = el.offsetTop - 8;
    } else {
      $$('#book .page').forEach(p => p.classList.toggle('on', v.indexOf(p.id) >= 0));
      const ex = v[0] === 'extra'; extra.hidden = !ex; extra.classList.toggle('on', ex); book.hidden = ex;
      if (changed || opts.force) { zoom = 1; }
      applyFit();
      if (changed) { stage.scrollTop = 0; stage.scrollLeft = 0; }
      if (changed && opts.dir && !reduced() && slide.animate) {
        slide.animate([{ transform: 'translateX(' + (opts.dir * 48) + 'px)', opacity: 0.25 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 200, easing: 'ease-out' });
      }
    }
    syncUi();
    if (changed && !opts.silent) live.textContent = viewLabel(v) + ' ' + viewTitle(v);
    notifyPage();
  }
  function syncUi() {
    const v = viewOf(cur);
    posEl.textContent = (v[0] === 'extra' ? '付録' : viewLabel(v) + ' / ' + PAGES.length);
    const idx = ALL.indexOf(v[0]);
    range.value = String(idx); range.setAttribute('aria-valuetext', viewLabel(v)); rangeOut.textContent = viewLabel(v);
    const vi = views().indexOf(v);
    $('[data-act="prev"]').disabled = vi <= 0; $('[data-act="next"]').disabled = vi >= views().length - 1;
    $$('[data-view]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.view === 'spread') === spread && !prefs.text)));
    $$('[data-look]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.look === prefs.look)));
    $('[data-act="ruby"]').setAttribute('aria-pressed', String(!!prefs.ruby));
    $('[data-act="text"]').setAttribute('aria-pressed', String(!!prefs.text));
    $$('.th-item').forEach(b => b.classList.toggle('cur', b.dataset.page === v[0]));
  }
  function step(d) {
    const vs = views(), i = vs.indexOf(viewOf(cur)), j = Math.max(0, Math.min(vs.length - 1, i + d));
    if (j !== i) show(vs[j][0], { dir: d });
  }
  function applyPrefs() {
    body.classList.toggle('scan', prefs.look === 'scan'); body.classList.toggle('crisp', prefs.look !== 'scan');
    body.classList.toggle('no-ruby', !prefs.ruby);
    body.classList.toggle('mode-text', !!prefs.text);
    spread = decideSpread();
  }
  function relayout(force) {
    const was = spread; applyPrefs();
    if (force || was !== spread) show(cur, { silent: true, force: true, noScroll: !force }); else applyFit();
  }

  // text mode: keep the position readout in step with scrolling
  let scrollRaf = 0;
  stage.addEventListener('scroll', () => {
    if (!prefs.text) return;
    cancelAnimationFrame(scrollRaf);
    scrollRaf = requestAnimationFrame(() => {
      const top = stage.scrollTop + 40; let best = 'cover1';
      ALL.forEach(id => { const e = id === 'extra' ? extra : pageEl(id); if (e && e.offsetTop <= top) best = id; });
      if (best !== cur) { cur = best; syncUi(); notifyPage(); }
    });
  }, { passive: true });

  // =====================================================================
  // thumbnails (the two-page spreads + the single covers + the appendix)
  // =====================================================================
  let thumbsDirty = true;
  function buildThumbs() {
    const grid = $('#mv-thumb-grid'); grid.textContent = '';
    SPREADS.forEach(v => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'th-item'; b.dataset.page = v[0];
      const pic = document.createElement('div'); pic.className = 'th-pic'; pic.setAttribute('aria-hidden', 'true'); pic.inert = true;
      if (v[0] === 'extra') { const e = document.createElement('div'); e.className = 'th-ex'; e.textContent = '付録'; pic.append(e); }
      else v.forEach(id => {
        const src = pageEl(id), cl = src.cloneNode(true);
        cl.removeAttribute('id'); cl.classList.add('on');
        $$('[id]', cl).forEach(e => e.removeAttribute('id'));
        $$('input, a', cl).forEach(e => { e.setAttribute('tabindex', '-1'); if (e.tagName === 'INPUT') e.disabled = true; });
        const so = $$('canvas', src), sc = $$('canvas', cl);
        // photos and the logo have a device-resolution backing: copy them at about 1 page px per px
        so.forEach((o, i) => {
          const c = sc[i]; if (!c) return; const r = o._r > 1 ? o._r : 1;
          c.width = Math.max(1, R(o.width / r)); c.height = Math.max(1, R(o.height / r));
          try { const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(o, 0, 0, c.width, c.height); } catch (e) { /* ignore */ }
        });
        pic.append(cl);
      });
      const lb = document.createElement('span'); lb.className = 'th-lbl'; lb.textContent = viewLabel(v) + '\n' + viewTitle(v);
      lb.style.whiteSpace = 'pre-line';
      b.setAttribute('aria-label', viewLabel(v) + ' ' + viewTitle(v));
      b.append(pic, lb);
      b.addEventListener('click', () => { closeThumbs(); show(v[0], { dir: 0 }); });
      grid.append(b);
    });
    thumbsDirty = false; syncUi();
  }
  const thumbsEl = $('#mv-thumbs');
  function openThumbs() { if (thumbsDirty) buildThumbs(); thumbsEl.hidden = false; $('[data-act="thumbs"]').setAttribute('aria-expanded', 'true'); const c = $('.th-item.cur', thumbsEl) || $('.th-item', thumbsEl); if (c) c.focus(); }
  function closeThumbs() { if (thumbsEl.hidden) return; thumbsEl.hidden = true; $('[data-act="thumbs"]').setAttribute('aria-expanded', 'false'); }

  // =====================================================================
  // close / embed
  // =====================================================================
  // embedded (the game's iframe): ask the shell to close it. Standalone: 「← ゲームへ」 goes to ./index.html in this tab.
  function closeManual() {
    if (EMBED) { try { window.parent.postMessage({ gs: 'manual-close' }, '*'); } catch (e) { /* ignore */ } return; }
    location.href = './index.html';
  }

  // =====================================================================
  // input: buttons, keys, slider, swipe / pan / pinch / double tap
  // =====================================================================
  const toolsEl = $('#mv-tools'), moreBtn = $('[data-act="more"]');
  function closeTools() { toolsEl.classList.remove('open'); moreBtn.setAttribute('aria-expanded', 'false'); }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (a && a.closest('.page')) { e.preventDefault(); const id = a.getAttribute('href').slice(1); if (ALL.indexOf(id) >= 0) { if (prefs.text) show(id); else show(id, { dir: 1 }); } return; }
    const b = e.target.closest('[data-act], [data-view], [data-look]'); if (!b) return;
    if (b.dataset.view) { prefs.view = b.dataset.view; if (prefs.text) prefs.text = false; savePrefs(); relayout(true); closeTools(); return; }
    if (b.dataset.look) { prefs.look = b.dataset.look; savePrefs(); applyPrefs(); syncUi(); return; }
    switch (b.dataset.act) {
      case 'close': closeManual(); break;
      case 'prev': step(-1); break;
      case 'next': step(1); break;
      case 'toc': closeThumbs(); show('p1', { dir: -1 }); break;
      case 'thumbs': if (thumbsEl.hidden) openThumbs(); else closeThumbs(); break;
      case 'thumbs-close': closeThumbs(); break;
      case 'ruby': prefs.ruby = !prefs.ruby; savePrefs(); applyPrefs(); syncUi(); setTimeout(drawLeaders, 0); thumbsDirty = true; break;
      case 'text': prefs.text = !prefs.text; savePrefs(); relayout(true); closeTools(); if (!prefs.text) setTimeout(drawLeaders, 0); break;
      case 'more': { const o = !toolsEl.classList.contains('open'); toolsEl.classList.toggle('open', o); moreBtn.setAttribute('aria-expanded', String(o)); break; }
      default: break;
    }
  });
  document.addEventListener('pointerdown', e => { if (toolsEl.classList.contains('open') && !e.target.closest('#mv-tools, [data-act="more"]')) closeTools(); }, true);
  range.addEventListener('input', () => { const id = ALL[+range.value] || 'p1'; const d = ALL.indexOf(id) > ALL.indexOf(cur) ? 1 : -1; show(id, { dir: d }); });
  document.addEventListener('keydown', e => {
    if (e.target.matches && e.target.matches('input:not([type="range"]), textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === 'Escape') {
      e.preventDefault();
      if (!thumbsEl.hidden) closeThumbs();
      else if (toolsEl.classList.contains('open')) closeTools();
      else if (zoom > 1) { zoom = 1; applyFit(); }
      else if (EMBED) closeManual();   // standalone: Esc never leaves the page (use もどる)
      return;
    }
    if (e.target === range && (k === 'ArrowLeft' || k === 'ArrowRight')) return;
    if (k === 'ArrowRight' || k === 'PageDown') { e.preventDefault(); step(1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); step(-1); }
    else if (k === 'Home') { e.preventDefault(); show(views()[0][0], { dir: -1 }); }
    else if (k === 'End') { e.preventDefault(); const vs = views(); show(vs[vs.length - 1][0], { dir: 1 }); }
  });
  window.addEventListener('hashchange', () => { const id = location.hash.slice(1); if (ALL.indexOf(id) >= 0 && id !== cur) show(id, { dir: ALL.indexOf(id) > ALL.indexOf(cur) ? 1 : -1 }); });

  const ptrs = new Map(); let gest = null, pinch = null, lastTap = { t: 0, x: 0, y: 0 };
  const interactive = t => t.closest && t.closest('a, input, button, textarea, select, label, .th-item');
  stage.addEventListener('pointerdown', e => {
    if (prefs.text || interactive(e.target) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      const [a, b] = Array.from(ptrs.values());
      pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: zoom }; gest = null;
    } else if (ptrs.size === 1) {
      gest = { id: e.pointerId, sx: e.clientX, sy: e.clientY, sl: stage.scrollLeft, st: stage.scrollTop, t0: performance.now(), moved: false, type: e.pointerType };
    }
    try { stage.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
  });
  stage.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size >= 2) {
      const [a, b] = Array.from(ptrs.values()), d = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom(pinch.z0 * d / pinch.d0, (a.x + b.x) / 2, (a.y + b.y) / 2); e.preventDefault(); return;
    }
    if (!gest || gest.id !== e.pointerId) return;
    const dx = e.clientX - gest.sx, dy = e.clientY - gest.sy;
    if (!gest.moved && Math.hypot(dx, dy) > 6) gest.moved = true;
    const overX = stage.scrollWidth > stage.clientWidth + 1, overY = stage.scrollHeight > stage.clientHeight + 1;
    if (gest.moved && (zoom > 1 || (overY && Math.abs(dy) > Math.abs(dx)) || gest.pan)) {
      gest.pan = true; body.classList.add('mv-panning');
      if (overX) stage.scrollLeft = gest.sl - dx;
      if (overY) stage.scrollTop = gest.st - dy;
    }
  });
  function endPtr(e) {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (pinch) { if (ptrs.size < 2) { pinch = null; gest = null; } return; }
    if (!gest || gest.id !== e.pointerId) return;
    const g = gest; gest = null; body.classList.remove('mv-panning');
    if (e.type === 'pointercancel') return;
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy, dt = performance.now() - g.t0;
    if (!g.pan && zoom === 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 800) { step(dx < 0 ? 1 : -1); return; }
    if (!g.moved && g.type !== 'mouse') {
      const now = performance.now();
      if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) { toggleZoom(e.clientX, e.clientY); lastTap.t = 0; }
      else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
  }
  stage.addEventListener('pointerup', endPtr);
  stage.addEventListener('pointercancel', endPtr);
  stage.addEventListener('dblclick', e => { if (prefs.text || interactive(e.target)) return; e.preventDefault(); toggleZoom(e.clientX, e.clientY); });
  stage.addEventListener('wheel', e => { if (prefs.text) return; if (e.ctrlKey) { e.preventDefault(); setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); } }, { passive: false });

  let rz = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => relayout(false)); });

  // =====================================================================
  // boot
  // =====================================================================
  function startPage() {
    const h = location.hash.slice(1);   // page ids are ASCII (p1, cover1, ...); a malformed %-escape just misses
    if (ALL.indexOf(h) >= 0) return h;
    return EMBED ? 'p1' : 'cover1';
  }
  function init() {
    // flex/grid boxes whose text must flow as one inline run (ruby would otherwise become separate items)
    $$('.catch, .cv-label').forEach(el => { const s = document.createElement('span'); s.append(...Array.from(el.childNodes)); el.append(s); });
    $$('#book .page').forEach(p => applyRuby(p));
    if (DEBUG) {
      if (missingRuby.size) console.warn('[manual] kanji without ruby:', Array.from(missingRuby.keys()).join(''));
      // keys no text uses, or that a longer key always wins over
      const unused = Object.keys(RUBY).filter(k => !usedRuby.has(k));
      if (unused.length) console.info('[manual] RUBY keys that never match:', unused.join(' '));
    }
    buildMemo();
    applyPrefs();
    cur = startPage();
    show(cur, { silent: true, force: true });
    if (!EMBED) { $('.mv-back .lbl').textContent = ' ゲームへ'; $('.mv-back').setAttribute('aria-label', 'ゲームへ'); }
    drawAll(false);
    const fontsP = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    fontsP.then(() => setTimeout(drawLeaders, 0));
    // resolves once manual.html's module has installed the app (with the game.mjs rules, or without them)
    GS.boot({ headless: true }).then(() => { drawAll(true); setTimeout(drawLeaders, 0); })
      .catch(e => { console.error('[manual] GS.boot failed', e); });
    setTimeout(() => { try { stage.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 50);
  }
  // Console tool (development only; the viewer never calls it): GSManual.audit() lays out every page and returns
  // { pageId: [issues] }: content boxes (page px) that run past the body area, or overlap one another.
  function audit() {
    const res = {}, k = scale * zoom, was = $$('#book .page.on');
    $$('#book .page').forEach(p => p.classList.add('on'));
    $$('#book .page').forEach(p => {
      const pr = p.getBoundingClientRect(), items = [];
      Array.from(p.children).filter(e => e.matches('.a, .band, .nombre') && !e.matches('.sr, svg, .staple, .deco, .num.pin') && e.offsetParent).forEach(e => {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        const pg = q => [R((q.left - pr.left) / k), R((q.top - pr.top) / k), R((q.right - pr.left) / k), R((q.bottom - pr.top) / k)];
        const add = q => { if (q.width && q.height) { x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); } };
        let rs = null;
        if (e.querySelector('.dodge')) {
          // text that flows around a float (kept clear of the catch): test each text line, not the box
          rs = [];
          const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n;
          const line = q => { if (q.width && q.height) { add(q); rs.push(pg(q)); } };
          while ((n = w.nextNode())) { if (!n.nodeValue.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); Array.from(rg.getClientRects()).forEach(line); }
          $$('canvas, img', e).forEach(c => line(c.getBoundingClientRect()));
        } else {
          add(e.getBoundingClientRect());
          const rg = document.createRange(); rg.selectNodeContents(e); Array.from(rg.getClientRects()).forEach(add);
        }
        const box = pg({ left: x0, top: y0, right: x1, bottom: y1 });
        items.push({ el: e, cls: (e.className || '').toString().replace(/\s+/g, '.') + (e.textContent ? ':' + e.textContent.trim().slice(0, 8) : ''), x0: box[0], y0: box[1], x1: box[2], y1: box[3], rs: rs || [box] });
      });
      const issues = [];
      // the body area ends at y462; .nombre sits at y463-485 (outside the body area on purpose)
      items.forEach(a => { if (!a.el.matches('.band, .cv-kv, .p2-scene, .mapcut, .cv-top, .cv-foot, .cv-blue, .nombre') && (a.y1 > 462 || a.x0 < 0 || a.x1 > PAGE_W)) issues.push('out ' + a.cls + ' ' + [a.x0, a.y0, a.x1, a.y1]); });
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        if (a.el.matches('.band') || b.el.matches('.band')) continue;
        // name labels may sit on their figure, but never on the catch
        if ((a.el.matches('.tag') || b.el.matches('.tag')) && !(a.el.matches('.catch') || b.el.matches('.catch'))) continue;
        const hit = (p, q) => p[0] < q[2] - 1 && q[0] < p[2] - 1 && p[1] < q[3] - 1 && q[1] < p[3] - 1;
        if (a.rs.some(p => b.rs.some(q => hit(p, q)))) issues.push('overlap ' + a.cls + ' ' + [a.x0, a.y0, a.x1, a.y1] + ' × ' + b.cls + ' ' + [b.x0, b.y0, b.x1, b.y1]);
      }
      if (issues.length) res[p.id] = issues;
    });
    $$('#book .page').forEach(p => p.classList.toggle('on', was.indexOf(p) >= 0));
    return res;
  }
  // Console tools for development (nothing in the game or the manual uses them): page navigation, the view state,
  // a full redraw, the ruby tables and the layout audit above.
  window.GSManual = { show, step, prefs, audit, get cur() { return cur; }, get spread() { return spread; }, get scale() { return scale; }, get zoom() { return zoom; },
    setZoom: z => setZoom(z, window.innerWidth / 2, window.innerHeight / 2), redraw: () => { drawAll(true); drawLeaders(); }, missingRuby, RUBY, drawLeaders };
  init();
})();
