/* ============================================================
 * js/game/Lottery.js  ―  内部抽選（一発台版）
 *
 * ■ レバーON時に内部抽選を行い、WIN/LOSEを確定する
 * ■ 通常当選率: 1/1000
 * ■ プッシュボタン演出発生時のみ: 1/6 で再抽選
 * ■ 演出・押し順によって抽選結果を変更しない
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
     * @param {boolean} internalResult - レバーON時の内部抽選結果
     * @returns {boolean} true=プッシュボタン演出発生
     */
    decidePushEffect(internalResult) {
      /* プッシュボタン演出は 1/15 で発生 */
      return RNG.chance(1 / GAME_DATA.config.pushEffectRate);
    },

    /**
     * プッシュボタン演出発生時の再抽選
     * 内部的に既に当たりの場合はそのままtrueを返す。
     * ハズレの場合は 1/6 で当たりになる可能性がある。
     * @param {boolean} internalResult - レバーON時の内部抽選結果
     * @returns {boolean} 最終的な当否
     */
    pushReLottery(internalResult) {
      if (internalResult) return true;  // 既に当たりなら変わらず当たり
      return RNG.chance(1 / GAME_DATA.config.pushWinRate);
    }
  };

  window.Lottery = Lottery;
})();
