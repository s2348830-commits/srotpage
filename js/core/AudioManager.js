/* ============================================================
 * js/core/AudioManager.js  ―  音声再生管理
 *  - BGM（ループ）
 *  - キャラボイス / 効果音
 *  - iPhone等の自動再生制限対策:
 *    最初のユーザー操作(タップ/クリック)時に無音ファイルで
 *    Audio要素プールを「プライミング(解錠)」しておき、
 *    以降はジェスチャ外(リール停止後・AUTO中)でも再生可能にする。
 *  - 演出中もゲームループを止めない非同期再生
 * ============================================================ */
(function () {
  'use strict';

  /* 無音WAV（プライミング用） */
  const SILENT =
    'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

  const POOL_SIZE = 6;
  const pool = [];
  let poolIndex = 0;
  let bgmEl = null;
  let bgmUrl = null;
  let unlocked = false;
  let audioCtx = null;          // ナビ音などの合成SE用WebAudio

  function getCtx() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) {
      try { audioCtx = new AC(); } catch (e) { return null; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }

  function makeAudio() {
    const a = new Audio();
    a.preload = 'auto';
    a.setAttribute('playsinline', '');
    return a;
  }
  for (let i = 0; i < POOL_SIZE; i++) pool.push(makeAudio());
  bgmEl = makeAudio();
  bgmEl.loop = true;
  bgmEl.volume = 0.5;

  /* ユーザー操作中に呼ぶと要素が解錠され、以後いつでも再生できる */
  function prime(el) {
    try {
      el.muted = true;
      el.src = SILENT;
      const p = el.play();
      if (p && p.then) {
        p.then(() => { el.pause(); el.muted = false; })
         .catch(() => { el.muted = false; });
      } else {
        el.pause(); el.muted = false;
      }
    } catch (e) { /* noop */ }
  }

  const AM = {
    /* ユーザー操作(クリック/タップ/キー)起点で呼ぶ */
    unlock() {
      if (unlocked) {
        if (bgmEl && bgmUrl && bgmEl.paused) bgmEl.play().catch(() => {});
        return;
      }
      unlocked = true;
      pool.forEach(prime);
      getCtx();               // 合成SE用のAudioContextもユーザー操作中に解錠
      // BGMは直後に playBgm が呼ばれる場合があるためプライミングしない
      // （src差し替えで直接再生。ジェスチャ内なら許可される）
    },

    /* ---- 開花ナビ音（でゅるるるどーん）: WebAudioで合成再生 ---- */
    playNaviSound() {
      if (!unlocked) return;
      const ctx = getCtx();
      if (!ctx) return;
      try {
        const now = ctx.currentTime;

        // 1.「でゅるるる」(0〜0.4秒)
        const duruOsc = ctx.createOscillator();
        const duruGain = ctx.createGain();
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        duruOsc.type = 'sawtooth';
        duruOsc.frequency.setValueAtTime(350, now);
        duruOsc.frequency.linearRampToValueAtTime(220, now + 0.4);
        lfo.frequency.setValueAtTime(38, now);           // 巻き舌感
        lfoGain.gain.setValueAtTime(120, now);
        duruGain.gain.setValueAtTime(0.15, now);
        duruGain.gain.setValueAtTime(0.15, now + 0.2);
        duruGain.gain.linearRampToValueAtTime(0, now + 0.4);
        lfo.connect(lfoGain);
        lfoGain.connect(duruOsc.frequency);
        duruOsc.connect(duruGain);
        duruGain.connect(ctx.destination);
        lfo.start(now); duruOsc.start(now);
        lfo.stop(now + 0.4); duruOsc.stop(now + 0.4);

        // 2.「どーん」(0.2〜2.0秒)
        const doonOsc = ctx.createOscillator();
        const doonGain = ctx.createGain();
        doonOsc.type = 'triangle';
        doonOsc.frequency.setValueAtTime(130, now + 0.2);
        doonOsc.frequency.exponentialRampToValueAtTime(30, now + 1.2);
        doonGain.gain.setValueAtTime(0, now);
        doonGain.gain.setValueAtTime(0.5, now + 0.2);
        doonGain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
        doonOsc.connect(doonGain);
        doonGain.connect(ctx.destination);
        doonOsc.start(now + 0.2);
        doonOsc.stop(now + 2.0);
      } catch (e) { /* noop */ }
    },

    /** BGM再生（ループ）。同じURLなら再開のみ */
    playBgm(url) {
      if (!url) return;
      if (bgmUrl === url) {
        if (unlocked && bgmEl.paused) bgmEl.play().catch(() => {});
        return;
      }
      bgmUrl = url;
      try {
        bgmEl.src = url;
        bgmEl.loop = true;
        if (unlocked) bgmEl.play().catch(() => {});
      } catch (e) { /* noop */ }
      ResourceManager.load(url, 5); // キャッシュへ（先読み）
    },

    stopBgm() {
      try { bgmEl.pause(); } catch (e) {}
      bgmUrl = null;
    },

    /** ボイス・SE再生（プライミング済みプールから再生） */
    playVoice(url, volume) {
      if (!url || !unlocked) return;
      if (ResourceManager.isFailed(url)) return;
      try {
        const a = pool[poolIndex++ % POOL_SIZE];
        a.src = url;
        a.volume = volume == null ? 0.9 : volume;
        a.play().catch(() => {});
      } catch (e) { /* noop */ }
    },

    isUnlocked() { return unlocked; }
  };

  window.AudioManager = AM;
})();
