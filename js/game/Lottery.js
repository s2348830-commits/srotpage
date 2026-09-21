/* ============================================================
 * js/game/Lottery.js  ―  内部抽選（一発台版）
 *
 * ■ レバーON時に内部抽選を行い、WIN/LOSEを確定する
 * ■ 通常当選率: 1/1000
 * ■ プッシュボタン演出: 見た目上の煽り演出であり、当否には一切影響しない
 *   （当たり確定Gでは「当たり煽り」、ハズレ確定Gでは「ガセ」として発生する）
 * ■ 演出・押し順によって抽選結果を変更しない
 *
 * ★重要: 以前はプッシュボタン演出発生時に1/6で再抽選（当たり昇格）していたが、
 *   これだとPUSH経由の当選寄与だけで約1/90あり、通常抽選(1/1000)と合算すると
 *   実際の当選確率が約1/83まで甘くなってしまっていた。
 *   PUSH経由の寄与（1/pushEffectRate × 1/pushWinRate）は単独でも1/1000を
 *   上回ってしまうため、通常抽選側をどう調整しても合計を1/1000ちょうどには
 *   できない。そのため「PUSH演出は結果を一切変えない」設計に修正し、
 *   実際の当選確率が常にnormalWinRateの分母どおり（1/1000）になるようにした。
 * ============================================================ */
(function () {
  'use strict';

  const Lottery = {
    /**
     * レバーON時の内部抽選
     * @returns {boolean} true=当たり / false=ハズレ
     */
    decideResult() {
      const cfg = GAME_DATA.config;
      return RNG.chance(1 / cfg.normalWinRate);
    },

    /**
     * プッシュボタン演出が発生したかどうかを抽選
     * ※内部抽選(decideResult)とは完全に独立した「見た目だけ」の演出抽選。
     *   当たり確定G・ハズレ確定Gのどちらでも同じ確率(1/pushEffectRate)で発生しうる。
     * @param {boolean} internalResult - レバーON時の内部抽選結果（未使用。呼び出し互換のため引数だけ残す）
     * @returns {boolean} true=プッシュボタン演出発生
     */
    decidePushEffect(internalResult) {
      /* プッシュボタン演出は 1/15 で発生（当否には無関係） */
      return RNG.chance(1 / GAME_DATA.config.pushEffectRate);
    },

    /**
     * プッシュボタン演出が発生した際の結果決定。
     * ★PUSH演出は当否を一切変えない。当たり確定Gなら「当たり煽り」として、
     *   ハズレ確定Gなら「ガセ」として見せるだけで、常にinternalResultをそのまま返す。
     *   これにより実際の当選確率は常にnormalWinRateの分母どおり（1/1000）になる。
     * @param {boolean} internalResult - レバーON時の内部抽選結果
     * @returns {boolean} 最終的な当否（internalResultと必ず同じ）
     */
    resolvePushEffect(internalResult) {
      return internalResult;
    }
  };

  window.Lottery = Lottery;
})();
