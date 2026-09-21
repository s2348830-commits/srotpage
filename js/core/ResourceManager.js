/* ============================================================
 * js/core/ResourceManager.js  ―  リソース管理
 *  - バックグラウンド順次ロード（優先度つきキュー / 同時数制限）
 *  - 一度読み込んだ素材はキャッシュ保持、二重ロードなし
 *  - ロード進捗を件数ベースで％通知
 *  - 未使用リソースは一定時間後に自動解放
 *    （現在ステージ＆次ステージ素材・BGMは protect で保持）
 *  - file:// でも動くよう fetch は使わず要素ベースでロード
 * ============================================================ */
(function () {
  'use strict';
  const cfg = () => GAME_DATA.config.resource;

  /** cache: url -> {el, type, lastUsed, loading:Promise|null, failed:bool} */
  const cache = new Map();
  const protectedUrls = new Set();
  const queue = [];          // {url, priority, resolve...}
  let activeLoads = 0;
  let cleanupTimer = null;

  function typeOf(url) {
    const u = url.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|svg)$/.test(u)) return 'image';
    if (/\.(mp3|wav|ogg|m4a)$/.test(u)) return 'audio';
    if (/\.(mp4|webm|mov)$/.test(u)) return 'video';
    return 'image';
  }

  function createLoader(url, type) {
    return new Promise((resolve) => {
      let el, done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(ok ? el : null);
      };
      const timer = setTimeout(() => finish(true), cfg().loadTimeoutMs); // タイムアウトでも続行

      if (type === 'image') {
        el = new Image();
        el.onload = () => finish(true);
        el.onerror = () => finish(false);
        el.src = url;
      } else if (type === 'audio') {
        el = new Audio();
        el.preload = 'auto';
        el.addEventListener('canplaythrough', () => finish(true), { once: true });
        el.addEventListener('error', () => finish(false), { once: true });
        el.src = url;
        el.load();
      } else { // video
        el = document.createElement('video');
        el.preload = 'auto';
        el.muted = true;
        el.playsInline = true;
        el.addEventListener('canplaythrough', () => finish(true), { once: true });
        el.addEventListener('loadeddata', () => finish(true), { once: true });
        el.addEventListener('error', () => finish(false), { once: true });
        el.src = url;
        el.load();
      }
    });
  }

  function pump() {
    while (activeLoads < cfg().concurrency && queue.length > 0) {
      queue.sort((a, b) => b.priority - a.priority);
      const job = queue.shift();
      const entry = cache.get(job.url);
      if (!entry || !entry.loading) { continue; }
      activeLoads++;
      createLoader(job.url, entry.type).then((el) => {
        activeLoads--;
        entry.loading = null;
        entry.lastUsed = Date.now();
        if (el) {
          entry.el = el;
        } else {
          entry.failed = true;
          console.warn('[Resource] load failed:', job.url);
        }
        entry.resolvers.forEach(r => r(entry.el));
        entry.resolvers = [];
        EventBus.emit('resource:loaded', { url: job.url, ok: !entry.failed });
        pump();
      });
    }
  }

  const RM = {
    /** 素材をロード（キャッシュ済みなら即返す）。二重ロードしない */
    load(url, priority) {
      if (!url) return Promise.resolve(null);
      let entry = cache.get(url);
      if (entry) {
        entry.lastUsed = Date.now();
        if (entry.el) return Promise.resolve(entry.el);
        if (entry.failed) return Promise.resolve(null);
        if (entry.loading) {
          return new Promise(res => entry.resolvers.push(res));
        }
      }
      entry = { el: null, type: typeOf(url), lastUsed: Date.now(), loading: true, failed: false, resolvers: [] };
      cache.set(url, entry);
      const p = new Promise(res => entry.resolvers.push(res));
      queue.push({ url, priority: priority || 0 });
      pump();
      return p;
    },

    /** 複数ロード。onProgress(loaded, total, percent) を件数ベースで通知 */
    loadAll(urls, priority, onProgress) {
      const list = urls.filter(Boolean);
      const total = list.length;
      if (total === 0) { if (onProgress) onProgress(0, 0, 100); return Promise.resolve([]); }
      let loaded = 0;
      const report = () => { if (onProgress) onProgress(loaded, total, Math.round(loaded / total * 100)); };
      report();
      return Promise.all(list.map(u => this.load(u, priority).then(el => {
        loaded++; report(); return el;
      })));
    },

    /** キャッシュから取得（あれば lastUsed 更新）。未ロードなら null */
    get(url) {
      const e = cache.get(url);
      if (e && e.el) { e.lastUsed = Date.now(); return e.el; }
      return null;
    },

    isFailed(url) {
      const e = cache.get(url);
      return !!(e && e.failed);
    },

    /** 現在ステージ・次ステージ・BGMなど解放してはいけない素材を登録 */
    setProtected(urls) {
      protectedUrls.clear();
      urls.filter(Boolean).forEach(u => protectedUrls.add(u));
    },

    /** 未使用リソースの自動解放 */
    startAutoRelease() {
      if (cleanupTimer) return;
      cleanupTimer = setInterval(() => {
        const now = Date.now();
        cache.forEach((entry, url) => {
          if (protectedUrls.has(url)) return;
          if (entry.loading) return;
          if (!entry.el) return;
          if (now - entry.lastUsed > cfg().releaseIdleMs) {
            try {
              if (entry.type !== 'image') { entry.el.src = ''; entry.el.load && entry.el.load(); }
            } catch (e) { /* noop */ }
            cache.delete(url);
            EventBus.emit('resource:released', { url });
          }
        });
      }, cfg().cleanupIntervalMs);
    },

    stats() {
      let n = 0; cache.forEach(e => { if (e.el) n++; });
      return { cached: n, queued: queue.length };
    }
  };

  window.ResourceManager = RM;
})();
