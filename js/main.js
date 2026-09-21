/* ============================================================
 * js/main.js  ―  一発台ゲームループ
 *
 * ゲームフロー:
 *   待機 → レバーON → 内部抽選(1/1000) → 演出選択(演出セット or 台演出)
 *   → レバー演出再生 → 第1停止 → 第2停止 → 第3停止
 *   → 当否表示 → ゲーム終了（その日プレイ不可）
 *
 * ■ 1日1回制限（localStorage）
 * ■ 第1停止で左以外 → 黒背景＋「左押し推奨」を表示し、
 *   内部結果(当たり/はずれ)は変えずにリールを再度回転させる
 *   （左を最初に押すまで、このGの中で何度でも繰り返す＝再抽選はしない）
 *   ※台演出「押し順ナビ」「リール暗転」中はこのチェックを行わない
 * ■ プッシュボタン演出: 1/15で発生。純粋な見た目の煽り演出で当否は一切変えない
 *   （当たり確定時のみpush.mp4を再生。実際の当選確率は常にnormalWinRate=1/1000）
 * ■ 演出（演出セットmp4／台演出）・押し順によって内部抽選結果を変更しない
 * ■ 台演出（リール暗転・押し順ナビ・シェイクビジョン）は演出セット(mp4)と
 *   同じ抽選プールから選ばれるため、mp4の演出セットと台演出が
 *   同じGで重複することはない
 * ============================================================ */
