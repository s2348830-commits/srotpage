/* ============================================================
 * js/game/GameState.js  ―  一発台 状態管理
 *
 * ■ レバーON時に内部抽選を行いWIN/LOSEを確定
 * ■ 1日1回制限: localStorage に日付を保存
 * ■ 演出・押し順によって結果は変わらない
 *
 * フロー:
 *   レバーON → decideResult() → 演出 → 停止 → showResult()
 * ============================================================ */
(function () {
  'use strict';

  const DAILY_KEY = GAME_DATA.config.dailyLimitKey;

  /* 保存用の日付文字列。端末のロケール設定に左右されないよう
   * YYYY-MM-DD 形式（端末のローカル日付）に固定する。 */
  function todayStr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  const state = {
    phase: 'idle',              // idle / lever / stop1 / stop2 / stop3 / result / finished
    internalResult: false,      // レバーON時に確定したWIN/LOSE
    pushEffectActive: false,    // プッシュボタン演出が発生したか
    finalResult: false,         // 最終結果（プッシュ再抽選後）
    effectSet: null,            // 今回の演出セット
    stopCount: 0,               // 停止ボタンを押した回数
    firstStopReel: -1,          // 最初に停止したリール番号
    todayPlayed: false          // 今日プレイ済みかどうか
  };

  const GameState = {
    get() { return state; },

    /* ---- 1日1回制限チェック ----
     * localStorageが使えない環境（file://のSafari・プライベートブラウズ等）では
     * 例外になる。その場合は制限をかけられないので「未プレイ」扱いで通すが、
     * 黙って通すと不具合に気づけないため必ずコンソールに警告を出す。 */
    checkDailyLimit() {
      try {
        const last = localStorage.getItem(DAILY_KEY);
        const today = todayStr();
        console.log('[GameState] 制限チェック:', { saved: last, today: today });
        /* 旧バージョンは toLocaleDateString('ja-JP') 形式で保存していたため、
         * そちらの形式で残っている値も「今日プレイ済み」として扱う。 */
        const legacy = new Date().toLocaleDateString('ja-JP');
        if (last === today || last === legacy) {
          state.todayPlayed = true;
          return true;  // 今日プレイ済み
        }
        return false;
      } catch (e) {
        console.warn('[GameState] localStorageが利用できないため1日1回制限は無効です:', e);
        return false;
      }
    },

    /* ---- 今日プレイ済みとして記録 ----
     * 書き込み直後に読み戻して検証する。保存できていない場合は
     * 静かに無視せずコンソールへ出す（アプリ内ブラウザ等の切り分け用）。 */
    recordPlay() {
      try {
        const today = todayStr();
        localStorage.setItem(DAILY_KEY, today);
        if (localStorage.getItem(DAILY_KEY) !== today) {
          throw new Error('書き込み検証に失敗（保存されていません）');
        }
        state.todayPlayed = true;
        console.log('[GameState] 本日プレイ済みとして記録しました:', today);
      } catch (e) {
        console.error('[GameState] 1日1回制限の保存に失敗しました:', e);
      }
    },

    /* ---- レバーON: 内部抽選を実行し結果を保持 ---- */
    processLeverOn(effectSet) {
      /* ★ここで「本日プレイ済み」を記録する。
       * 以前はゲームを最後まで遊び切った processGameEnd() でしか記録していなかったため、
       * 演出中にリロード／タブを閉じる／戻る等で離脱すると未プレイ扱いのまま残り、
       * 何度でも遊べてしまっていた。レバーを引いた＝1回消費、とみなす。 */
      this.recordPlay();

      /* 内部抽選（1/1000）*/
      state.internalResult = Lottery.decideResult();
      /* プッシュボタン演出発生抽選（1/15）*/
      state.pushEffectActive = Lottery.decidePushEffect(state.internalResult);
      /* この時点での最終結果は内部抽選結果と同じ（プッシュ発生時は後でpushResolveで更新）*/
      state.finalResult = state.internalResult;
      state.effectSet = effectSet;
      state.stopCount = 0;
      state.firstStopReel = -1;
      state.phase = 'lever';

      console.log('[GameState] レバーON:', {
        win: state.internalResult,
        push: state.pushEffectActive
      });

      EventBus.emit('state:updated', state);
      return state;
    },

    /* ---- プッシュボタンが解決された時 ----
     * ★PUSH演出は当否を変えない（Lottery.resolvePushEffect参照）。
     *   当たり確定G中なら「当たり煽り」としてpush.mp4を流し、
     *   ハズレ確定G中なら「ガセ」として何も起きない。 */
    processPushResolve() {
      if (state.pushEffectActive) {
        const prev = state.finalResult;
        state.finalResult = Lottery.resolvePushEffect(state.internalResult);
        console.log('[GameState] プッシュ解決:', { before: prev, after: state.finalResult });
      }
      EventBus.emit('state:updated', state);
    },

    /* ---- 停止ボタン ---- */
    processStop(reelIndex) {
      state.stopCount++;
      if (state.stopCount === 1) {
        state.firstStopReel = reelIndex;
        state.phase = 'stop1';
      } else if (state.stopCount === 2) {
        state.phase = 'stop2';
      } else if (state.stopCount === 3) {
        state.phase = 'stop3';
      }
      EventBus.emit('state:updated', state);
    },

    /* ---- 第1停止で左以外を押した場合のやり直し用 ----
     * 停止の進行状況（stopCount・firstStopReel）だけをレバー直後の状態に戻す。
     * internalResult・finalResult・effectSet・pushEffectActiveには一切触れないため、
     * 再度回転させても内部抽選(当たり/はずれ)はレバーON時に決まったまま変わらない。 */
    resetStopProgress() {
      state.stopCount = 0;
      state.firstStopReel = -1;
      state.phase = 'lever';
      EventBus.emit('state:updated', state);
    },

    /* ---- ゲーム終了 ---- */
    processGameEnd() {
      state.phase = 'finished';
      this.recordPlay();
      EventBus.emit('state:gameEnd', { win: state.finalResult });
    },

    /* ---- 管理者用: 結果を強制設定 ---- */
    adminSetResult(win) {
      state.internalResult = win;
      state.finalResult = win;
      EventBus.emit('state:updated', state);
    },

    /* ---- 管理者用: 日付制限をリセット ---- */
    adminResetDaily() {
      try {
        localStorage.removeItem(DAILY_KEY);
        state.todayPlayed = false;
      } catch (e) { /* noop */ }
    }
  };

  window.GameState = GameState;
})();
