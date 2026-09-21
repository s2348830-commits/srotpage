/* ============================================================
 * js/core/EventBus.js  ―  各レイヤーを疎結合にするイベントバス
 * 内部抽選 / 状態遷移 / 演出再生 / UI表示 はここを介して通信する
 * ============================================================ */
(function () {
  'use strict';
  const listeners = new Map();

  window.EventBus = {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
      return () => this.off(event, fn);
    },
    off(event, fn) {
      const arr = listeners.get(event);
      if (arr) {
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
      }
    },
    emit(event, payload) {
      const arr = listeners.get(event);
      if (arr) arr.slice().forEach(fn => {
        try { fn(payload); } catch (e) { console.error('[EventBus]', event, e); }
      });
    }
  };
})();
