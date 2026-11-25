/* ガン・スプラッシュ 復刻版 — field sprites
 * Pixel art for the play field (characters, guns, shots, effects, pumps, markers, HUD icons).
 *
 * OBJ palette slots:
 *   1 outline  2 shell  3 shell hi  4 shell dark  5 visor  6 eye  7 gold line  8 collar
 *   9 tank glass  a tank frame  b tank water  c water surface  d gun  e gun shadow  f ink
 * UI tint palettes (gold / white / water / danger / neutral / self / blueUI / orangeUI / pump /
 * footOn / footOff ...) recolour slots 1-4 only, so UI sprites below use 1-4 (+ b/c for water).
 *
 * Character: rounded helmet with a crest swept back, dark visor with two glowing eyes,
 * a gold line, a float-ring collar, a tank on the back (drawn by GS.actor in core.js). Teams differ by palette only.
 */
(function () {
  'use strict';
  const GS = window.GS;
  const def = GS.defSprite;

  // ------------------------------------------------------------------ helpers
  // replace characters at (x,y) in a row list: put(rows, x, y, 'abc')
  function put(rows, x, y, str) {
    const r = rows[y].split('');
    for (let i = 0; i < str.length; i++) if (str[i] !== ' ') r[x + i] = str[i];
    rows[y] = r.join('');
  }
  const copy = rows => rows.slice();

  // ------------------------------------------------------------------ characters (16x16, facing right)
  const BODY = [
    '...111..........', // 0  crest tip (swept back)
    '..13331111......', // 1
    '...1133333111...', // 2
    '...132222222311.', // 3
    '..13222222222231', // 4
    '..12222221111111', // 5  visor rim
    '.122222215555551', // 6  visor
    '.122222215655651', // 7  eyes
    '.142222215555551', // 8
    '..14422221111111', // 9
    '..1777777777771.', // 10 gold line
    '.188788888878881', // 11 float-ring collar
    '..18888888888 1.', // 12
    '...14222222241..', // 13 torso
    '...1441...1441..', // 14 legs
    '...1111...1111..', // 15 feet
  ].map(r => r.replace(' ', '8'));
  def('body_field', BODY);

  // pumping: side pose holding the lever with both hands (2 frames, 8f each)
  const PUMP0 = copy(BODY);
  put(PUMP0, 12, 9, '1111');
  put(PUMP0, 12, 10, '1331');
  put(PUMP0, 13, 11, '111');
  const PUMP1 = copy(BODY.slice(0, 15)); PUMP1.unshift('................');   // body dips 1px
  put(PUMP1, 12, 12, '1111');
  put(PUMP1, 12, 13, '1331');
  put(PUMP1, 13, 14, '111');
  def('body_pump_0', PUMP0);
  def('body_pump_1', PUMP1);

  // defeated: collapsed helmet, × on the visor (drawn with the 'gray' palette)
  def('body_down', [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.....111111.....',
    '...1133333311...',
    '..132222222231..',
    '.13222211111111.',
    '.12222215656651.',
    '.12222215565551.',
    '.14422215656651.',
    '.1777711111111..',
    '18888888888881..',
    '.111111111111...',
  ]);

  // guns 8x8: gun_k points k*22.5deg from right toward screen-down (GS.actor in core.js mirrors the rest)
  def('gun_0', [
    '........',
    '........',
    '.111111.',
    '1dddddd1',
    '1eeeeeeb',
    '.1e1111.',
    '.11.....',
    '........',
  ]);
  def('gun_1', [
    '........',
    '.111....',
    '1ddd11..',
    '1eeddd1.',
    '.11eedd1',
    '.1e11eeb',
    '.11...1.',
    '........',
  ]);
  def('gun_2', [
    '........',
    '.11.....',
    '1dd1....',
    '1edd1...',
    '.1edd1..',
    '.11edd1.',
    '...1ed1.',
    '....1b..',
  ]);
  def('gun_3', [
    '..11....',
    '.1dd1...',
    '.1edd1..',
    '.11ed1..',
    '..1ed1..',
    '..1edd1.',
    '...1ed1.',
    '....b1..',
  ]);
  def('gun_4', [
    '..11....',
    '.1dd1...',
    '.1ed11..',
    '.1ed1...',
    '..1ed1..',
    '..1ed1..',
    '..1ed1..',
    '...1b...',
  ]);

  // ------------------------------------------------------------------ shots and effects
  // normal shot 6x6: team-coloured rim (slot 2) around water
  def('bullet_n', [
    '.2222.',
    '2ccbb2',
    '2cbbb2',
    '2bbbb2',
    '2bbbb2',
    '.2222.',
  ]);
  // powered (gold) shot: same shape, draw with pal 'gold' (rim = gold, spark = goldHi)
  def('bullet_gold', [
    '.2332.',
    '2ccbb2',
    '3cbbb2',
    '2bbbb3',
    '2bbbb2',
    '.2332.',
  ]);
  // weak shot 4x4: thin ring (team colour)
  def('bullet_weak', [
    '.22.',
    '2..2',
    '2..2',
    '.22.',
  ]);

  // long-barrel charge orb (8 / 10 / 12 / 16 px). Draw with pal 'water' (1 deep, 2 water, 3 hi, 4 dark).
  function orb(n) {
    const g = [], c = (n - 1) / 2, r = n / 2;
    for (let y = 0; y < n; y++) {
      let row = '';
      for (let x = 0; x < n; x++) {
        const d = Math.hypot(x - c, y - c);
        if (d > r - 0.25) { row += '.'; continue; }
        if (d > r - 1.25) { row += '1'; continue; }
        const lx = x - c + r * 0.35, ly = y - c + r * 0.35;
        if (Math.hypot(lx, ly) < r * 0.28) row += '3';
        else if ((x - c) + (y - c) > r * 0.55) row += '4';
        else row += '2';
      }
      g.push(row);
    }
    return g;
  }
  [8, 10, 12, 16].forEach((n, i) => def('orb_' + (i + 1), orb(n)));

  // hit spark (× shape). pal 'white' (2 white, 3 waterHi)
  def('spark', [
    '2......2',
    '.3....3.',
    '..3..3..',
    '...22...',
    '...22...',
    '..3..3..',
    '.3....3.',
    '2......2',
  ]);
  // slowing ripple at the feet (pal 'water')
  def('ripple', [
    '........',
    '........',
    '........',
    '..3333..',
    '.3....3.',
    '3......3',
    '.3....3.',
    '..3333..',
  ]);
  // water splash, 4 frames (pal 'water'): burst -> crown -> drops -> mist
  def('splash_1', [
    '........',
    '........',
    '...33...',
    '..3223..',
    '..3223..',
    '...44...',
    '........',
    '........',
  ]);
  def('splash_2', [
    '........',
    '.3....3.',
    '..3..3..',
    '.32..23.',
    '...22...',
    '..4224..',
    '...44...',
    '........',
  ]);
  def('splash_3', [
    '3......3',
    '........',
    '.2....2.',
    '...33...',
    '........',
    '.2....2.',
    '........',
    '3..44..3',
  ]);
  def('splash_4', [
    '3......3',
    '........',
    '........',
    '........',
    '........',
    '........',
    '........',
    '.3....3.',
  ]);

  // ------------------------------------------------------------------ markers
  // danger corner bracket (top-left; GS.actor mirrors it for the other three)
  def('corner', [
    '11111...',
    '12221...',
    '1211....',
    '121.....',
    '111.....',
    '........',
    '........',
    '........',
  ]);
  // ▼ over YOU (pal 'self')
  def('marker_self', [
    '11111111',
    '13322221',
    '.132221.',
    '.122221.',
    '..1221..',
    '...11...',
    '........',
    '........',
  ]);
  // PC crosshair 9x9 (pal 'white', or 'danger' when the tank is short)
  def('crosshair', [
    '...111...',
    '...121...',
    '...121...',
    '111...111',
    '122.2.221',
    '111...111',
    '...121...',
    '...121...',
    '...111...',
  ]);
  // aim-assist target mark 16x16, 2 frames (shrinks over 10f)
  def('aim_lock', [
    '11111......11111',
    '12221......12221',
    '121..........121',
    '121..........121',
    '11............11',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '11............11',
    '121..........121',
    '121..........121',
    '12221......12221',
    '11111......11111',
  ]);
  def('aim_lock_1', [
    '................',
    '................',
    '..1111....1111..',
    '..1221....1221..',
    '..12........21..',
    '..11........11..',
    '................',
    '................',
    '................',
    '................',
    '..11........11..',
    '..12........21..',
    '..1221....1221..',
    '..1111....1111..',
    '................',
    '................',
  ]);

  // off-screen edge marks (8x8; the hit wedge is 16x16)
  def('edge_flag', [
    '11......',
    '131111..',
    '1322221.',
    '13222221',
    '1324441.',
    '131111..',
    '131.....',
    '111.....',
  ]);
  def('edge_drop', [
    '...11...',
    '..1221..',
    '..1321..',
    '.132221.',
    '.132221.',
    '.122241.',
    '.124441.',
    '..1111..',
  ]);
  // › pointing right (flipX for left); edge_near_v points down (flipY for up)
  def('edge_near', [
    '........',
    '.11.....',
    '.1211...',
    '..1221..',
    '..1221..',
    '.1211...',
    '.11.....',
    '........',
  ]);
  def('edge_near_v', [
    '........',
    '........',
    '.11..11.',
    '.121121.',
    '..1221..',
    '...11...',
    '........',
    '........',
  ]);
  // hit wedge pointing up (toward the top edge; flipY for the bottom). edge_hit_r points right.
  (function () {
    const up = [];
    for (let y = 0; y < 16; y++) {
      let row = '';
      for (let x = 0; x < 16; x++) {
        const hw = y < 2 || y > 13 ? -1 : Math.floor((y - 2) * 0.55);
        const d = Math.abs(x - 7.5);
        if (hw < 0 || d > hw + 1.5) row += '.';
        else if (d > hw + 0.5 || y === 13) row += '1';
        else row += y < 5 ? '3' : '2';
      }
      up.push(row);
    }
    def('edge_hit', up);
    const right = [];
    for (let y = 0; y < 16; y++) { let row = ''; for (let x = 0; x < 16; x++) row += up[15 - x][y]; right.push(row); }
    def('edge_hit_r', right);
  })();

  // ------------------------------------------------------------------ pump (pal 'pump')
  // side-lever hand pump: spout on the left, lever on the right. The operator stands to the
  // right (PUMP_LAYOUT.stand) facing left. Tap point = (tx,ty); body top-left = tap + PUMP_LAYOUT.body.
  def('pump', [
    '................',
    '......1111......',
    '.....133331.....',
    '.....122241.....',
    '......1241......',
    '...1111241......',
    '...1b222241.....',
    '...c1112241.....',
    '...b..12241.....',
    '......1241......',
    '.....122241.....',
    '....13222241....',
    '...1322222241...',
    '...1444444441...',
    '...1111111111...',
    '................',
  ]);
  // lever pivot = (0,4) of the 8x8; the grip (slot 7) reaches right to the operator's hands
  def('lever_0', [
    '........',
    '......77',
    '....1177',
    '..1121..',
    '1221....',
    '11......',
    '........',
    '........',
  ]);
  def('lever_1', [
    '........',
    '........',
    '........',
    '11......',
    '1221....',
    '..1121..',
    '....1177',
    '......77',
  ]);
  // footprints: stand here to pump (pal 'footOn' / 'footOff')
  def('foot', [
    '.2......',
    '222..2..',
    '222.222.',
    '.2..222.',
    '.....2..',
    '.2......',
    '.2...2..',
    '.....2..',
  ]);
  // (the offsets around the tap point are GS.PUMP_LAYOUT in core.js)

  // ------------------------------------------------------------------ HUD icons
  def('icon_normal', [
    '................',
    '................',
    '................',
    '.....1111.......',
    '....122331......',
    '....122221......',
    '.11111441111....',
    '1ddddddddddd11..',
    '1deeeeeeeedd1cb.',
    '.111111dde111bb.',
    '......1de1......',
    '......1de1......',
    '......1ee1......',
    '.......11.......',
    '................',
    '................',
  ]);
  def('icon_splash', [
    '................',
    '..........c.....',
    '.............b..',
    '....1111.....c..',
    '...123331..b....',
    '...122221.....b.',
    '.1111441111..c..',
    '1ddddddddd11....',
    '1deeeeeeed1d1.b.',
    '.11111dde11d1...',
    '.....1de1.11..c.',
    '.....1de1.....b.',
    '.....1ee1.......',
    '......11........',
    '................',
    '................',
  ]);
  def('icon_long', [
    '................',
    '................',
    '................',
    '................',
    '......1111......',
    '.....122331.....',
    '1111114441111111',
    '1ddddddddddddddc',
    '1eeeeeeeeeeeeeeb',
    '.1111dde11111111',
    '....1de1........',
    '....1ee1........',
    '.....11.........',
    '................',
    '................',
    '................',
  ]);
  def('tank_icon', [
    '..aaaaaaaaaaaa..',
    '.a999999999999a.',
    'aacccccc999999aa',
    'aabbbbbbbb9999aa',
    'aabbbbbbbbbb99aa',
    'aabbbbbbbbbbbbaa',
    '.abbbbbbbbbbbba.',
    '..aaaaaaaaaaaa..',
  ]);
})();
