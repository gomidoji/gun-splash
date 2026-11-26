/* ガン・スプラッシュ 復刻版 — live bridge (ES module).
 * Owns the real match (game.mjs) and implements window.GS.app for the classic ROM scripts in js/*.js.
 * The classic scripts never import modules: they read GS.app (and GS.app.rules).
 *
 * Boot order: index.html sets <html data-live>, so js/core.js holds the ROM loop (GS.boot), the launcher's
 * power-on and the hash routes until this module calls GS.installApp(app) (see core.js "boot gate").
 * GS.whenReady(fn) callbacks registered by classic scripts run inside installApp, before the first ROM frame.
 *
 * Screen convention: a screen drives the REAL match only when it was entered with params.live === true
 * (startRound / retry / startDemo below pass it). Without it (MOCK panel, #hash routes with ?mock=1,
 * GS.still for the manual and the launcher) the screens keep their scripted mock data.
 */
import * as rules from './game.mjs';
import { AimAssist } from './aim.mjs';

const { Game, STAGES } = rules;

const GS = window.GS;
if (!GS || typeof GS.installApp !== 'function') throw new Error('[app] js/core.js (boot gate) is not loaded');

// ------------------------------------------------------------------ URL switches (testing)
const query = new URLSearchParams(location.search);
const SEED = query.has('seed') && Number.isFinite(+query.get('seed')) ? Math.trunc(+query.get('seed')) : null; // ?seed=N
const AUTO = query.get('auto') === '1';   // ?auto=1: actor 0 is a bot too (needs game.autopilot, see resetGame)
const newSeed = () => (SEED != null ? SEED : Math.floor(Math.random() * 1e8));

const STAGE_IDS = STAGES.map(s => s.id);
const stageNo = id => Math.max(1, STAGE_IDS.indexOf(id) + 1);          // 1..4 (title states stage1..stage4)
const validStage = id => STAGE_IDS.indexOf(id) >= 0;

const game = new Game(newSeed(), 'tutorial');
const aimAssist = new AimAssist();
let demoStage = -1;

// Fresh match on the given stage. autopilot: actor 0 is driven by botControl too (demo / ?auto=1;
// see tests/autopilot.test.mjs).
function resetGame(stageId, autopilot) {
  game.reset(newSeed(), stageId);
  game.autopilot = !!autopilot;
  aimAssist.reset();
  app.countdown = -1;
  app.round++;
  app.recorded = false;
}
function syncStageState(id) { GS.state.stage = id; GS.state.stageNo = stageNo(id); }
// startRound / retry / startDemo: a fresh match on the stage, then the play screen in `screenState` with
// params.live. The title demo always runs on autopilot; a normal round only with ?auto=1.
function startLiveMatch(stageId, screenState, from, demo) {
  app.demo = demo;
  resetGame(stageId, demo || AUTO);
  syncStageState(stageId);
  GS.go('play', screenState, demo
    ? { live: true, demo: true, stage: stageId, stageNo: stageNo(stageId), from }
    : { live: true, stage: stageId, stageNo: stageNo(stageId), from });
}

const app = {
  live: true,
  game,                         // the Game instance (screens only read it)
  rules,                        // game.mjs module namespace: CONFIG, STAGES, WEAPONS, ZONE, OBSTACLES, puddleOutline, ...
  aimAssist,                    // aim.mjs AimAssist for touch / stick aiming (play.js passes scale = CSS px per world unit)
  selectedStage: 'tutorial',    // 'tutorial' | 'lanes' | 'alleys' | 'maze'
  session: { record: [] },      // results of this run: 'win' | 'lose' | 'draw' (not saved)
  round: 0,                     // ++ on every reset of the match (see resetGame)
  recorded: false,              // session.record already has this round
  countdown: -1,                // seconds left in 3-2-1-GO, -1 = none. The play screen keeps it current.
  demo: false,                  // the current match is the title demo (actor 0 is a bot)
  auto: AUTO,
  seed: SEED,
  stageNo,

  // ステージ選択「しゅつげき」 -> play countdown -> real match
  startRound(stageId) {
    if (validStage(stageId)) app.selectedStage = stageId;
    // js/play.js (live path): 3-2-1-GO, game.start() at GO, game.update(1/60, input) in its fixed 60 fps update,
    // then the decision banner, recordResult() and result/<outcome>-1 with params.live.
    startLiveMatch(app.selectedStage, 'countdown', 'title', false);
  },
  // R / pause「やりなおす」/ result「もういちど」: same stage at once, no confirmation
  retry() {
    startLiveMatch(app.selectedStage, 'countdown', 'retry', false);
  },
  // pause「ステージ選択」/ result menu: stage select showing the selected stage
  toStageSelect() {
    app.demo = false;
    resetGame(app.selectedStage, false);
    GS.go('title', 'stage' + stageNo(app.selectedStage), { fade: true });
  },
  // result menu「タイトルへ」, end of the demo: the title with the intro already finished
  toTitle() {
    app.demo = false;
    GS.go('title', 'title', { complete: true });
  },
  // title idle 1200f -> demo match (actor 0 is a bot too); any input -> endDemo()
  startDemo() {
    demoStage = (demoStage + 1) % STAGE_IDS.length;   // the demo walks through the stages in order
    // play/demo (live): game.start() at once, DEMO PLAY + tips; any input, the decision or 30 s -> 32f fade-out
    // -> endDemo(). Demo matches are never recorded.
    startLiveMatch(STAGE_IDS[demoStage], 'demo', 'title', true);
  },
  endDemo() {
    app.abandonRound();
    app.toTitle();
  },
  // Drop the match on hand (countdown, play, demo) for an idle one on the selected stage: Game 'ready',
  // countdown -1, demo off. Every way to the title runs it (see "leaving for the title" below).
  abandonRound() {
    app.demo = false;
    resetGame(app.selectedStage, false);
    syncStageState(app.selectedStage);
  },
  openManual(page) { GS.shell.openManual(page); },
  // Store this round's outcome once (call when the decided match hands over to the result screen).
  // Demo matches are never recorded. Returns 'win' | 'lose' | 'draw' | null.
  recordResult() {
    if (game.state !== 'ended') return null;
    const r = outcome();
    if (!app.recorded && !app.demo) { app.session.record.push(r); app.recorded = true; }
    return r;
  },
  // Numbers of the decided match. result.js reads only this. Plain values, world units / seconds.
  resultSnapshot() {
    const st = game.stage;
    return {
      stage: { id: st ? st.id : null, name: st ? st.name : '', level: st ? st.level : '' },
      winner: game.winner,
      reason: game.reason,
      time: game.time,
      scores: [game.scores[0], game.scores[1]],
      actors: game.actors.map(a => ({ id: a.id, name: a.name, team: a.team, human: a.human, alive: a.alive, water: a.water,
        stats: { shots: a.stats.shots, weakShots: a.stats.weakShots, hits: a.stats.hits, kills: a.stats.kills,
          refilled: a.stats.refilled, capture: a.stats.capture } })),
      // initial = used + discarded + Σ water of the living + remaining (game.mjs conservation; dead actors hold 0)
      water: { used: game.usedWater, discarded: game.discardedWater, remaining: game.remainingWater(), initial: game.initialTotalWater },
    };
  },
};
const outcome = () => (game.winner === null ? 'draw' : game.winner === 0 ? 'win' : 'lose');

