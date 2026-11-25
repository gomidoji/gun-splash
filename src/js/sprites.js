/* ガン・スプラッシュ 復刻版 — shared sprites
 * '.' = transparent, '1'-'9','a'-'f' = OBJ palette index:
 *   1 outline  2 shell  3 shell hi  4 shell dark  5 visor  6 eye  7 gold line  8 collar
 *   9 tank glass  a tank frame  b tank water  c water surface  d gun  e gun shadow  f spare(ink)
 * UI tint palettes (gold/white/water/danger/neutral/self/...) recolour slots 1-4 only.
 *
 * Small sprites shared by several screens: face, face_x, flag, drop, drop16, cursor.
 * The play-field sprites are in js/sprites-field.js, the 32x32 busts in js/sprites-bust.js.
 */
(function () {
  'use strict';
  const GS = window.GS;
  const def = GS.defSprite;

  // ----------------------------------------------------------------
  const FACE = [
    '..1111..',
    '.133221.',
    '12322221',
    '15655651',
    '15555551',
    '.177771.',
    '.188881.',
    '..1111..',
  ];
  def('face', FACE);
  // face_x: same helmet, eyes shut, crossed out with the outline colour (drawn with pal 'gray').
  def('face_x', FACE.map((r, y) => Array.from(r.replace(/6/g, '5'), (ch, x) => ((x === y || x === 7 - y) && y > 0 && y < 7 ? '1' : ch)).join('')));
  def('flag', [
    '111111..',
    '133331..',
    '1222221.',
    '12222221',
    '1222221.',
    '144441..',
    '111111..',
    '1.......',
  ]);
  def('drop', [
    '...11...',
    '..1221..',
    '..1321..',
    '.132221.',
    '.132221.',
    '.122241.',
    '.124441.',
    '..1111..',
  ]);
  def('drop16', [
    '.......11.......',
    '......1221......',
    '......1321......',
    '.....132221.....',
    '.....132221.....',
    '....13222221....',
    '....13222221....',
    '...1332222221...',
    '...1322222221...',
    '..132222222241..',
    '..132222222241..',
    '..122222222241..',
    '..122222224441..',
    '...1222244441...',
    '....12444441....',
    '.....111111.....',
  ]);
  // water-drop shaped ▶ (pal 'cursor': ink / white / waterHi / gray)
  def('cursor', [
    '.1111...',
    '133221..',
    '1322221.',
    '13222221',
    '12222221',
    '1222241.',
    '124441..',
    '.1111...',
  ]);
})();