(function () {
  'use strict';

  let phase = 'boot';         // boot / idle / lever / spinning / warning / result / finished
  let currentEffectSet = null;      // 選ばれた演出セット(mp4)。台演出が選ばれた場合はnull
  let currentCabinetEffect = null;  // 選ばれた台演出({id:'reelDark'|'oshijun'|'shakeVision'|'titleFlip',...})。演出セットが選ばれた場合はnull
  let lastTs = 0;
  let stopPressCount = 0;

  /* 第3停止演出(s3+HIT)の完了と、全リール停止（メカ的な停止）の完了を
   * 両方待ってから当否表示に進むための同期用フラグ。
   * これにより「リールは止まったが演出動画はまだ再生中」という状態で
   * 演出が打ち切られることがなくなる。 */
  let stop3EffectDone = false;
  let reelsStoppedResult = null; // {win:boolean} 全リール停止が確定した時点でセット

  /* ================= ゲームループ（常時継続） ================= */
  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    Reels.update(dt);
    requestAnimationFrame(loop);
  }

  /* ================= レバーON ================= */
  function onLever() {
    if (phase !== 'idle') return;
    phase = 'lever';
    AudioManager.unlock();

    /* レバーアニメーション */
    const leverEl = document.getElementById('lever-btn');
    if (leverEl) {
      leverEl.classList.remove('pulled');
      void leverEl.offsetWidth;
      leverEl.classList.add('pulled');
      setTimeout(() => leverEl.classList.remove('pulled'), 650);
    }

    UI.clearStopPressed();
    UI.hideResult();
    UI.setLeverEnabled(false);
    UI.setAllStops(false);

    /* 演出をランダムに選択（演出セットmp4 or 台演出のどちらか一方。かぶらない） */
    const picked = Director.pickPerformance();
    if (picked && picked.kind === 'set') {
      currentEffectSet = picked.data;
      currentCabinetEffect = null;
    } else if (picked && picked.kind === 'cabinet') {
      currentEffectSet = null;
      currentCabinetEffect = picked.data;
    } else {
      currentEffectSet = null;
      currentCabinetEffect = null;
    }

    /* 台演出が選ばれた場合: image/background内で独立検出した背景から
     * ランダムに1つ表示する（演出セットmp4には自前の背景があるため対象外）*/
    if (currentCabinetEffect) {
      Director.playCabinetBackground();
    }

    /* 台演出「タイトル画像切替」: レバーを下げた1Gの間、title.pngをtitle2.pngに差し替える */
    if (currentCabinetEffect && currentCabinetEffect.id === 'titleFlip') {
      UI.showTitleFlip();
    }

    /* 内部抽選（レバーON時点で確定）*/
    const st = GameState.processLeverOn(currentEffectSet);

    UI.showSpinning();
    stopPressCount = 0;

    /* リール回転開始（最終結果に基づく停止目標を設定）*/
    Reels.startSpin(st.finalResult);

    /* 台演出「押し順ナビ」: レバーを下げてから0.3秒後にリール上部へ表示 */
    if (currentCabinetEffect && currentCabinetEffect.id === 'oshijun') {
      setTimeout(() => {
        if (phase === 'lever' || phase === 'spinning') UI.showPushNavi();
      }, 300);
    }

    /* レバーON演出再生（レバー/○.mp4。台演出時はcurrentEffectSetがnullなので再生されない）*/
    Director.playLeverEffect(currentEffectSet, () => {
      /* レバー演出終了後、ストップボタンを有効化 */
      const delay = GAME_DATA.config.stopButtonDelayMs || 0;
      setTimeout(() => {
        phase = 'spinning';
        Reels.enableStops();
        UI.setAllStops(true);

        /* 台演出「リール暗転」: 回転中・ボタン点灯中でもあえてリール面を暗くする */
        if (currentCabinetEffect && currentCabinetEffect.id === 'reelDark') {
          UI.showReelDark();
        } else if (currentCabinetEffect && currentCabinetEffect.id === 'shakeVision') {
          /* 台演出「シェイクビジョン」: 回転中・ボタン点灯中に画面全体を揺らす */
          UI.showShakeVision();
        }
      }, delay);
    });
  }

  /* ================= 停止ボタン ================= */
  function onStop(i) {
    if (phase !== 'spinning') return;
    if (!Reels.canStop(i)) return;

    /* ---- 第1停止で左(0)以外を押した場合 ----
     * そのリールをいったん止めて「左押し推奨」を表示し、少し見せた後、
     * 内部結果(当たり/はずれ)・演出は一切変えずに全リールを再度回転させる。
     * 左を最初に押すまで、この1Gの中で何度でも繰り返す（再抽選は行わない）。
     * ただし以下の台演出が出ているGでは、このチェック自体を行わない
     * （どのリールを最初に押しても問題ない）:
     *   ・押し順ナビ … あえて左以外を最初に押させる案内をすることがあるため
     *   ・リール暗転 … 画面が暗く、そもそもどのリールか判別しづらいため */
    const skipLeftPushCheck = !!(currentCabinetEffect &&
      (currentCabinetEffect.id === 'oshijun' || currentCabinetEffect.id === 'reelDark'));
    if (!skipLeftPushCheck && stopPressCount === 0 && i !== 0) {
      Reels.requestStop(i);
      UI.setAllStops(false);
      UI.markStopPressed(i);
      UI.markPushNaviStopped(i, 1);
      UI.hideReelDark();
      UI.hideShakeVision();

      phase = 'warning';
      UI.showLeftPushWarning();

      setTimeout(() => {
        UI.hideLeftPushWarning();
        UI.clearStopPressed();
        stopPressCount = 0;
        GameState.resetStopProgress();

        /* 保持済みの最終結果(finalResult)をそのまま使って再度回転。抽選はやり直さない */
        const st = GameState.get();
        Reels.startSpin(st.finalResult);

        const delay = GAME_DATA.config.stopButtonDelayMs || 0;
        setTimeout(() => {
          phase = 'spinning';
          Reels.enableStops();
          UI.setAllStops(true);
        }, delay);
      }, 3000);
      return;
    }

    Reels.requestStop(i);
    UI.setStopEnabled(i, false);
    UI.markStopPressed(i);
    UI.markPushNaviStopped(i, stopPressCount + 1);

    stopPressCount++;
    GameState.processStop(i);

    const st = GameState.get();

    /* 第1停止（左を最初に押した場合。左以外は上の分岐で処理済み） */
    if (stopPressCount === 1) {
      /* 台演出「リール暗転」「シェイクビジョン」が出ていればここで解除 */
      UI.hideReelDark();
      UI.hideShakeVision();
      /* 第1停止演出（1/○.mp4）*/
      Director.playStop1Effect(currentEffectSet, null);
    } else if (stopPressCount === 2) {
      UI.hideLeftPushWarning();
      /* 第2停止演出（2/○.mp4）*/
      Director.playStop2Effect(currentEffectSet, null);

      /* プッシュボタン演出判定（演出中に1/15で発生）*/
      if (st.pushEffectActive) {
        /* プッシュ告知を表示 */
        UI.requestPush(() => {
          /* プッシュが解決された時 */
          GameState.processPushResolve();
          const updatedSt = GameState.get();

          if (updatedSt.finalResult) {
            /* 当たり確定 → まだ停止していないリールの目標位置を更新 */
            Reels.updateWinPositions();
            /* push.mp4を再生（screen合成・黒背景透明化）*/
            Director.playPushEffect(null);
          }
        });
      }
    } else if (stopPressCount === 3) {
      stop3EffectDone = false;
      /* 第3停止演出（3/○.mp4 → 終了直後にHIT演出）
       * 演出が完全に終わるまでonEndは呼ばれないので、
       * それを待ってから当否表示へ進む（tryFinishGame参照）*/
      Director.playStop3Effect(currentEffectSet, () => {
        stop3EffectDone = true;
        tryFinishGame();
      });
    }
  }

  /* ================= 全リール停止 ================= */
  function onAllStopped(isWin) {
    phase = 'result';
    UI.setAllStops(false);
    UI.hidePushNavi();
    UI.hideReelDark();
    UI.hideShakeVision();

    /* 当たりの場合: リール点滅 */
    if (isWin) {
      Reels.blink(GAME_DATA.config.reelBlinkMs);
    }

    /* メカ的なリール停止が確定。ただし第3停止の演出動画(s3+HIT)が
     * まだ再生中の可能性があるため、ここでは即座に結果表示へ進まず
     * tryFinishGame() に判断を委ねる（演出側の完了と両方揃ってから進む）*/
    reelsStoppedResult = { win: isWin };
    tryFinishGame();
  }

  /* 全リール停止（メカ的）と第3停止演出(s3+HIT)の完了、
   * 両方が揃って初めて当否表示へ進む。 */
  function tryFinishGame() {
    if (reelsStoppedResult === null || !stop3EffectDone) return;
    const isWin = reelsStoppedResult.win;
    reelsStoppedResult = null;

    /* 演出が終わった直後なので、少しだけ間を置いてから結果表示 */
    setTimeout(() => {
      Director.clearEffects();
      UI.hideTitleFlip();
      UI.showResult(isWin);
      UI.showStatus(isWin ? '🎰 大当たり！！' : 'ハズレ');
      GameState.processGameEnd();
      phase = 'finished';
      /* レバーは再度押せないようにしたまま（1日1回制限）*/
    }, 400);
  }

  /* ================= 入力バインド ================= */
  function bindInputs() {
    const leverBtn = document.getElementById('lever-btn');
    if (leverBtn) leverBtn.addEventListener('click', onLever);

    for (let i = 0; i < 3; i++) {
      const btn = document.getElementById('stop-' + i);
      const idx = i;
      if (btn) btn.addEventListener('click', () => onStop(idx));
    }

    const pushBtn = document.getElementById('push-btn');
    if (pushBtn) pushBtn.addEventListener('click', () => {
      AudioManager.unlock();
      UI.resolvePush();
    });

    /* リール枠の上に大きく表示されるPUSH演出画像そのものもクリック可能にし、
     * 操作部のPUSHボタン(#push-btn)を押した時と全く同じ処理・演出になるようにする */
    const pushPromptBtn = document.getElementById('push-prompt');
    if (pushPromptBtn) pushPromptBtn.addEventListener('click', () => {
      AudioManager.unlock();
      UI.resolvePush();
    });

    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Space') { e.preventDefault(); onLever(); }
      if (e.key === '1') onStop(0);
      if (e.key === '2') onStop(1);
      if (e.key === '3') onStop(2);
      if (e.key === 'Enter') UI.resolvePush();
    });

    /* タップ/クリックでオーディオ解錠 */
    document.addEventListener('pointerdown', () => AudioManager.unlock(), { capture: true });
  }

  /* ================= スマホ対応スケール ================= */
  function fitScale() {
    const wrap = document.getElementById('machine-wrap');
    const machine = document.getElementById('machine');
    if (!wrap || !machine) return;
    const w = machine.offsetWidth || 644;
    const h = machine.offsetHeight || 1000;
    const scale = Math.min(1, (window.innerWidth - 8) / w);
    machine.style.transformOrigin = 'top left';
    machine.style.transform = scale < 1 ? 'scale(' + scale + ')' : '';
    wrap.style.width = Math.round(w * scale) + 'px';
    wrap.style.height = Math.round(h * scale) + 'px';
  }

  /* 指定ms経過しても解決しない場合はタイムアウトして先へ進むためのヘルパー。
   * 演出セット/台演出背景の自動検出が、通信環境等の要因で万一長引いた場合でも
   * 起動画面（STARTボタン）が確実に表示されるようにするための安全策。 */
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((resolve) => setTimeout(resolve, ms))
    ]);
  }

  /* ================= 起動 ================= */
  async function boot() {
    UI.init();
    Reels.init(document.getElementById('reel-area'));
    Reels.onAllStopped(onAllStopped);
    bindInputs();
    ResourceManager.startAutoRelease();
    fitScale();
    window.addEventListener('resize', fitScale);
    window.addEventListener('orientationchange', () => setTimeout(fitScale, 200));

    /* 初期ロード: タイトル画像 */
    const initialAssets = [GAME_DATA.uiAssets && GAME_DATA.uiAssets.title].filter(Boolean);
    await ResourceManager.loadAll(initialAssets, 10, (l, t, pct) => UI.setLoadProgress(pct));
    UI.setLoadProgress(100);
    UI.setTitleImage();
    fitScale();

    /* 演出セット自動検出（並列実行。万一長引いても最大8秒でSTART画面へ進む）*/
    UI.showStatus('演出データを確認中…');
    await withTimeout(Promise.all([
      GAME_DATA.detectEffectSets(),
      GAME_DATA.detectCabinetBackgrounds()
    ]), 8000);

    /* 管理者ツール初期化 */
    AdminPanel.init();

    /* 1日1回制限チェック */
    if (GameState.checkDailyLimit()) {
      /* 今日プレイ済み */
      UI.showAlreadyPlayed();
      phase = 'finished';
      requestAnimationFrame(loop);
      return;
    }

    UI.showStartButton(() => {
      AudioManager.unlock();
      UI.setLeverEnabled(true);
      phase = 'idle';
      UI.showStatus('レバーを引いてください');
    });

    requestAnimationFrame(loop);
  }

  /* ================= 管理者用: 1日制限リセット後の即時再開 =================
   * AdminPanel.js から呼び出される。ページのリロードなしに、
   * 「本日プレイ済み」画面を解除してレバーを押せる状態へ戻す。
   * ・起動時に制限で弾かれていた場合（#already-played-msg表示中）
   * ・1ゲーム終えて finished 状態になっている場合
   * のいずれかの時だけ再開させる（プレイ中に呼ばれても何もしない）。
   * 戻り値: 実際に再開処理を行った場合 true、行わなかった場合 false。 */
  function resumeAfterDailyReset() {
    const alreadyPlayedMsg = document.getElementById('already-played-msg');
    const wasBlocked = !!alreadyPlayedMsg;
    const gameFinished = phase === 'finished' && !wasBlocked;

    if (!wasBlocked && !gameFinished) return false;

    if (alreadyPlayedMsg) alreadyPlayedMsg.remove();

    const loadOverlay = document.getElementById('load-overlay');
    if (loadOverlay) loadOverlay.classList.add('hidden');

    Director.clearEffects();
    UI.hideResult();
    UI.clearStopPressed();
    UI.setAllStops(false);
    UI.hidePushNavi();
    UI.hideReelDark();
    UI.hideShakeVision();
    UI.hideTitleFlip();

    currentEffectSet = null;
    currentCabinetEffect = null;
    stopPressCount = 0;
    stop3EffectDone = false;
    reelsStoppedResult = null;

    AudioManager.unlock();
    UI.setLeverEnabled(true);
    phase = 'idle';
    UI.showStatus('レバーを引いてください');
    return true;
  }

  window.Game = window.Game || {};
  window.Game.resumeAfterDailyReset = resumeAfterDailyReset;

  window.addEventListener('DOMContentLoaded', boot);
})();