// ------------------------------------------------------------------ leaving for the title
// The app's own routes (toStageSelect, endDemo) reset the match before they go to the title. Others do not know
// GS.app: settings「タイトルにもどる（リセット）」 (shell.js reset -> GS.go('title', 'boot')), a #title route with
// ?mock=1. So any GS.go to the title that leaves a match half-run (3-2-1, playing, the demo) drops it first, and
// Game, GS.app and window.mizutamari.snapshot() no longer report the abandoned round. A decided match ('ended')
// stays as it was (result -> toTitle).
const screenGo = GS.go;
GS.go = function (id) {
  if (id === 'title' && (app.countdown >= 0 || app.demo || game.state === 'playing')) app.abandonRound();
  return screenGo.apply(this, arguments);
};

// ------------------------------------------------------------------ zoom lock (phones)
// Locked while a match is on screen (countdown / play / spectate), released in pause, demo, end, overlays.
const viewportMeta = document.querySelector('meta[name="viewport"]');
const normalViewport = viewportMeta ? viewportMeta.content : '';
let zoomLocked = false;
function shouldLockZoom() {
  const c = GS.current;
  if (c.id !== 'play' || GS.state.manualOpen || GS.state.settingsOpen) return false;
  const st = String(c.state || '');
  return st !== 'pause' && st !== 'demo' && st.indexOf('end') !== 0;
}
function syncZoomLock() {
  const locked = shouldLockZoom();
  if (zoomLocked === locked) return;
  zoomLocked = locked;
  document.documentElement.classList.toggle('zoom-locked', locked);
  if (viewportMeta) viewportMeta.content = locked ? normalViewport + ', maximum-scale=1, user-scalable=no' : normalViewport;
}
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, e => { if (shouldLockZoom()) e.preventDefault(); }, { passive: false });
}
document.addEventListener('touchmove', e => { if (shouldLockZoom() && e.touches.length > 1) e.preventDefault(); }, { passive: false });
window.addEventListener('wheel', e => { if (shouldLockZoom() && (e.ctrlKey || e.metaKey)) e.preventDefault(); }, { passive: false });
window.addEventListener('keydown', e => {
  if (shouldLockZoom() && (e.ctrlKey || e.metaKey) &&
    (['+', '-', '=', '0'].includes(e.key) || ['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0'].includes(e.code))) e.preventDefault();
}, { capture: true });
(function zoomLoop() { syncZoomLock(); requestAnimationFrame(zoomLoop); })();

// ------------------------------------------------------------------ diagnostics
// Read-only state for reproducible playtest reports and browser diagnostics.
window.mizutamari = Object.freeze({ snapshot: () => {
  const c = GS.current;
  const inPlay = c.id === 'play';
  return {
    stage: game.stage?.id, difficulty: game.stage?.difficulty,
    state: game.state, paused: inPlay && (c.state === 'pause' || !!GS.state.manualOpen || !!GS.state.settingsOpen),
    countdown: app.countdown, time: game.time, scores: [...game.scores], winner: game.winner, reason: game.reason,
    finaleEndsAt: game.finaleEndsAt, remainingTime: game.remainingTime(),
    zoneOwner: game.zoneOwner, contested: game.contested,
    water: game.remainingWater(),
    actors: game.actors.map(a => ({
      id: a.id, team: a.team, human: a.human, x: a.x, y: a.y, hp: a.hp, water: a.water, alive: a.alive,
      aiMode: a.human ? null : a.ai.mode, aiDuty: a.human ? null : a.ai.duty, aimTime: a.human ? 0 : a.ai.aimTime,
      goal: a.ai.goal?.id ?? null, tapId: a.tapId, recoil: a.recoil, charge: a.charge, chargeAim: a.chargeAim,
      weapon: a.weapon, cooldowns: { ...a.weaponCooldowns }, stats: { ...a.stats },
    })),
    taps: game.taps.map(t => ({ ...t })),
    puddles: game.puddles.map(p => ({ id: p.id, water: p.water })),
  };
} });

GS.installApp(app);
