/* ============================================================
 * js/game/Director.js  ―  演出制御（一発台版）
 *
 * ■ image/レバー, image/1, image/2, image/3 フォルダのMP4を使用
 *   （フォルダは演出段階、ファイル名の番号が1G演出セットの番号）
 *   例: image/レバー/1.mp4, image/1/1.mp4, image/2/1.mp4, image/3/1.mp4
 *       → すべて「番号1」の1G演出セット
 * ■ 同じ番号のファイル名を1G演出セットとして扱う
 *   さらに image/background/番号.png または image/background/番号.mp4
 *   （例: image/background/1.png, image/background/1.mp4）が存在すれば、
 *   その番号のセットの背景として自動的にペアで扱う。
 *   背景がmp4の場合は終了0.01秒手前で自動停止し、最終フレームを維持し続ける。
 * ■ ファイル追加で自動的に演出が増える
 * ■ プッシュボタン演出: 当たり確定時に image/push.mp4 を再生
 * ■ 黒背景はscreen合成で透明化
 * ■ 背景画像・動画とも枠(コンテナ)いっぱいに強制フィット(object-fit:fill)
 * ■ 演出セット(mp4)とは別に「台演出」(GAME_DATA.cabinetEffects)があり、
 *   pickPerformance()で同じ期待度抽選プールからまとめて1つだけ選ばれるため、
 *   演出セットのmp4と台演出が同じGで重複することはない
 * ■ 台演出が選ばれたGでは、image/background内で番号対応と無関係に
 *   独立検出したpng/mp4(GAME_DATA.cabinetBackgrounds)からランダムに
 *   1つ選んで背景として表示する(playCabinetBackground)
 * ■ 管理者ツールでGAME_DATA.forcedNextPerformanceを設定すると、
 *   pickPerformance()は抽選より優先してそれを1回だけ返す
 * ============================================================ */
