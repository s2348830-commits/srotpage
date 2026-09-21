/* ============================================================
 * js/game/UI.js  ―  UI表示レイヤー（一発台版）
 *
 * ■ 成立役表示、ボタン点灯・押下発光、レバー
 * ■ 押し順ナビ（台演出「oshijun」。image/kaikaのボタン画像で案内）
 * ■ リール暗転（台演出「reelDark」。回転中・ボタン点灯中でも画面を暗くする）
 * ■ 第1停止で左以外を押した場合: 黒背景＋「左押し推奨」表示
 * ■ PUSH告知、ポップアップ
 * ■ 当否結果表示
 * ■ 1日1回制限表示
 * ============================================================ */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let els = {};
  let popupQueue = [];
  let popupShowing = false;
  let pushQueue = [];
  let pushActive = false;
  let pushTimer = null;
  let pushCb = null;
  let pushNaviOrder = []; // 押し順ナビ: 押すべきリール番号の順序 [1番目, 2番目, 3番目]

  const UI = {
    init() {
      els = {
        stageArea: $('stage-area'),
        naviEl: $('navi'),
        popupLayer: $('popup-layer'),
        crackLayer: $('crack-layer'),
        loadOverlay: $('load-overlay'), loadBar: $('load-bar'), loadPct: $('load-pct'),
        startBtn: $('start-btn'),
        inlineLoad: $('inline-load'), inlineBar: $('inline-bar'), inlinePct: $('inline-pct'),
        lever: $('lever-btn'),
        stops: [$('stop-0'), $('stop-1'), $('stop-2')],
        hudRole: $('hud-role'),
        titleBoard: $('title-board'),
        pushNavi: $('push-navi'),
        pushBtn: $('push-btn'), pushPrompt: $('push-prompt'),
        leftPushWarning: $('left-push-warning'),
        resultDisplay: $('result-display'),
        effectLayer: $('effect-layer'),
        reelDarkOverlay: $('reel-dark-overlay')
      };
      this.setPushButtonImage();
    },

    /* ---------- タイトルボード ---------- */
    setTitleImage() {
      const url = GAME_DATA.uiAssets && GAME_DATA.uiAssets.title;
      if (!url) return;
      ResourceManager.load(url, 9).then(el => {
        if (!el || ResourceManager.isFailed(url)) return;
        els.titleBoard.classList.add('has-image');
        els.titleBoard.innerHTML = '';
        const img = document.createElement('img');
        img.src = url; img.alt = 'タイトル'; img.id = 'title-img';
        els.titleBoard.appendChild(img);
      });
    },

    /* ---------- PUSHボタン画像 ---------- */
    setPushButtonImage() {
      const url = GAME_DATA.uiAssets && GAME_DATA.uiAssets.pushButton;
      if (!url || !els.pushBtn) return;
      const img = new Image();
      img.onload = () => {
        els.pushBtn.classList.add('has-image');
        els.pushBtn.textContent = '';
        img.id = 'push-btn-img';
        img.alt = 'PUSH';
        img.draggable = false;
        els.pushBtn.appendChild(img);
        const pi = new Image();
        pi.id = 'push-prompt-img';
        pi.alt = 'PUSH!';
        pi.draggable = false;
        pi.src = url;
        els.pushPrompt.classList.add('has-image');
        els.pushPrompt.textContent = '';
        els.pushPrompt.appendChild(pi);
      };
      img.onerror = () => {};
      img.src = url;
    },

    /* ---------- 初期ロード画面 ---------- */
    setLoadProgress(pct) {
      if (els.loadBar) els.loadBar.style.width = pct + '%';
      if (els.loadPct) els.loadPct.textContent = pct + '%';
    },
    showStartButton(cb) {
      els.startBtn.classList.remove('hidden');
      els.startBtn.addEventListener('click', () => {
        els.loadOverlay.classList.add('hidden');
        cb();
      }, { once: true });
    },

    /* ---------- 1日1回制限: プレイ済みメッセージ ---------- */
    showAlreadyPlayed() {
      els.loadOverlay.classList.add('hidden');
      /* stage-area に「本日プレイ済み」を表示 */
      const msg = document.createElement('div');
      msg.id = 'already-played-msg';
      msg.style.cssText = [
        'position:absolute;inset:0;z-index:20;',
        'display:flex;flex-direction:column;align-items:center;justify-content:center;',
        'background:rgba(0,0,0,0.85);color:#fff;font-size:22px;font-weight:bold;',
        'text-align:center;padding:20px;gap:16px;'
      ].join('');
      msg.innerHTML = [
        '<div style="font-size:36px">🎰</div>',
        '<div>本日はすでにプレイ済みです</div>',
        '<div style="font-size:14px;color:#aaa;">明日またチャレンジしてください</div>'
      ].join('');
      els.stageArea.appendChild(msg);
    },

    /* ---------- ゲーム中の演出読み込みバー ---------- */
    showInlineLoading(show) {
      els.inlineLoad.classList.toggle('hidden', !show);
      if (show) { els.inlineBar.style.width = '0%'; els.inlinePct.textContent = '0%'; }
    },
    setInlineProgress(pct) {
      els.inlineBar.style.width = pct + '%';
      els.inlinePct.textContent = pct + '%';
    },

    /* ---------- 第1停止で左以外を押した時の演出 ----------
     * 背景を黒にして「左押し推奨」を表示（白文字＋赤文字）
     * ※演出のみ。当選確率は変化しない */
    showLeftPushWarning() {
      if (!els.leftPushWarning) return;
      els.leftPushWarning.classList.remove('hidden');
      els.leftPushWarning.classList.add('show');
      /* 黒背景を全面に表示（stage-areaのbg） */
      if (els.stageArea) els.stageArea.classList.add('black-bg');
    },
    hideLeftPushWarning() {
      if (!els.leftPushWarning) return;
      els.leftPushWarning.classList.remove('show');
      els.leftPushWarning.classList.add('hidden');
      if (els.stageArea) els.stageArea.classList.remove('black-bg');
    },

    /* ---------- 台演出「押し順ナビ」----------
     * image/kaika/button1〜3.png を使い、リール枠のすぐ上に
     * 「何番目にどのリールを押すか」を案内する（演出のみ。押し順で結果は変わらない）。
     * 画像が読み込めない場合はピンクの丸数字プレースホルダーで代替表示する。 */
    showPushNavi() {
      const nav = els.pushNavi;
      if (!nav) return;
      nav.innerHTML = '';

      /* 押し順（リール番号の並び）をランダムに決定: 例 [2,0,1] → 右→左→中 の順に押させる */
      const order = [0, 1, 2];
      for (let i = order.length - 1; i > 0; i--) {
        const j = RNG.int(0, i);
        const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
      }
      pushNaviOrder = order;

      const imgs = GAME_DATA.oshijunButtons || [];
      const slotsByReel = [null, null, null];

      order.forEach((reelIdx, rank) => {
        const slot = document.createElement('div');
        slot.className = 'push-navi-slot ' + (rank === 0 ? 'now' : 'dim');
        slot.dataset.reel = String(reelIdx);

        const url = imgs[rank];
        if (url) {
          const img = new Image();
          img.alt = '押し順' + (rank + 1);
          img.draggable = false;
          img.onerror = () => {
            /* 画像が無ければ丸数字プレースホルダーに切り替える */
            img.remove();
            const ph = document.createElement('div');
            ph.className = 'push-navi-ph';
            ph.textContent = String(rank + 1);
            slot.appendChild(ph);
          };
          img.src = url;
          slot.appendChild(img);
        } else {
          const ph = document.createElement('div');
          ph.className = 'push-navi-ph';
          ph.textContent = String(rank + 1);
          slot.appendChild(ph);
        }
        slotsByReel[reelIdx] = slot;
      });

      /* 左リールの位置から順にDOMへ追加＝見た目は常に左・中・右の並びになる */
      slotsByReel.forEach(slot => nav.appendChild(slot));

      nav.classList.remove('hidden');
      nav.classList.add('show');
    },

    /* 指定リールの停止をナビへ反映する。
     * 実際に押した順番が案内どおりかどうかに関わらず、そのリールは「済」にする
     * （結果自体は変わらない。あくまで見た目の演出）。
     * rank（1〜3, 何回目の停止か）を指定すると、案内どおりの順番かを判定し、
     * 順番をミスした場合（そのランクで押すべきリールと違うリールを押した場合）は
     * まだ押していない「以降」の押し順画像を少し暗くする。
     *   例）1番目でミス → 2番目・3番目の画像が暗くなる
     *       2番目でミス → 3番目の画像が暗くなる
     * まだ済んでいない中で最も早い順番のものを次の「now」（強調表示）にする。 */
    markPushNaviStopped(reelIndex, rank) {
      const nav = els.pushNavi;
      if (!nav || !nav.classList.contains('show')) return;
      const slot = nav.querySelector('.push-navi-slot[data-reel="' + reelIndex + '"]');
      if (slot) {
        slot.classList.remove('now', 'dim');
        slot.classList.add('done');
      }

      /* 案内どおりの順番でなければ（ミス）、以降のまだ押していない画像を暗くする */
      if (rank && pushNaviOrder.length === 3) {
        const expectedReel = pushNaviOrder[rank - 1];
        if (expectedReel !== undefined && expectedReel !== reelIndex) {
          for (let idx = rank; idx < pushNaviOrder.length; idx++) {
            const remReel = pushNaviOrder[idx];
            const remSlot = nav.querySelector('.push-navi-slot[data-reel="' + remReel + '"]');
            if (remSlot) remSlot.classList.add('missed');
          }
        }
      }

      const nextReel = pushNaviOrder.find(r => {
        const s = nav.querySelector('.push-navi-slot[data-reel="' + r + '"]');
        return s && !s.classList.contains('done');
      });
      if (nextReel !== undefined) {
        const nextSlot = nav.querySelector('.push-navi-slot[data-reel="' + nextReel + '"]');
        if (nextSlot) { nextSlot.classList.remove('dim'); nextSlot.classList.add('now'); }
      }
    },

    hidePushNavi() {
      if (!els.pushNavi) return;
      els.pushNavi.classList.add('hidden');
      els.pushNavi.classList.remove('show');
      els.pushNavi.innerHTML = '';
      pushNaviOrder = [];
    },

    /* ---------- 台演出「リール暗転」----------
     * 回転中・ボタン点灯中でも、あえてリール面を暗く見せる完全な雰囲気演出。
     * 当選確率・演出選択には一切関係ない。第1停止のタイミングで自動的に解除される。 */
    showReelDark() {
      if (els.reelDarkOverlay) els.reelDarkOverlay.classList.add('show');
    },
    hideReelDark() {
      if (els.reelDarkOverlay) els.reelDarkOverlay.classList.remove('show');
    },

    /* ---------- 台演出「シェイクビジョン」----------
     * 押し順ナビ・リール暗転と同じ枠(台演出)の1つ。
     * 回転中・ボタン点灯中に映像液晶エリア(#stage-area)全体を小刻みに揺らす
     * 完全な雰囲気演出。当選確率・演出選択には一切関係ない。
     * リール暗転と同様、第1停止のタイミングで自動的に解除される。 */
    showShakeVision() {
      if (els.stageArea) els.stageArea.classList.add('shake-vision');
    },
    hideShakeVision() {
      if (els.stageArea) els.stageArea.classList.remove('shake-vision');
    },

    /* ---------- 台演出「タイトル画像切替」----------
     * レバーを下げた1ゲームの間だけ、タイトルボードの画像を
     * title.png → title2.png に差し替える完全な雰囲気演出。
     * 当選確率・演出選択には一切関係ない。ゲーム終了時に元へ戻す。 */
    showTitleFlip() {
      const url = GAME_DATA.uiAssets && GAME_DATA.uiAssets.title2;
      const img = document.getElementById('title-img');
      if (!url || !img) return;
      ResourceManager.load(url, 9).then(el => {
        if (!el || ResourceManager.isFailed(url)) return;
        img.src = url;
      });
    },
    hideTitleFlip() {
      const url = GAME_DATA.uiAssets && GAME_DATA.uiAssets.title;
      const img = document.getElementById('title-img');
      if (!url || !img) return;
      img.src = url;
    },

    /* ---------- ナビ（テキスト） ---------- */
    showNavi(text, color) {
      if (!els.naviEl) return;
      els.naviEl.textContent = text;
      els.naviEl.className = 'navi show serif-' + (color || 'white');
      setTimeout(() => { if (els.naviEl) els.naviEl.classList.remove('show'); }, 1300);
    },

    /* ---------- PUSH告知 ---------- */
    requestPush(cb) {
      pushQueue.push(cb);
      this._pumpPush();
    },
    _pumpPush() {
      if (pushActive || pushQueue.length === 0) return;
      pushActive = true;
      pushCb = pushQueue.shift();
      if (els.pushPrompt) els.pushPrompt.classList.add('show');
      if (els.pushBtn) els.pushBtn.classList.add('flash');
      pushTimer = setTimeout(() => this.resolvePush(), 2500);
    },
    resolvePush() {
      if (!pushActive) return false;
      clearTimeout(pushTimer);
      pushActive = false;
      if (els.pushPrompt) els.pushPrompt.classList.remove('show');
      if (els.pushBtn) els.pushBtn.classList.remove('flash');
      const cb = pushCb; pushCb = null;
      if (cb) { try { cb(); } catch (e) { console.error(e); } }
      this._pumpPush();
      return true;
    },

    /* ---------- センターポップアップ ---------- */
    showPopup(text, cls, ms) {
      popupQueue.push({ text, cls, ms: ms || 1200 });
      this._pumpPopup();
    },
    _pumpPopup() {
      if (popupShowing || popupQueue.length === 0) return;
      popupShowing = true;
      const p = popupQueue.shift();
      const div = document.createElement('div');
      div.className = 'popup ' + (p.cls || '');
      div.textContent = p.text;
      els.popupLayer.appendChild(div);
      setTimeout(() => {
        div.classList.add('out');
        setTimeout(() => {
          div.remove();
          popupShowing = false;
          this._pumpPopup();
        }, 200);
      }, p.ms);
    },

    /* ---------- 当否結果表示 ---------- */
    showResult(isWin) {
      const rd = els.resultDisplay;
      if (!rd) return;
      rd.className = isWin ? 'result-win show' : 'result-lose show';
      rd.innerHTML = isWin
        ? '<div class="result-text win-text">🎰 大当たり！！ 🎰</div><div class="result-sub">おめでとうございます！</div>'
        : '<div class="result-text lose-text">ハズレ</div><div class="result-sub">またチャレンジしてください</div>';
    },
    hideResult() {
      const rd = els.resultDisplay;
      if (rd) { rd.className = 'hidden'; rd.innerHTML = ''; }
    },

    /* ---------- HUD更新 ---------- */
    showSpinning() {
      if (els.hudRole) els.hudRole.textContent = '回転中…';
    },
    showStatus(text) {
      if (els.hudRole) els.hudRole.textContent = text;
    },

    /* ---------- ボタン状態 ---------- */
    setLeverEnabled(on) {
      if (!els.lever) return;
      els.lever.disabled = !on;
      els.lever.classList.toggle('ready', on);
    },
    setStopEnabled(i, on) {
      if (!els.stops[i]) return;
      els.stops[i].disabled = !on;
      els.stops[i].classList.toggle('lit', on);
    },
    setAllStops(on) {
      for (let i = 0; i < 3; i++) this.setStopEnabled(i, on);
    },
    markStopPressed(i) {
      if (els.stops[i]) els.stops[i].classList.add('pressed');
    },
    clearStopPressed() {
      if (els.stops) els.stops.forEach(b => b.classList.remove('pressed'));
    }
  };

  window.UI = UI;
})();
