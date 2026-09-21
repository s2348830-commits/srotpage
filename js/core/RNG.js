/* ============================================================
 * js/core/RNG.js  ―  乱数ユーティリティ
 * ============================================================ */
(function () {
  'use strict';
  window.RNG = {
    /* 0以上1未満 */
    random() { return Math.random(); },
    /* p の確率で true */
    chance(p) { return Math.random() < p; },
    /* a〜b の整数（両端含む） */
    int(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); },
    /* a〜b の実数 */
    float(a, b) { return a + Math.random() * (b - a); },
    /* 配列からランダムに1つ */
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    /* {weight}付き配列から重み抽選 */
    weighted(arr, weightFn) {
      const w = arr.map(weightFn || (x => x.weight));
      const total = w.reduce((a, b) => a + b, 0);
      if (total <= 0) return null;
      let r = Math.random() * total;
      for (let i = 0; i < arr.length; i++) {
        r -= w[i];
        if (r < 0) return arr[i];
      }
      return arr[arr.length - 1];
    }
  };
})();