(function () {
  'use strict';

  /* 現在再生中の動画要素を追跡 */
  let currentVideos = [];

  /* スクリーン合成で黒背景を透明化して動画を再生する
   * ※ 動画は最後まで自然再生させず、終了0.01秒前で一時停止して
   *    最終フレームのまま維持する（endedによる消去・巻き戻りを防ぐ） */
  function playVideoScreen(url, container, onEnd) {
    if (!url) { if (onEnd) onEnd(); return null; }
    ResourceManager.load(url, 10).then(el => {
      if (!el || ResourceManager.isFailed(url)) {
        if (onEnd) onEnd();
        return;
      }
      const v = document.createElement('video');
      v.src = url;
      v.muted = true;
      v.loop = false;
      v.playsInline = true;
      v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:fill;mix-blend-mode:screen;filter:contrast(1.15) brightness(1.02);';

      let done = false;
      let timeUpdateHandler = null;

      /* 停止＝最終フレームで維持。DOMからは消さない（clearAllVideosが呼ばれるまで残す） */
      const freezeAndFinish = () => {
        if (done) return;
        done = true;
        if (timeUpdateHandler) v.removeEventListener('timeupdate', timeUpdateHandler);
        try { v.pause(); } catch (e) {}
        if (onEnd) onEnd();
      };

      /* 動画の長さが判明したら、終了0.01秒手前で停止するよう監視 */
      v.addEventListener('loadedmetadata', () => {
        const dur = v.duration;
        if (!isFinite(dur) || dur <= 0) return; // 長さ不明時はendedフォールバックに任せる
        const stopAt = Math.max(0, dur - 0.01);
        timeUpdateHandler = () => {
          if (v.currentTime >= stopAt) freezeAndFinish();
        };
        v.addEventListener('timeupdate', timeUpdateHandler);
      }, { once: true });

      /* durationが取得できない環境向けのフォールバック（このendedでも消去はしない） */
      v.addEventListener('ended', freezeAndFinish, { once: true });
      v.addEventListener('error', freezeAndFinish, { once: true });
      setTimeout(freezeAndFinish, 30000); // 安全弁

      /* 直前まで最終フレームで止まっていた動画があれば、ここで破棄してから新しい動画を追加する */
      clearContainerVideos(container);
      container.appendChild(v);
      currentVideos.push(v);
      try { v.currentTime = 0; } catch (e) {}
      v.play().catch(freezeAndFinish);
    });
  }

  /* 通常の動画再生（背景演出として使用）
   * ※ playVideoScreenと同様、終了0.01秒前で一時停止し最終フレームを維持する */
  function playVideoNormal(url, container, onEnd) {
    if (!url) { if (onEnd) onEnd(); return; }

    const v = document.createElement('video');
    v.src = url;
    v.muted = true;
    v.loop = false;
    v.playsInline = true;
    v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:fill;';

    let done = false;
    let timeUpdateHandler = null;

    const freezeAndFinish = () => {
      if (done) return;
      done = true;
      if (timeUpdateHandler) v.removeEventListener('timeupdate', timeUpdateHandler);
      try { v.pause(); } catch (e) {}
      if (onEnd) onEnd();
    };

    v.addEventListener('loadedmetadata', () => {
      const dur = v.duration;
      if (!isFinite(dur) || dur <= 0) return;
      const stopAt = Math.max(0, dur - 0.01);
      timeUpdateHandler = () => {
        if (v.currentTime >= stopAt) freezeAndFinish();
      };
      v.addEventListener('timeupdate', timeUpdateHandler);
    }, { once: true });

    v.addEventListener('ended', freezeAndFinish, { once: true });
    v.addEventListener('error', freezeAndFinish, { once: true });
    setTimeout(freezeAndFinish, 30000);

    /* 直前まで最終フレームで止まっていた動画があれば、ここで破棄してから新しい動画を追加する */
    clearContainerVideos(container);
    container.appendChild(v);
    currentVideos.push(v);
    try { v.currentTime = 0; } catch (e) {}
    v.play().catch(freezeAndFinish);
  }

  /* 全動画停止・クリア */
  function clearAllVideos() {
    currentVideos.forEach(v => {
      try { v.pause(); } catch (e) {}
      if (v.parentNode) v.parentNode.removeChild(v);
    });
    currentVideos = [];
  }

  /* 指定コンテナ内に残っている（停止済み＝最終フレーム維持中の）動画を破棄する。
   * 新しい演出動画を再生する直前に呼び出すことで、
   * 「止めた動画」が次の演出開始時にきちんと消去されるようにする。 */
  function clearContainerVideos(container) {
    if (!container) return;
    const olds = Array.from(container.querySelectorAll('video'));
    olds.forEach(v => {
      try { v.pause(); } catch (e) {}
      if (v.parentNode) v.parentNode.removeChild(v);
      const idx = currentVideos.indexOf(v);
      if (idx !== -1) currentVideos.splice(idx, 1);
    });
  }

  /* 演出セットの背景画像(background PNG)を指定コンテナに表示する。
   * 枠いっぱいに強制フィット(object-fit:fill)させ、mp4演出はこの上に重ねる。
   * 既存の背景画像があれば先に破棄してから差し替える。 */
  function showBackgroundImage(url, container) {
    if (!container) return null;
    const olds = Array.from(container.querySelectorAll('img'));
    olds.forEach(img => { if (img.parentNode) img.parentNode.removeChild(img); });

    if (!url) return null;

    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:fill;';
    container.appendChild(img);
    return img;
  }

  /* 演出セットのmp4パス（例: image/レバー/1.mp4, image/1/1.mp4 など）から
   * 「ファイル名の番号」を取り出す。フォルダ名（レバー/1/2/3）は演出段階を表し、
   * ファイル名の数字（1.mp4, 2.mp4...）が1G演出セットの番号になる。
   * lever→s1→s2→s3の順に、最初に見つかったファイル名番号を採用する。 */
  function getEffectSetNumber(effectSet) {
    if (!effectSet) return null;
    const candidates = [effectSet.lever, effectSet.s1, effectSet.s2, effectSet.s3];
    for (let i = 0; i < candidates.length; i++) {
      const url = candidates[i];
      if (!url) continue;
      const m = String(url).match(/([^\/\\]+?)\.mp4(?:[?#].*)?$/i);
      if (m && /^\d+$/.test(m[1])) return m[1];
    }
    return null;
  }

  /* 演出セットに対応する背景（画像 or 動画）情報を求める。
   * effectSet.bg が明示的に設定されていればそれを優先し(effects.jsの自動検出結果。
   * bgType で 'image'/'video' を判別)、なければファイル名番号から
   * image/background/番号.png を自動的に組み立てる（互換フォールバック）。
   * 戻り値: { url, type: 'image'|'video' } | null */
  function getBackgroundInfo(effectSet) {
    if (!effectSet) return null;
    if (Object.prototype.hasOwnProperty.call(effectSet, 'bg')) {
      if (!effectSet.bg) return null; // 検出済み＝この番号には背景が無いことが確定している
      return { url: effectSet.bg, type: effectSet.bgType === 'video' ? 'video' : 'image' };
    }
    if (effectSet.background) {
      return {
        url: effectSet.background,
        type: /\.mp4(?:[?#].*)?$/i.test(effectSet.background) ? 'video' : 'image'
      };
    }
    const num = getEffectSetNumber(effectSet);
    if (num === null) return null;
    return { url: `image/background/${num}.png`, type: 'image' };
  }

  /* 背景レイヤーに残っている画像・動画（前ゲームの背景）を完全に取り除く */
  function clearBackgroundLayer(container) {
    if (!container) return;
    clearContainerVideos(container);
    const olds = Array.from(container.querySelectorAll('img'));
    olds.forEach(img => { if (img.parentNode) img.parentNode.removeChild(img); });
  }

  const Director = {
    /* ---- 演出選択 ----
     * 通常の演出セット(mp4、番号ごと)と「台演出」(GAME_DATA.cabinetEffects)を、
     * 同じ期待度(GAME_DATA.config.effectExpectations, 1〜100)のプールから
     * まとめて1回の重み付き抽選で選ぶ。値が未設定の演出はdefaultEffectExpectation扱い。
     * こうして必ずどちらか一方だけが選ばれるため、mp4の演出セットと台演出が
     * 同じGで重複して表示されることはない。
     * ただし GAME_DATA.forcedNextPerformance に{kind,key}がセットされている場合は
     * 抽選より優先してそれを返し、使用後は自動的に解除する
     * （管理者ツール「▶ 次の演出を指定」から設定）。
     * ※あくまで「どの演出が表示されるか」だけの重みであり、
     *   内部抽選(Lottery)の当否確率には一切影響しない。
     * 戻り値: { kind:'set', key, data:effectSetObj }
     *       | { kind:'cabinet', key, data:cabinetEffectObj }
     *       | null（候補が1つも無い場合） */
    pickPerformance() {
      const sets = GAME_DATA.effectSets || [];
      const cabinets = GAME_DATA.cabinetEffects || [];

      const candidates = [];
      sets.forEach(s => candidates.push({ kind: 'set', key: String(s.no), data: s }));
      cabinets.forEach(c => candidates.push({ kind: 'cabinet', key: String(c.id), data: c }));
      if (candidates.length === 0) return null;

      /* 管理者ツール「▶ 次の演出を指定」で強制指定されている場合は最優先で使用する。
       * 一度使われたら自動的に解除され、以降は通常の重み付き抽選に戻る
       * （内部抽選(当たり/はずれ)には一切影響しない、演出選択のみの上書き）。 */
      const forced = GAME_DATA.forcedNextPerformance;
      if (forced) {
        GAME_DATA.forcedNextPerformance = null; // 1回限りなので即座に解除
        const match = candidates.find(c => c.kind === forced.kind && c.key === String(forced.key));
        if (match) return match;
        /* 指定先が見つからない（削除済み等）場合は通常抽選にフォールバック */
      }

      const cfg = GAME_DATA.config || {};
      const expectations = cfg.effectExpectations || {};
      const defaultExp = cfg.defaultEffectExpectation || 50;

      const weights = candidates.map(c => {
        const raw = expectations[c.key];
        const num = Number(raw);
        return (raw !== undefined && raw !== null && !isNaN(num) && num > 0) ? num : defaultExp;
      });
      const total = weights.reduce((a, b) => a + b, 0);
      if (total <= 0) return RNG.pick(candidates);

      let r = RNG.int(1, total);
      for (let i = 0; i < candidates.length; i++) {
        r -= weights[i];
        if (r <= 0) return candidates[i];
      }
      return candidates[candidates.length - 1]; // 端数調整のフォールバック
    },

    /* ---- レバーON演出再生 ----
     * 1G演出セットの開始地点なので、ここで対応する背景画像
     * (image/background/番号.png)をbackground-layerに表示し、
     * その上にレバー演出mp4を重ねる。 */
    playLeverEffect(effectSet, onEnd) {
      if (!effectSet) { if (onEnd) onEnd(); return; }
      const effectLayer = document.getElementById('effect-layer');
      if (!effectLayer) { if (onEnd) onEnd(); return; }

      const bgLayer = document.getElementById('background-layer');
      if (bgLayer) {
        bgLayer.style.cssText = 'position:absolute;inset:0;z-index:2;';
        clearBackgroundLayer(bgLayer);
        const bgInfo = getBackgroundInfo(effectSet);
        if (bgInfo && bgInfo.type === 'video') {
          /* 背景mp4: 通常再生（screen合成なし）。
           * playVideoNormalの仕組みにより、終了0.01秒手前で自動的に一時停止し
           * 最終フレームのまま表示され続ける（ループ・巻き戻りはしない）。 */
          playVideoNormal(bgInfo.url, bgLayer, null);
        } else {
          showBackgroundImage(bgInfo ? bgInfo.url : null, bgLayer);
        }
      }

      effectLayer.style.cssText = 'position:absolute;inset:0;z-index:3;mix-blend-mode:screen;';
      playVideoScreen(effectSet.lever, effectLayer, onEnd);
    },

    /* ---- 台演出用ランダム背景表示 ----
     * 台演出（GAME_DATA.cabinetEffects）が選ばれたGでは演出セットmp4が無いため
     * 背景も表示されないが、GAME_DATA.cabinetBackgrounds（image/background内で
     * 独立検出したpng/mp4）からランダムに1つ選んでbackground-layerに表示する。
     * 演出セット側のgetBackgroundInfo()とは異なり、番号の対応関係は問わない。
     * 候補が1つも検出されていない場合は何もしない（背景なしのまま）。 */
    playCabinetBackground() {
      const bgLayer = document.getElementById('background-layer');
      if (!bgLayer) return;

      const list = GAME_DATA.cabinetBackgrounds || [];
      bgLayer.style.cssText = 'position:absolute;inset:0;z-index:2;';
      clearBackgroundLayer(bgLayer);
      if (list.length === 0) return;

      const picked = RNG.pick(list);
      if (picked.type === 'video') {
        /* playVideoNormalの仕組みにより、終了0.01秒手前で自動的に一時停止し
         * 最終フレームのまま表示され続ける（ループ・巻き戻りはしない）。 */
        playVideoNormal(picked.url, bgLayer, null);
      } else {
        showBackgroundImage(picked.url, bgLayer);
      }
    },

    /* ---- 第1停止後の演出再生 ---- */
    playStop1Effect(effectSet, onEnd) {
      if (!effectSet) { if (onEnd) onEnd(); return; }
      const effectLayer = document.getElementById('effect-layer');
      if (!effectLayer) { if (onEnd) onEnd(); return; }
      playVideoScreen(effectSet.s1, effectLayer, onEnd);
    },

    /* ---- 第2停止後の演出再生 ---- */
    playStop2Effect(effectSet, onEnd) {
      if (!effectSet) { if (onEnd) onEnd(); return; }
      const effectLayer = document.getElementById('effect-layer');
      if (!effectLayer) { if (onEnd) onEnd(); return; }
      playVideoScreen(effectSet.s2, effectLayer, onEnd);
    },

    /* ---- 第3停止後の演出再生 ----
     * s3動画が完全に終了（最終フレーム維持）してから
     * 続けてHIT演出(playHitEffect)を再生し、その完了後にonEndを呼ぶ。
     * こうすることで、呼び出し元(main.js等)が結果表示などの次の処理へ
     * 進むタイミングは「s3演出＋HIT演出が両方終わった後」に一本化され、
     * 第3停止の演出がフェードアウト前に打ち切られることがなくなる。 */
    playStop3Effect(effectSet, onEnd) {
      const effectLayer = document.getElementById('effect-layer');
      if (!effectSet || !effectLayer) {
        /* 台演出（または演出なし）の場合でも、
         * 第3停止直後のHIT演出(image/hit/N.mp4)は必ず再生する */
        this.playHitEffect(onEnd);
        return;
      }
      playVideoScreen(effectSet.s3, effectLayer, () => {
        this.playHitEffect(onEnd);
      });
    },

    /* ---- HIT演出: 第3停止演出の終了直後に再生 ----
     * image/hit/1.mp4, image/hit/2.mp4, image/hit/3.mp4 の中からランダムに1本選び、
     * PUSH演出と同じくcrack-layerにscreen合成で再生する（黒背景を透明化）。
     * 該当ファイルが存在しない場合はResourceManagerの読み込み失敗判定により
     * 何も再生せずそのままonEndへ進む。 */
    playHitEffect(onEnd) {
      const n = RNG.int(1, 3);
      const url = `image/hit/${n}.mp4`;
      const crackLayer = document.getElementById('crack-layer');
      if (!crackLayer) { if (onEnd) onEnd(); return; }

      crackLayer.style.cssText =
        'position:absolute;inset:0;z-index:8;pointer-events:none;mix-blend-mode:screen;';
      crackLayer.classList.add('show');

      playVideoScreen(url, crackLayer, () => {
        crackLayer.classList.remove('show');
        if (onEnd) onEnd();
      });
    },

    /* ---- PUSH演出: 当たり確定時に image/push.mp4 をscreen合成で再生 ---- */
    playPushEffect(onEnd) {
      const url = GAME_DATA.pushEffectVideo;
      const crackLayer = document.getElementById('crack-layer');
      if (!crackLayer || !url) { if (onEnd) onEnd(); return; }

      crackLayer.style.cssText =
        'position:absolute;inset:0;z-index:8;pointer-events:none;mix-blend-mode:screen;';
      crackLayer.classList.add('show');

      playVideoScreen(url, crackLayer, () => {
        crackLayer.classList.remove('show');
        if (onEnd) onEnd();
      });
    },

    /* ---- 演出レイヤーをクリア ---- */
    clearEffects() {
      clearAllVideos();
      const effectLayer = document.getElementById('effect-layer');
      if (effectLayer) effectLayer.innerHTML = '';
      const crackLayer = document.getElementById('crack-layer');
      if (crackLayer) { crackLayer.innerHTML = ''; crackLayer.classList.remove('show'); }
      const bgLayer = document.getElementById('background-layer');
      if (bgLayer) bgLayer.innerHTML = '';
    }
  };

  window.Director = Director;
})();