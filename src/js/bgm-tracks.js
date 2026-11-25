/*
 * Gun Splash (retro edition): the four BGM tracks (sound test BGM 01-04), MML for js/bgm.js (dialect: see its header).
 * Original music written for this game. Each channel is one sound-chip voice; every channel of a track has the same length
 * and the loop point L at the same tick (tests/bgm.test.mjs checks this, bar lines included).
 */
(function () {
  'use strict';
  const GS = window.GS;
  if (!GS || !GS.bgm) return;
  const D = GS.bgm.define;
  // ------------------------------------------------------------------ BGM 01 にじのマーチ: title screen (story opening, title, menu, option)
  // Key: C major. Chords: intro: |Fmaj7|Em7|Dm7|G7sus4 G7| A: |C|G/B|Am|G G7|C|Fmaj7|Dm7 G7|C| A': |C|G/B|Am|G
  // G7|C|Fmaj7|Dm7 G7|C C7| B: |F|G|Em7|Am|Dm7|E7|F|G7|
  // Form: Bars 1-4 intro (rain clearing): a soft Fmaj7-Em7-Dm7-G7 descent on strings with bell raindrops. Marimba
  // and hats come in at bar 3, then a snare roll and a brass pickup in bar 4. Loop point L at bar 5. Bars 5-12 A:
  // the hook on the lead, brass stabs answering on beat 3, the marimba 'drip' arpeggio, and string guide tones in
  // 10ths over the descending bass C-B-A-G. Half cadence at bar 8, full cadence at bar 12, with a brass run
  // filling bar 12. Bars 13-20 A': the hook again with the bell doubling the lead an octave up and a new ending
  // that peaks on F6, then a C7 turn (lead run g-a-bb-a-g-e) into B. Bars 21-28 B: IV-V-iii-vi 'royal road'
  // contrast with legato rising sequences (rest-up-up-up-LONG), march oom-pah bass, brass off-beat 'pah' dyads,
  // light march snare with open-hat accents, and a string counter-line. Bar 28 is a G7 run (d6 b5 g5 f5 d5 b4)
  // leading back to the hook's c5 at bar 5.
  D({
    id: 'title', no: 1, name: 'にじのマーチ', bpm: 138,
    echo: { delay: 0.22, fb: 0.32, wet: 0.3 },
    ch: [
      { // main melody (hook in A/A', lyrical sequences in B)
        inst: 'lead', pan: 0, vol: 1, mml: `
        @lead o5 l8 v12 q7
        r1 |
        r1 |
        r1 |
        r1 |
        L o5 l8 v12 q7
        c8. d16 e8 a8^4 g8 e8 |
        g8. f16 e8 d8^4 c8 d8 |
        e8. f16 g8 >c8^4< b8 a8 |
        g4^8 a16 g16 f8 d8^4 |
        c8. d16 e8 a8^4 g8 e8 |
        a8. b16 >c8 e8^4 d8 c8< |
        >d8. c16< a8 f8 g8 a8 b8 >d8< |
        >c2^8< r8 r4 |
        c8. d16 e8 a8^4 g8 e8 |
        g8. f16 e8 d8^4 c8 d8 |
        e8. f16 g8 >c8^4< b8 a8 |
        g4^8 a16 g16 f8 d8^4 |
        c8. d16 e8 a8^4 g8 e8 |
        a8. b16 >c8 e8^4 d8 c8< |
        >f4. e8 d8 c8< b8 >d8< |
        >c4< r8 g16 a16 b-8 a8 g8 e8 |
        q8 r8 c8 f8 g8 a2 |
        r8 d8 g8 a8 b2 |
        >c4.< b8 g4 e4 |
        a2. r4 |
        r8 d8 f8 a8 >c2< |
        r8 e8 g+8 b8 >d2< |
        >c4.< a8 >f4 e8 c8< |
        >d4.< b8 g8 f8 d8 <b8> |
      `},
      { // intro fanfare pickup, answering stabs in A, fills, off-beat 'pah' dyads in B
        inst: 'brass', pan: -3, vol: 0.9, mml: `
        @brass o4 l8 v10 q4
        r1 |
        r1 |
        r1 |
        q6 r2 {dg}8^16 {dg}16 {fb}4 |
        L o4 l8 v10 q4
        r2 {g>c}8 {g>c}8 r4 |
        r2 {gb}8 {gb}8 r4 |
        r2 {a>c}8 {a>c}8 r4 |
        r2 r8 {gb}8 {gb}8 {fb}8 |
        r2 {g>c}8 {g>c}8 r4 |
        r2 {a>c}8 {a>c}8 r4 |
        r4 {fa}8 r8 r4 {fb}8 r8 |
        q6 r2 {eg}8 {fa}8 {gb}8 {a>c}8 |
        q4 r2 {g>c}8 {g>c}8 r4 |
        r2 {gb}8 {gb}8 r4 |
        r2 {a>c}8 {a>c}8 r4 |
        r2 r8 {gb}8 {gb}8 {fb}8 |
        r2 {g>c}8 {g>c}8 r4 |
        r2 {a>c}8 {a>c}8 r4 |
        r4 {fa}8 r8 r4 {fb}8 r8 |
        q5 {g>c}8 r8 r4 {eb-}8 r8 {eb-}8 r8 |
        v9 q4 r8 {a>c}8 r8 {a>c}8 r8 {a>c}8 r8 {a>c}8 |
        r8 {b>d}8 r8 {b>d}8 r8 {b>d}8 r8 {b>d}8 |
        r8 {eg}8 r8 {eg}8 r8 {eg}8 r8 {eg}8 |
        r8 {a>c}8 r8 {a>c}8 r8 {a>c}8 r8 {a>c}8 |
        r8 {fa}8 r8 {fa}8 r8 {fa}8 r8 {fa}8 |
        r8 {g+>d}8 r8 {g+>d}8 r8 {g+>d}8 r8 {g+>d}8 |
        r8 {a>c}8 r8 {a>c}8 r8 {a>c}8 r8 {a>c}8 |
        v10 r8 {fb}8 r8 {fb}8 r8 {fb}8 {fb}8 {fb}8 |
      `},
      { // water-drop arpeggio ostinato (8-16-16-8-8 drip figure, kept in octave 4 below the melody)
        inst: 'marimba', pan: 4, vol: 0.85, mml: `
        @marimba o4 l8 v9
        r1 |
        r1 |
        v7 d8 a16 f16 d8 a8 d8 a16 f16 d8 a8 |
        v8 c8 g16 f16 c8 g8 d8 b16 f16 d8 b8 |
        L o4 l8 v9
        c8 g16 e16 c8 g8 c8 g16 e16 c8 g8 |
        d8 b16 g16 d8 b8 d8 b16 g16 d8 b8 |
        c8 a16 e16 c8 a8 c8 a16 e16 c8 a8 |
        d8 b16 g16 d8 b8 d8 b16 f16 d8 b8 |
        c8 g16 e16 c8 g8 c8 g16 e16 c8 g8 |
        c8 a16 f16 c8 a8 c8 a16 f16 c8 a8 |
        d8 a16 f16 d8 a8 d8 b16 f16 d8 b8 |
        c8 g16 e16 c8 g8 c8 g16 e16 c8 g8 |
        c8 g16 e16 c8 g8 c8 g16 e16 c8 g8 |
        d8 b16 g16 d8 b8 d8 b16 g16 d8 b8 |
        c8 a16 e16 c8 a8 c8 a16 e16 c8 a8 |
        d8 b16 g16 d8 b8 d8 b16 f16 d8 b8 |
        c8 g16 e16 c8 g8 c8 g16 e16 c8 g8 |
        c8 a16 f16 c8 a8 c8 a16 f16 c8 a8 |
        d8 a16 f16 d8 a8 d8 b16 f16 d8 b8 |
        c8 g16 e16 c8 g8 c8 b-16 e16 c8 b-8 |
        v8 c8 a16 f16 c8 a8 c8 a16 f16 c8 a8 |
        d8 b16 g16 d8 b8 d8 b16 g16 d8 b8 |
        d8 g16 e16 d8 g8 d8 g16 e16 d8 g8 |
        c8 a16 e16 c8 a8 c8 a16 e16 c8 a8 |
        d8 a16 f16 d8 a8 d8 a16 f16 d8 a8 |
        d8 g+16 e16 d8 g+8 d8 g+16 e16 d8 g+8 |
        c8 a16 f16 c8 a8 c8 a16 f16 c8 a8 |
        d8 b16 f16 d8 b8 d8 b16 f16 d8 b8 |
      `},
      { // intro chords; guide tones in 10ths over the bass in A; rests in A' (voice budget); counter-line in B
        inst: 'strings', pan: -5, vol: 0.85, mml: `
        @strings o3 l1 v8 q8
        {a>ce}1 |
        {gb>d}1 |
        {fa>c}1 |
        {f>cd}2 {fb>d}2 |
        L o4 l1 v8 q8
        o4 e1 |
        o4 d1 |
        o4 c1 |
        o3 b1 |
        o4 e1 |
        o4 c1 |
        o3 a2 b2 |
        o4 c1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        o4 e2 o3 b-2 |
        v9 o3 a2 >c2< |
        o3 b2 >d2< |
        o4 e2 d2 |
        o4 c1 |
        o3 a2 >c2< |
        o3 g+2 b2 |
        o3 a2 >c2< |
        o3 b2 >d2< |
      `},
      { // bass: root-octave 8ths in A/A' (descending C-B-A-G with walk-ups), march oom-pah quarters in B
        inst: 'bass', pan: 0, vol: 1, mml: `
        @bass o2 l8 v12 q6
        q8 v10 o2 f1 |
        e1 |
        d1 |
        v12 q7 o1 g2 g8^16 g16 g4 |
        L o2 l8 v12 q6
        o2 c8 c8 >c8< c8 c8 c8 >c8< c8 |
        o1 b8 b8 >b8< b8 b8 b8 >b8< b8 |
        o1 a8 a8 >a8< a8 a8 a8 >a8< a8 |
        o1 g8 g8 >g8< g8 g8 g8 a8 b8 |
        o2 c8 c8 >c8< c8 c8 c8 >c8< c8 |
        o2 f8 f8 >f8< f8 f8 f8 >f8< f8 |
        o2 d8 d8 >d8< d8 o1 g8 g8 >g8< g8 |
        o2 c8 c8 >c8< c8 c8 d8 e8 f8 |
        o2 c8 c8 >c8< c8 c8 c8 >c8< c8 |
        o1 b8 b8 >b8< b8 b8 b8 >b8< b8 |
        o1 a8 a8 >a8< a8 a8 a8 >a8< a8 |
        o1 g8 g8 >g8< g8 g8 g8 a8 b8 |
        o2 c8 c8 >c8< c8 c8 c8 >c8< c8 |
        o2 f8 f8 >f8< f8 f8 f8 >f8< f8 |
        o2 d8 d8 >d8< d8 o1 g8 g8 >g8< g8 |
        o2 c8 c8 >c8< c8 e8 g8 b-8 g8 |
        q7 o2 f4 c4 f4 c4 |
        o1 g4 >d4< g4 >d4< |
        o2 e4 g4 e4 <b4> |
        o1 a4 >e4< a4 >e4< |
        o2 d4 <a4> d4 <a4> |
        o2 e4 <b4> e4 e4 |
        o2 f4 c4 f4 <a4> |
        q6 o1 g8 g8 >g8< g8 g8 g8 a8 b8 |
      `},
      { // kick / snare / toms: intro snare roll, pop backbeat with march ruffs in A, fills, march snare in B
        inst: 'drums', pan: 0, vol: 1, mml: `
        @drums l8
        r1 |
        r1 |
        r1 |
        v12 b4 r8 v6 s16 v7 s16 v8 s16 v9 s16 v10 s16 v11 s16 v12 s16 v13 s16 v12 m16 n16 |
        L
        [v14 b8 r8 v12 s8 r16 v7 s16 v14 b8 b8 v12 s8 r8 |
        v14 b8 r8 v12 s8 r16 v7 s16 v14 b8 b8 v9 s16 s16 v12 s16 s16 |]3
        v14 b8 r8 v12 s8 r16 v7 s16 v14 b8 b8 v12 s8 r8 |
        v14 b8 r8 v12 s8 r16 v8 s16 v11 m16 m16 n16 n16 v12 s16 s16 s16 s16 |
        [v14 b8 r8 v12 s8 r16 v7 s16 v14 b8 b8 v12 s8 r8 |
        v14 b8 r8 v12 s8 r16 v7 s16 v14 b8 b8 v9 s16 s16 v12 s16 s16 |]3
        v14 b8 r8 v12 s8 r16 v7 s16 v14 b8 b8 v12 s8 r8 |
        v14 b8 r8 v12 s8 v8 s16 s16 v9 s16 s16 v10 s16 s16 v11 s16 s16 v13 s16 s16 |
        [v14 b8 v7 s16 s16 v12 s8 v7 s8 v14 b8 v7 s16 s16 v12 s8 v7 s8 |]7
        v14 b8 v7 s16 s16 v12 s8 v7 s8 v11 s16 s16 m16 m16 v12 n16 n16 v13 s16 s16 |
      `},
      { // hats and crash (crash rings two beats at each section start; open-hat accents in B)
        inst: 'drums', pan: 3, vol: 0.8, mml: `
        @drums l8
        r1 |
        r1 |
        v4 h8 h8 v5 h8 h8 v6 h8 h8 v7 h8 h8 |
        r1 |
        L
        v11 y2 v9 h8 v6 h8 v9 h8 v6 h8 |
        v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 |
        v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 |
        v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v8 j8 |
        v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 |
        v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 |
        v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 |
        v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v8 j8 |
        v11 y2 v9 h8 v6 h8 v9 h8 v6 h8 |
        v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 |
        v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 |
        v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v8 j8 |
        v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 |
        v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 |
        v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 |
        v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 |
        v11 y2 v8 h4 j8 v6 h8 |
        [v8 h4 j8 v6 h8 v8 h4 j8 v6 h8 |]6
        v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 v9 h8 v6 h8 |
      `},
      { // raindrops in the intro; plays the melody an octave up in A' for sparkle
        inst: 'bell', pan: 5, vol: 0.75, mml: `
        @bell o6 l8 v8
        r8 a8 r4 r8 e8 r8 >c8< |
        r4 b8 r8 g8 r8 r8 >d8< |
        r8 f8 r8 a8 r8 >c8< r8 >e8< |
        r1 |
        L o6 l8 v8
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        c8. d16 e8 a8^4 g8 e8 |
        g8. f16 e8 d8^4 c8 d8 |
        e8. f16 g8 >c8^4< b8 a8 |
        g4^8 a16 g16 f8 d8^4 |
        c8. d16 e8 a8^4 g8 e8 |
        a8. b16 >c8 e8^4 d8 c8< |
        >f4. e8 d8 c8< b8 >d8< |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
      `},
    ],
  });

  // ------------------------------------------------------------------ BGM 02 どこいこう: stage select
  // Key: F major. Chords: no intro. A: |Fmaj7|Eb9|Dm7|Gm7 C9|Fmaj7|Eb9|Dm7 G9|Cm7 F9| B: |Bbmaj7|Am7
  // D7|Gm7|Bbm6|Am7|D7|Gm7|C9sus4 C9| (in two-chord bars the second chord arrives early, on the off-beat after
  // beat 2, played together by the bass, epiano and kick)
  // Form: No intro. L at bar 1, so the loop is all 16 bars (34.3 s at 112 BPM). A, bars 1-8: the vibes play the
  // hook. Bars 1-2 are the call, then bars 3-4 answer and end on C9. Bars 5-6 repeat the call, and bars 7-8 answer
  // and hand over to the flute, which has a two-note pickup in bar 8. Under it: syncopated finger bass, rootless
  // epiano comping, rim on beats 2 and 4, off-beat hats, and a small tom fill in bar 8. B, bars 9-16: the flute
  // plays a lyrical lead that rises to its peak G6 in bar 12 over Bbm6, then falls through Am7-D7-Gm7-C9 back to
  // F. The vibes rest in bars 9-12 and play 3rds and 6ths under the flute in bars 13-16. Also in B: walking bass,
  // soft snare on beats 2 and 4, 16th hats, a short crash at bar 9, and a fill in bar 16 that leads back to bar 1.
  D({
    id: 'select', no: 2, name: 'どこいこう', bpm: 112,
    echo: { delay: 0.27, fb: 0.3, wet: 0.3 },
    ch: [
      { // A hook melody (bars 1-8); 3rd/6th harmony under the flute (bars 13-16)
        inst: 'vibes', pan: 2, vol: 1, mml: `
        @vibes o5 l8 v11 q6
        L
        v11 q6 o5 r8 e8 g+16 a8. o6 c8 o5 a8 ^8 g8 |
        o5 r8 e-8 f+16 g8. b-8 g8 ^8 f8 |
        o5 a8 o6 c8 e16 f8. ^8 e8 d8 c8 |
        o5 b-8 a8 g8 e8 ^8 c8 r4 |
        o5 r8 e8 g+16 a8. o6 c8 o5 a8 ^8 g8 |
        o5 r8 e-8 f+16 g8. b-8 g8 ^8 f8 |
        o5 a8 o6 c8 e16 f8. ^8 e8 d8 o5 b8 |
        o6 c8 o5 b-8 g8 e-8 ^4 r4 |
        r1 |
        r1 |
        r1 |
        r1 |
        v9 q7 o5 a4. e8 c4 e4 |
        o5 d4. c8 d8 f+8 a4 |
        o5 g4. f8 d2 |
        o5 c2 o4 b-4 r4 |
      `},
      { // soft B lead (pickup in bar 8, then bars 9-16)
        inst: 'flute', pan: 0, vol: 1, mml: `
        @flute o5 l8 v11 q7
        L
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r2. o5 a8 o6 c8 |
        o6 c+16 d8. ^8 c8 o5 a4 f4 |
        o5 g4. e8 f+4 a4 |
        o5 b-4. a8 b-8 o6 d8 f4 |
        o6 g4. f8 d-4 ^8 c8 |
        o5 b16 o6 c8. ^8 o5 a8 e4 g4 |
        o5 f+4. e8 f+8 a8 o6 c4 |
        o5 b-4. a8 g4 f4 |
        o5 g4 f8 e8 ^4 r4 |
      `},
      { // rootless 3-note 7th/9th comping; hits beat 1 and the off-beat after beat 2 (A also hits the off-beat after beat 4)
        inst: 'epiano', pan: -3, vol: 0.9, mml: `
        @epiano o4 l8 v8 q6
        L
        o4 {cea}4 r8 {cea}8 ^4 r8 {cea}8 |
        o4 {d-fg}4 r8 {d-fg}8 ^4 r8 {d-fg}8 |
        o4 {cfa}4 r8 {cfa}8 ^4 r8 {cfa}8 |
        o4 {dfb-}4 r8 {deb-}8 ^4 r8 {deb-}8 |
        o4 {cea}4 r8 {cea}8 ^4 r8 {cea}8 |
        o4 {d-fg}4 r8 {d-fg}8 ^4 r8 {d-fg}8 |
        o4 {cfa}4 r8 {<b>fa}8 ^4 r8 {<b>fa}8 |
        o4 {<b->e-g}4 r8 {<a>e-g}8 ^4 r8 {<a>e-g}8 |
        o4 {<a>df}4 r8 {<a>df}8 ^4 r4 |
        o4 {ceg}4 r8 {cf+a}8 ^4 r4 |
        o4 {dfb-}4 r8 {dfb-}8 ^4 r4 |
        o4 {d-fg}4 r8 {d-fg}8 ^4 r4 |
        o4 {ceg}4 r8 {ceg}8 ^4 r4 |
        o4 {cf+a}4 r8 {cf+a}8 ^4 r4 |
        o4 {dfb-}4 r8 {dfb-}8 ^4 r4 |
        o4 {dfb-}4 r8 {deb-}8 ^4 r4 |
      `},
      { // syncopated finger bass in A; walking quarter notes with chromatic approaches in B
        inst: 'bass', pan: 0, vol: 1, mml: `
        @bass o2 l8 v12 q6
        L
        q6 o2 f8. f16 r8 o3 c8 ^8 o2 f8 a8 o3 c8 |
        o2 e-8. e-16 r8 b-8 ^8 e-8 g8 b-8 |
        o2 d8. d16 r8 a8 ^8 d8 f8 a8 |
        o2 g8. g16 r8 o3 c8 ^4 r8 o2 e8 |
        o2 f8. f16 r8 o3 c8 ^8 o2 f8 a8 o3 c8 |
        o2 e-8. e-16 r8 b-8 ^8 e-8 g8 b-8 |
        o2 d8. d16 r8 g8 ^4 r8 b8 |
        o3 c8. c16 r8 o2 f8 ^4 r8 a8 |
        q7 o2 b-4 o3 d4 f4 o2 b-4 |
        o2 a4 e4 d4 f+4 |
        o2 g4 o3 d4 o2 b-4 a4 |
        o2 b-4 o3 d-4 f4 o2 g4 |
        o2 a4 o3 c4 e4 c+4 |
        o3 d4 o2 f+4 a4 f+4 |
        o2 g4 b-4 o3 d4 o2 b4 |
        o3 c4 r8 o2 g8 ^4 e4 |
      `},
      { // kick + rim in A / soft snare in B, light tom fills in bars 8 and 16
        inst: 'drums', pan: 0, vol: 0.9, mml: `
        @drums l8
        L
        v13 b8 r8 v10 z8 v13 b8 r4 v10 z8 r8 |
        v13 b8 r8 v10 z8 v13 b8 r8 b8 v10 z8 z16 v8 z16 |
        v13 b8 r8 v10 z8 v13 b8 r4 v10 z8 r8 |
        v13 b8 r8 v10 z8 v13 b8 r8 b8 v10 z8 z16 v8 z16 |
        v13 b8 r8 v10 z8 v13 b8 r4 v10 z8 r8 |
        v13 b8 r8 v10 z8 v13 b8 r8 b8 v10 z8 z16 v8 z16 |
        v13 b8 r8 v10 z8 v13 b8 r4 v10 z8 r8 |
        v13 b8 r8 v10 z8 v13 b8 r8 v10 m16 m16 n16 n16 v11 s8 |
        v13 b8 r8 v10 s8 v13 b8 r4 v10 s8 r8 |
        v13 b8 r8 v10 s8 v13 b8 r8 b8 v10 s8 r8 |
        v13 b8 r8 v10 s8 v13 b8 r4 v10 s8 r8 |
        v13 b8 r8 v10 s8 v13 b8 r8 b8 v10 s8 r8 |
        v13 b8 r8 v10 s8 v13 b8 r4 v10 s8 r8 |
        v13 b8 r8 v10 s8 v13 b8 r8 b8 v10 s8 r8 |
        v13 b8 r8 v10 s8 v13 b8 r4 v10 s8 r8 |
        v13 b8 r8 v10 s8 v13 b8 r8 v9 s16 s16 v10 m16 m16 n8 |
      `},
      { // hats: accented off-beat 8ths in A with an open hat every 2nd bar; 8th + two 16ths per beat in B; short crash at bar 9
        inst: 'drums', pan: 2, vol: 0.8, mml: `
        @drums l8
        L
        [v7 h8 v9 h8]4 |
        [v7 h8 v9 h8]3 v7 h8 v9 j8 |
        [v7 h8 v9 h8]4 |
        [v7 h8 v9 h8]3 v7 h8 v9 j8 |
        [v7 h8 v9 h8]4 |
        [v7 h8 v9 h8]3 v7 h8 v9 j8 |
        [v7 h8 v9 h8]4 |
        [v7 h8 v9 h8]3 v7 h8 v9 j8 |
        v10 y4 [v8 h8 v6 h16 h16]3 |
        [v8 h8 v6 h16 h16]4 |
        [v8 h8 v6 h16 h16]4 |
        [v8 h8 v6 h16 h16]4 |
        [v8 h8 v6 h16 h16]4 |
        [v8 h8 v6 h16 h16]4 |
        [v8 h8 v6 h16 h16]4 |
        [v8 h8 v6 h16 h16]3 v8 h8 v9 j8 |
      `},
    ],
  });

  // ------------------------------------------------------------------ BGM 03 みずしぶき: the match (from GO; 15% faster in the last 15 s)
  // Key: E dorian (E minor); the anthem sections move to relative G major. Chords: intro: |Em|C D| A:
  // |Em7|A|Em7|A|C|D|Em7|C D| B: |G|D/F#|Em7|C D|G|D/F#|Am7|B7| C: |Em7|A/E|Em7|A/E|C|D|C|D| B': |G|D/F#|Em7|C
  // D|G|D/F#|Am7|B7|
  // Form: Intro bars 1-2: GO! hit on beat 1 (crash, Em brass kicks), lead splash run up, then the 3+3+2 'kick'
  // figure on C-D. L at start of bar 3. A riff 3-10: 2-bar hook E-G-A-B~ / C#~-B-A-E answered by a brass double
  // stab in the beat-3 gap (bars 3-6), the hook sequenced up a third over C-D (7-8), tresillo line and kicks on
  // C-D (9-10). B anthem 11-18 in G major: D~ B D E | F#~ E D A, then the AA' repeat climbs to the peak A6 (bar
  // 17) and holds the B7 leading tone D#6 (bar 18). C breakdown 19-26: lead out, marimba 16th water-drop ostinato,
  // slap bass riff, claps (19-22); brass call + lead 16th answer (23-25); kicks + tom fill (26). B' anthem climax
  // 27-34: anthem with bell doubling an octave up and sustained brass; bar 34 B7 arpeggio falls to F#5 and
  // resolves into the riff at bar 3. Loop = 32 bars = 49.2 s, intro 3.1 s.
  D({
    id: 'battle', no: 3, name: 'みずしぶき', bpm: 156,
    echo: { delay: 0.29, fb: 0.3, wet: 0.25 },
    ch: [
      { // main melody: A riff hook, B anthem, C answers, B' anthem
        inst: 'lead', pan: 0, vol: 1, mml: `
        @lead l8 v12 q7
        o4 r2 b16 > d16 e16 f+16 g16 a16 b16 > d16 |
        o6 e8. e8. e8 f+8. f+8. f+8 |
        L
        o5 e8 g16 a8 b8. > d8 < b8 a16 g16 a8 |
        o6 c+8. < b16 a8 e8 r8 a16 g16 f+8 g8 |
        o5 e8 g16 a8 b8. > e8 d8 < b16 a16 b8 |
        o6 c+8. < b16 a8 > e8 r8 c+16 < b16 a8 b8 |
        o5 g8 b16 > c8 d8. e8 d8 c16 < b16 > d8 |
        o6 f+8. e16 d8 < a8 r8 > d16 e16 f+8 e8 |
        o6 g8. f+8. e8 d8. < b8. > d8 |
        o6 e8. e8. e8 f+8. f+8. f+8 |
        o6 d2 r8 < b8 > d8 e8 |
        o6 f+4. e8 d4 < a4 |
        o5 b2 r8 g8 b8 > d8 |
        o6 e4 g4 f+4. e8 |
        o6 d2 r8 < b8 > d8 e8 |
        o6 f+4. e8 d8 e8 f+8 g8 |
        o6 a4. g8 e4. f+8 |
        o6 d+2. r4 |
        r1 |
        r1 |
        r1 |
        r1 |
        o6 r2 e16 d16 < b16 a16 g8 b8 |
        o6 r2 f+16 e16 d16 < b16 a8 > d8 |
        o6 r2 g16 f+16 e16 d16 e8 g8 |
        r1 |
        o6 d2 r8 < b8 > d8 e8 |
        o6 f+4. e8 d4 < a4 |
        o5 b2 r8 g8 b8 > d8 |
        o6 e4 g4 f+4. e8 |
        o6 d2 r8 < b8 > d8 e8 |
        o6 f+4. e8 d8 e8 f+8 g8 |
        o6 a4. g8 e4. f+8 |
        o6 d+4. < b8 a8 f+8 d+8 f+8 |
      `},
      { // B' only: doubles the anthem an octave up for the climax sparkle
        inst: 'bell', pan: 3, vol: 0.8, mml: `
        @bell l8 v7 q8
        r1 |
        r1 |
        L
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        o7 d2 r8 < b8 > d8 e8 |
        o7 f+4. e8 d4 < a4 |
        o6 b2 r8 g8 b8 > d8 |
        o7 e4 g4 f+4. e8 |
        o7 d2 r8 < b8 > d8 e8 |
        o7 f+4. e8 d8 e8 f+8 g8 |
        o7 a4. g8 e4. f+8 |
        o7 d+4. < b8 a8 f+8 d+8 f+8 |
      `},
      { // GO! hits and 3+3+2 kicks, answer stabs in the riff gaps, syncopated anthem pumps, C-section calls, sustained B' chords
        inst: 'brass', pan: -3, vol: 1, mml: `
        @brass l8 v10 q6
        o4 {gb>e}8. {gb>e}8. {gb>e}8 r2 |
        o4 {g>ce}8. {g>ce}8. {g>ce}8 {f+a>d}8. {f+a>d}8. {f+a>d}8 |
        L
        o4 {gb>d}8 r8 r8 {gb>d}8 r2 |
        o4 {a>c+e}8 r8 r4 {a>c+e}16 {a>c+e}16 r8 r4 |
        o4 {gb>d}8 r8 r8 {gb>d}8 r2 |
        o4 {a>c+e}8 r8 r4 {a>c+e}16 {a>c+e}16 r8 r4 |
        o4 {g>ce}8 r8 r8 {g>ce}8 r2 |
        o4 {f+a>d}8 r8 r4 {f+a>d}16 {f+a>d}16 r8 r4 |
        o4 {gb>d}8 r8 r8 {gb>d}8 {gb>d}8 r8 r4 |
        o4 {g>ce}8. {g>ce}8. {g>ce}8 {f+a>d}8. {f+a>d}8. {f+a>d}8 |
        o4 {gb>d}8 r8 r8 {gb>d}8 r8 {gb>d}8 r4 |
        o4 {f+a>d}8 r8 r8 {f+a>d}8 r8 {f+a>d}8 r4 |
        o4 {gb>d}8 r8 r8 {gb>d}8 r8 {gb>d}8 r4 |
        o4 {g>ce}8 r8 r8 {g>ce}8 {f+a>d}8 r8 {f+a>d}8 r8 |
        o4 {gb>d}8 r8 r8 {gb>d}8 r8 {gb>d}8 r4 |
        o4 {f+a>d}8 r8 r8 {f+a>d}8 r8 {f+a>d}8 r4 |
        o4 {g>ce}8 r8 r8 {g>ce}8 r8 {g>ce}8 r4 |
        o4 {f+a>d+}8 r8 r8 {f+a>d+}8 r8 {f+a>d+}8 r4 |
        r1 |
        o4 r2 r8 {a>c+e}8 r8 {a>c+e}8 |
        r1 |
        o4 r2 {a>c+e}16 {a>c+e}16 r8 {a>c+e}8 {a>c+e}8 |
        o4 {g>ce}8 {g>ce}16 {>ceg}8 {g>ce}8. r2 |
        o4 {a>df+}8 {a>df+}16 {>df+a}8 {a>df+}8. r2 |
        o4 {g>ce}8 {g>ce}16 {>ceg}8 {g>ce}8. r2 |
        o4 {a>df+}8. {a>df+}8. {a>df+}8 r2 |
        o4 {gb>d}2 r8 {gb>d}8 {gb>d}8 r8 |
        o4 {f+a>d}2 r8 {f+a>d}8 {f+a>d}8 r8 |
        o4 {gb>d}2 r8 {gb>d}8 {gb>d}8 r8 |
        o4 {g>ce}4. {g>ce}8 {f+a>d}4. {f+a>d}8 |
        o4 {gb>d}2 r8 {gb>d}8 {gb>d}8 r8 |
        o4 {f+a>d}2 r8 {f+a>d}8 {f+a>d}8 r8 |
        o4 {g>ce}2 r8 {g>ce}8 {g>ce}8 r8 |
        o4 {f+a>d+}2 r8 {f+a>d+}8 {f+a>d+}8 r8 |
      `},
      { // water-drop 8th arpeggios under A and B, featured 16th ostinato in the breakdown, rests in B' to make room for the bell
        inst: 'marimba', pan: 4, vol: 0.9, mml: `
        @marimba l8 v9 q8
        r1 |
        r1 |
        L
        o4 e8 g8 b8 > d8 e8 d8 < b8 g8 |
        o4 e8 a8 > c+8 e8 c+8 < a8 e8 a8 |
        o4 e8 g8 b8 > d8 e8 d8 < b8 g8 |
        o4 e8 a8 > c+8 e8 c+8 < a8 e8 a8 |
        o4 c8 e8 g8 > c8 e8 c8 < g8 e8 |
        o4 d8 f+8 a8 > d8 f+8 d8 < a8 f+8 |
        o4 e8 g8 b8 > d8 e8 d8 < b8 g8 |
        o5 e8. e8. e8 f+8. f+8. f+8 |
        o4 d8 g8 b8 > d8 g8 d8 < b8 g8 |
        o4 f+8 a8 > d8 f+8 a8 f+8 d8 < a8 |
        o4 e8 g8 b8 > d8 e8 d8 < b8 g8 |
        o4 e8 g8 > c8 e8 < d8 f+8 a8 > d8 |
        o4 d8 g8 b8 > d8 g8 d8 < b8 g8 |
        o4 f+8 a8 > d8 f+8 a8 f+8 d8 < a8 |
        o4 e8 a8 > c8 e8 g8 e8 c8 < a8 |
        o4 d+8 f+8 a8 b8 > d+8 < b8 a8 f+8 |
        v10 o5 e16 b16 g16 b16 > e16 < b16 g16 b16 e16 b16 g16 b16 > d16 < b16 g16 b16 |
        o5 e16 a16 > c+16 < a16 > e16 < a16 > c+16 < a16 e16 a16 > c+16 < a16 > e16 < a16 > c+16 < a16 |
        o5 e16 b16 g16 b16 > e16 < b16 g16 b16 e16 b16 g16 b16 > d16 < b16 g16 b16 |
        o5 e16 a16 > c+16 < a16 > e16 < a16 > c+16 < a16 e16 a16 > c+16 < a16 > e16 < a16 > c+16 < a16 |
        v9 o4 c8 e8 g8 > c8 e8 c8 < g8 e8 |
        o4 d8 f+8 a8 > d8 f+8 d8 < a8 f+8 |
        o4 c8 e8 g8 > c8 e8 c8 < g8 e8 |
        o4 f+8. f+8. f+8 r2 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
      `},
      { // syncopated slap-style octave groove (A), disco octaves (B/B'), pentatonic breakdown riff (C), walk-ups into each section
        inst: 'bass', pan: 0, vol: 1.05, mml: `
        @bass l8 v12 q6
        o2 e8. e8. e8 > e8 d8 < b8 a8 |
        o2 c8. c8. c8 d8. d8. d8 |
        L
        o2 e8. e16 r8 e8 e8 > e8 < d8 > d8 |
        o2 a8. a16 r8 a8 a8 > a8 < f+8 g8 |
        o2 e8. e16 r8 e8 e8 > e8 < d8 > d8 |
        o2 a8. a16 r8 a8 a8 > a8 < e8 d8 |
        o2 c8. c16 r8 c8 c8 > c8 < c8 > c8 |
        o2 d8. d16 r8 d8 d8 > d8 < d8 > d8 |
        o2 e8. e16 r8 e8 e8 > e8 < d8 > d8 |
        o2 c8. c8. c8 d8. d8. d8 |
        o2 g8 > g8 < g8 > g8 < g8 > g8 < g8 > g8 |
        o2 f+8 > f+8 < f+8 > f+8 < f+8 > f+8 < f+8 > f+8 |
        o2 e8 > e8 < e8 > e8 < e8 > e8 < e8 > e8 |
        o2 c8 > c8 < c8 > c8 < d8 > d8 < d8 > d8 |
        o2 g8 > g8 < g8 > g8 < g8 > g8 < g8 > g8 |
        o2 f+8 > f+8 < f+8 > f+8 < f+8 > f+8 < f+8 g8 |
        o2 a8 > a8 < a8 > a8 < a8 > a8 < a8 > a8 |
        o2 b8 > b8 < b8 > b8 < b8 > b8 < b8 > b8 |
        o2 e8 r16 e16 > e16 < r16 > d16 < e16 r16 e16 g16 a16 b8 > d16 e16 |
        o2 e8 r16 e16 > e16 < r16 > c+16 < e16 r16 e16 g16 a16 > c+8 e16 < b16 |
        o2 e8 r16 e16 > e16 < r16 > d16 < e16 r16 e16 g16 a16 b8 > d16 e16 |
        o2 e8 r16 e16 > e16 < r16 > c+16 < e16 r16 e16 g16 a16 > c+8 e16 < b16 |
        o2 c8 r16 c16 > c16 < r16 c8 r16 c16 c8 > c8 < e8 |
        o2 d8 r16 d16 > d16 < r16 d8 r16 d16 d8 > d8 < d8 |
        o2 c8 r16 c16 > c16 < r16 c8 r16 c16 c8 > c8 < e8 |
        o2 d8. d8. d8 r8 d8 e8 f+8 |
        o2 g8 > g8 < g8 > g8 < g8 > g8 < g8 > g8 |
        o2 f+8 > f+8 < f+8 > f+8 < f+8 > f+8 < f+8 > f+8 |
        o2 e8 > e8 < e8 > e8 < e8 > e8 < e8 > e8 |
        o2 c8 > c8 < c8 > c8 < d8 > d8 < d8 > d8 |
        o2 g8 > g8 < g8 > g8 < g8 > g8 < g8 > g8 |
        o2 f+8 > f+8 < f+8 > f+8 < f+8 > f+8 < f+8 g8 |
        o2 a8 > a8 < a8 > a8 < a8 > a8 < a8 > a8 |
        o2 b8 > b8 < b8 > b8 < b8 > b8 < a8 f+8 |
      `},
      { // kit: kick, snare backbeat, claps in the breakdown, tom fills at section ends
        inst: 'drums', pan: 0, vol: 1, mml: `
        @drums l8 v13
        b8. b8. b8 s16 s16 s16 s16 m16 m16 n16 n16 |
        b8. b8. s8 b8. b8. s16 s16 |
        L
        b8 r8 s8 b8 b8 r8 s8 r8 |
        b8 r8 s8 b8 b8 r8 s8 r8 |
        b8 r8 s8 b8 b8 r8 s8 r8 |
        b8 r16 b16 s8 b8 r8 b8 s8 s16 s16 |
        b8 r8 s8 b8 b8 r8 s8 r8 |
        b8 r8 s8 b8 b8 r8 s8 r8 |
        b8 r8 s8 b8 b8 r8 s8 r8 |
        b8. b8. s8 b8. b8. s16 s16 |
        b8 r8 s8 r16 b16 b8 r8 s8 r8 |
        b8 r8 s8 r16 b16 b8 r8 s8 r8 |
        b8 r8 s8 r16 b16 b8 r8 s8 r8 |
        b8 r8 s8 r16 b16 b8 r8 s8 s16 s16 |
        b8 r8 s8 r16 b16 b8 r8 s8 r8 |
        b8 r8 s8 r16 b16 b8 r8 s8 r8 |
        b8 r8 s8 r16 b16 b8 r8 s8 r8 |
        b8 r8 s8 b8 s16 s16 m16 m16 n16 n16 s16 s16 |
        b8 r16 b16 x8 r8 r16 b16 b8 x8 r8 |
        b8 r16 b16 x8 r8 r16 b16 b8 x8 r8 |
        b8 r16 b16 x8 r8 r16 b16 b8 x8 r8 |
        b8 r16 b16 x8 r8 m16 m16 n16 n16 x8 x16 x16 |
        b8 r8 s8 b8 b8 r8 s8 r8 |
        b8 r8 s8 b8 b8 r8 s8 r8 |
        b8 r8 s8 b8 b8 r8 s8 r8 |
        b8. b8. s8 s16 s16 m16 m16 n16 n16 s16 s16 |
        b8 r8 s8 r16 b16 b8 r8 s8 r8 |
        b8 r8 s8 r16 b16 b8 r8 s8 r8 |
        b8 r8 s8 r16 b16 b8 r8 s8 r8 |
        b8 r8 s8 r16 b16 b8 r8 s8 s16 s16 |
        b8 r8 s8 r16 b16 b8 r8 s8 r8 |
        b8 r8 s8 r16 b16 b8 r8 s8 r8 |
        b8 r8 s8 r16 b16 b8 r8 s8 r8 |
        b8 r8 s8 b8 s16 s16 s16 s16 m16 m16 n16 n16 |
      `},
      { // hats: galloping closed/open hats (A), off-beat open hats (B), 16ths with accents (C), crash at phrase starts so it can land with the kick
        inst: 'drums', pan: -2, vol: 0.85, mml: `
        @drums l8 v8
        v11 y2 v8 r2 |
        j8. j8. j8 j8. j8. j8 |
        L
        v11 y4 v8 h16 h16 j8 h16 h16 j8 h16 h16 j8 |
        [h16 h16 j8]4 |
        [h16 h16 j8]4 |
        [h16 h16 j8]4 |
        v11 y4 v8 h16 h16 j8 h16 h16 j8 h16 h16 j8 |
        [h16 h16 j8]4 |
        [h16 h16 j8]4 |
        j8. j8. j8 j8. j8. j8 |
        v11 y4 v8 h8 j8 h8 j8 h8 j8 |
        [h8 j8]4 |
        [h8 j8]4 |
        [h8 j8]4 |
        v11 y4 v8 h8 j8 h8 j8 h8 j8 |
        [h8 j8]4 |
        [h8 j8]4 |
        h8 j8 h8 j8 h16 h16 h16 h16 h8 h8 |
        v11 y4 [v8 h16 v6 h16]6 |
        [v8 h16 v6 h16]8 |
        [v8 h16 v6 h16]8 |
        [v8 h16 v6 h16]8 |
        v11 y4 v8 h16 h16 j8 h16 h16 j8 h16 h16 j8 |
        [h16 h16 j8]4 |
        [h16 h16 j8]4 |
        h8 h8 h8 h8 r2 |
        v11 y4 v8 h8 j8 h8 j8 h8 j8 |
        [h8 j8]4 |
        [h8 j8]4 |
        [h8 j8]4 |
        v11 y4 v8 h8 j8 h8 j8 h8 j8 |
        [h8 j8]4 |
        [h8 j8]4 |
        h8 j8 h8 j8 h16 h16 h16 h16 h8 h8 |
      `},
    ],
  });

  // ------------------------------------------------------------------ BGM 04 またあした: result screens (after the jingle)
  // Key: F major. Chords: intro: |C9sus4 C7| A: |Fmaj7|Am7|Bbmaj7|C7sus4 C7|Fmaj7|Am7 D7|Gm7 C7|F6 F7| B:
  // |Bbmaj7|C/Bb|Am7|D7|Gm7|Bbm6|Am7 Dm7|Gm7 C7|
  // Form: Bar 0: a 1-bar intro where the vibes play the lead-in (G-F-G-Bb) over C9sus4-C7. L at bar 1. A = bars
  // 1-8: hook phrase a (1-4), then a' (5-8) with a D7 turn and a cadence. The vibes answer at the ends of bars 4
  // and 7. Bars 1-4 are sparse (rim and off-beat hats); bars 5-8 have full 8th-note hats. There is a soft tom fill
  // in bar 8. B = bars 9-16: the strings counter-line enters, with soft snare and crashes at 9 and 13. Bars 9-12
  // are a rising sequence, the Bb5 peak comes at 13, the borrowed Bbm6 at 14, an echo of hook bar 2 at 15, and at
  // 16 the lead-in and fill return to bar 1. The loop is 16 bars, 40.0 s at 96 BPM.
  D({
    id: 'result', no: 4, name: 'またあした', bpm: 96,
    echo: { delay: 0.31, fb: 0.32, wet: 0.3 },
    ch: [
      { // main melody
        inst: 'flute', pan: 0, vol: 1, mml: `
        @flute l8 q7 v12
        o4 r1 |
        L v12 o4 a4. g8 a8 >c4. |
        o5 e4. d8 c8 <a4. |
        o5 d4. c8 d8 f4. |
        o5 c4 <b-4 g2 |
        o4 a4. g8 a8 >c4. |
        o5 e4. d8 c8 <a8 f+8 a8 |
        o4 b-4. a8 g8 e4. |
        o4 f2 r8 a8 >c8 e-8 |
        v13 o5 d2^8 c8 d8 f8 |
        o5 g2. e4 |
        o5 c2^8 <a8 >c8 e8 |
        o5 f+2. d4 |
        o5 b-4. a8 g4 d4 |
        o5 d-4. c8 d-4 f4 |
        o5 e4. d8 c8 <a4. |
        o4 g4. f8 g8 b-4. |
      `},
      { // intro lead-in, downbeat accents and rising answers in A
        inst: 'vibes', pan: 4, vol: 0.9, mml: `
        @vibes l8 v10
        o4 g4. f8 g8 b-4. |
        L o4 a4 r4 r2 |
        r1 |
        r2 r4 r8 o5 c8 |
        r2 r8 o5 e8 g8 b-8 |
        o5 a4 r4 r2 |
        r1 |
        r2 r8 o5 c8 e8 g8 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
      `},
      { // comping chords (lilting q.-8-r8-q. in A, pushed q.-8^4-q in B)
        inst: 'epiano', pan: -3, vol: 0.9, mml: `
        @epiano l8 q6 v8
        o3 {b->df}4. {b->df}8 r8 {b->ce}4. |
        L o3 {a>ce}4. {a>ce}8 r8 {a>ce}4. |
        o3 {>ceg}4. {>ceg}8 r8 {>ceg}4. |
        o3 {>dfa}4. {>dfa}8 r8 {>dfa}4. |
        o3 {b->df}4. {b->df}8 r8 {b->ce}4. |
        o3 {a>ce}4. {a>ce}8 r8 {a>ce}4. |
        o3 {>ceg}4. {>ceg}8 r8 {a>cf+}4. |
        o3 {b->df}4. {b->df}8 r8 {b->ce}4. |
        o3 {a>cd}4. {a>cd}8 r8 {a>ce-}4. |
        o3 {b->df}4. {b->df}8^4 {b->df}4 |
        o3 {b->ce}4. {b->ce}8^4 {b->ce}4 |
        o3 {a>ce}4. {a>ce}8^4 {a>ce}4 |
        o3 {a>cd}4. {a>cd}8^4 {a>cd}4 |
        o3 {b->dg}4. {b->dg}8^4 {b->dg}4 |
        o3 {b->d-g}4. {b->d-g}8^4 {b->d-g}4 |
        o3 {a>cg}4. {a>cg}8 {a>cd}4 {a>cd}4 |
        o3 {b->df}4. {b->df}8 {b->ce}4 {b->ce}4 |
      `},
      { // B-section warm counter-line (A-G-F#-F-E descent)
        inst: 'strings', pan: 3, vol: 0.85, mml: `
        @strings l1 q8 v9
        o4 r1 |
        L r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        r1 |
        o4 f2 a2 |
        o4 g1 |
        o4 e2 g2 |
        o4 f+1 |
        o4 f1 |
        o4 f1 |
        o4 e2 f2 |
        o4 f2 e2 |
      `},
      { // finger bass, bouncy root-octave-fifth in A, broad held roots with walk-ups in B
        inst: 'bass', pan: 0, vol: 1, mml: `
        @bass l8 q6 v12
        o2 c4. >c8 <b-4 g8 e8 |
        L o2 f4. >f8 c4 <f8 g8 |
        o2 a4. >a8 e4 <g8 a8 |
        o2 b-4. >b-8 f4 d8 <b-8 |
        o3 c4. c8 <b-4 g8 e8 |
        o2 f4. >f8 c4 <f8 g8 |
        o2 a4. >a8 d4 <a8 f+8 |
        o2 g4. >g8 c4 <g8 e8 |
        o2 f4. >f8 c4 e-8 <c8 |
        o1 b-2^8 >f8 a8 f8 |
        o1 b-2^8 >g8 e8 c8 |
        o1 a2^8 >e8 g8 e8 |
        o2 d2^8 f+8 a8 f+8 |
        o2 g2^8 f8 d8 f8 |
        o2 b-2^8 f8 g8 b-8 |
        o2 a4. e8 d4 a8 f8 |
        o2 g4. >g8 c4 <g8 e8 |
      `},
      { // kick + rim (A) / soft snare (B), tom fills at bars 8 and 16
        inst: 'drums', pan: 0, vol: 0.9, mml: `
        @drums l8 v12
        r2 r8 v11 b8 v9 z4 |
        L v12 b4 v10 z4 r8 v11 b8 v10 z4 |
        v12 b4 v10 z4 r8 v11 b8 v10 z4 |
        v12 b4 v10 z4 r8 v11 b8 v10 z4 |
        v12 b4 v10 z4 r8 v11 b8 v10 z4 |
        v12 b4 v10 z4 r8 v11 b8 v10 z4 |
        v12 b4 v10 z4 r8 v11 b8 v10 z4 |
        v12 b4 v10 z4 r8 v11 b8 v10 z4 |
        v12 b4 v10 z4 r8 v9 m16 m16 v10 n8 n8 |
        v12 b4 v10 s4 r8 v11 b8 v10 s4 |
        v12 b4 v10 s4 r8 v11 b8 v10 s4 |
        v12 b4 v10 s4 r8 v11 b8 v10 s4 |
        v12 b4 v10 s4 r8 v11 b8 v10 s8 b8 |
        v12 b4 v10 s4 r8 v11 b8 v10 s4 |
        v12 b4 v10 s4 r8 v11 b8 v10 s4 |
        v12 b4 v10 s4 r8 v11 b8 v10 s4 |
        v12 b4 v10 s4 r8 v11 b8 v9 m16 m16 n16 n16 |
      `},
      { // hats (off-beat in bars 1-4, straight 8ths after), soft crashes at 9 and 13
        inst: 'drums', pan: -2, vol: 0.8, mml: `
        @drums l8 v7
        r2 r8 h8 r8 h8 |
        L r8 h8 r8 h8 r8 h8 r8 h8 |
        r8 h8 r8 h8 r8 h8 r8 h8 |
        r8 h8 r8 h8 r8 h8 r8 h8 |
        r8 h8 r8 h8 r8 h8 r8 h8 |
        h8 h8 h8 h8 h8 h8 h8 h8 |
        h8 h8 h8 h8 h8 h8 h8 h8 |
        h8 h8 h8 h8 h8 h8 h8 h8 |
        h8 h8 h8 h8 h8 h8 h8 j8 |
        v9 y2. v7 h8 h8 |
        h8 h8 h8 h8 h8 h8 h8 j8 |
        h8 h8 h8 h8 h8 h8 h8 h8 |
        h8 h8 h8 h8 h8 h8 h8 j8 |
        v9 y2. v7 h8 h8 |
        h8 h8 h8 h8 h8 h8 h8 j8 |
        h8 h8 h8 h8 h8 h8 h8 h8 |
        h8 h8 h8 h8 h8 h8 r4 |
      `},
    ],
  });

})();
