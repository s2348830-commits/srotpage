/* ============================================================
 * data/effects.js  ―  演出定義（データ駆動・MP4自動認識）
 *
 * 演出フォルダ構成:
 *   image/レバー/1.mp4, 2.mp4, ...
 *   image/1/1.mp4, 2.mp4, ...      ← 第1停止演出
 *   image/2/1.mp4, 2.mp4, ...      ← 第2停止演出
 *   image/3/1.mp4, 3.mp4, ...      ← 第3停止演出
 *   image/background/1.png, 2.png, ... ← 演出セットの背景画像（枠の背景。任意）
 *
 * 同じ番号のMP4を1G演出セットとして扱う。
 * 同じ番号のbackground/N.pngが存在する場合、その画像も同じセットの背景として扱う。
 * ファイルが存在すれば自動的に演出に追加される。
 * ============================================================ */
window.GAME_DATA = window.GAME_DATA || {};

GAME_DATA.effectFolders = {
  lever: 'image/レバー',      // レバーON演出フォルダ
  stop1: 'image/1',           // 第1停止演出フォルダ
  stop2: 'image/2',           // 第2停止演出フォルダ
  stop3: 'image/3',           // 第3停止演出フォルダ
  background: 'image/background'  // 演出セット背景画像フォルダ（任意・同番号のpng）
};

/* PUSH演出動画（当たり確定時のみ再生） */
GAME_DATA.pushEffectVideo = 'image/push.mp4';

/* ============================================================
 * 台演出（cabinet effects）
 * 演出セット(mp4)とは別枠の演出。Director.pickPerformance()で
 * 演出セットと同じ期待度抽選プールからまとめて1つだけ選ばれるため、
 * 演出セット(mp4)と台演出が同じGで重複して表示されることはない。
 * 期待度は GAME_DATA.config.effectExpectations に id をキーとして設定する
 * （管理者ツール「🎯 演出期待度設定」から個別に変更可能）。
 * ============================================================ */
GAME_DATA.cabinetEffects = [
  { id: 'reelDark',    label: 'リール暗転（回転中・ボタン点灯中でもあえてリール面を暗くする）' },
  { id: 'oshijun',     label: '押し順ナビ（image/kaikaのボタン画像で押す順番を案内する）' },
  { id: 'shakeVision', label: 'シェイクビジョン（回転中・ボタン点灯中に画面全体が揺れる）' },
  { id: 'titleFlip',   label: 'タイトル画像切替（レバーを下げた1Gの間、title.pngがtitle2.pngに変わる）' }
];

/* 押し順ナビ用ボタン画像（1番目/2番目/3番目に押す用）。image/kaika フォルダに配置。 */
GAME_DATA.oshijunButtons = [
  'image/kaika/button1.png',
  'image/kaika/button2.png',
  'image/kaika/button3.png'
];

/* UI素材 */
GAME_DATA.uiAssets = {
  title: 'image/title.png',
  title2: 'image/title2.png',   // 台演出「タイトル画像切替」時にtitle.pngの代わりに表示
  pushButton: 'image/normal_push.png'
};

/* ============================================================
 * 演出セット自動検出
 *
 * サーバー環境では fetch でファイル一覧を取得するが、
 * file:// では動かないため、番号1〜99を順に試みる方式を採用。
 * EffectManager.init() が呼ばれた際に非同期で検出を実行する。
 * ============================================================ */
GAME_DATA.effectSets = [];   // [{no:1, lever:'...', s1:'...', s2:'...', s3:'...', bg:'...'|null}]

/* 演出セットを非同期で自動検出する（最大99番まで試みる） */
GAME_DATA.detectEffectSets = async function () {
  const folders = GAME_DATA.effectFolders;
  const sets = [];

  /* ファイルの存在確認（HEADリクエスト。file://では失敗するため代替手段を使う） */
  async function exists(url) {
    try {
      /* fetch HEADが使えればそれを優先 */
      if (typeof fetch !== 'undefined') {
        const r = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
        return r.ok;
      }
    } catch (e) { /* fall through */ }
    /* fetch が使えないか失敗した場合: Imageロードで試みる（.mp4には通用しないが安全弁） */
    return false;
  }

  /* MP4の存在確認（videoエレメント canplaythrough で判定） */
  async function videoExists(url) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      let done = false;
      const finish = (ok) => { if (!done) { done = true; v.src = ''; resolve(ok); } };
      const timer = setTimeout(() => finish(false), 3000);
      v.addEventListener('loadedmetadata', () => { clearTimeout(timer); finish(true); }, { once: true });
      v.addEventListener('error', () => { clearTimeout(timer); finish(false); }, { once: true });
      v.src = url;
      v.load();
    });
  }

  /* PNGの存在確認（Imageロードで判定。背景画像は任意なので失敗してもOK扱い） */
  async function imageExists(url) {
    return new Promise((resolve) => {
      const img = new Image();
      let done = false;
      const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
      const timer = setTimeout(() => finish(false), 3000);
      img.addEventListener('load', () => { clearTimeout(timer); finish(true); }, { once: true });
      img.addEventListener('error', () => { clearTimeout(timer); finish(false); }, { once: true });
      img.src = url;
    });
  }

  /* 1〜99番を順に検出 */
  for (let n = 1; n <= 99; n++) {
    const leverUrl = folders.lever + '/' + n + '.mp4';
    const s1Url    = folders.stop1 + '/' + n + '.mp4';
    const s2Url    = folders.stop2 + '/' + n + '.mp4';
    const s3Url    = folders.stop3 + '/' + n + '.mp4';
    const bgPngUrl = folders.background + '/' + n + '.png';
    const bgMp4Url = folders.background + '/' + n + '.mp4';

    /* レバー演出ファイルの存在で判断 */
    const ok = await videoExists(leverUrl);
    if (!ok) {
      /* 1番が存在しない場合は終了。途中の番号が欠けても1番がなければ即終了 */
      if (n === 1) break;
      /* 1番以降は途中の欠番を許容してもよいが、ここでは連続している前提で終了 */
      break;
    }

    /* 背景は png/mp4 どちらでも良い（任意）。両方あればmp4を優先する。
     * mp4の場合、再生時は終了0.01秒手前で自動停止し最終フレームを維持する（Director.js側）。 */
    let bg = null, bgType = null;
    if (await videoExists(bgMp4Url)) {
      bg = bgMp4Url; bgType = 'video';
    } else if (await imageExists(bgPngUrl)) {
      bg = bgPngUrl; bgType = 'image';
    }

    sets.push({ no: n, lever: leverUrl, s1: s1Url, s2: s2Url, s3: s3Url, bg: bg, bgType: bgType });
  }

  GAME_DATA.effectSets = sets;
  console.log('[Effects] 検出された演出セット数:', sets.length,
    sets.map(s => s.no + (s.bg ? ('(bg:' + s.bgType + ')') : '')));
  return sets;
};

/* ============================================================
 * 台演出用ランダム背景の自動検出
 *
 * 台演出（GAME_DATA.cabinetEffects：リール暗転・押し順ナビ・
 * シェイクビジョン・タイトル画像切替）が選ばれた際、演出セット(mp4)の
 * 番号とは無関係に image/background/番号.png または .mp4 を
 * ランダムに1つ選んで背景として表示するための一覧。
 * 演出セットの背景検出(detectEffectSets)とは異なり、対応する
 * レバー演出mp4の有無に関わらず、1〜99番のbackgroundファイルを
 * 独立して検出する（歯抜けがあっても構わない）。
 * 例: image/background/1.png, image/background/1.mp4 ...
 * ============================================================ */
GAME_DATA.cabinetBackgrounds = []; // [{no, url, type:'image'|'video'}]

GAME_DATA.detectCabinetBackgrounds = async function () {
  const folder = GAME_DATA.effectFolders.background;

  async function videoExists(url) {
    return new Promise((resolve) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      let done = false;
      const finish = (ok) => { if (!done) { done = true; v.src = ''; resolve(ok); } };
      const timer = setTimeout(() => finish(false), 3000);
      v.addEventListener('loadedmetadata', () => { clearTimeout(timer); finish(true); }, { once: true });
      v.addEventListener('error', () => { clearTimeout(timer); finish(false); }, { once: true });
      v.src = url;
      v.load();
    });
  }

  async function imageExists(url) {
    return new Promise((resolve) => {
      const img = new Image();
      let done = false;
      const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
      const timer = setTimeout(() => finish(false), 3000);
      img.addEventListener('load', () => { clearTimeout(timer); finish(true); }, { once: true });
      img.addEventListener('error', () => { clearTimeout(timer); finish(false); }, { once: true });
      img.src = url;
    });
  }

  /* 1つの番号について png/mp4 の有無を確認する（両方あればmp4を優先） */
  async function detectOne(n) {
    const mp4Url = folder + '/' + n + '.mp4';
    const pngUrl = folder + '/' + n + '.png';
    if (await videoExists(mp4Url)) return { no: n, url: mp4Url, type: 'video' };
    if (await imageExists(pngUrl)) return { no: n, url: pngUrl, type: 'image' };
    return null;
  }

  /* 1〜99番を独立して検出（歯抜け許容）。
   * ここは99件を1件ずつ順番に待つと、存在しない番号1つにつき最大約6秒
   * （mp4タイムアウト3秒＋png タイムアウト3秒）かかってしまい、
   * 背景ファイルが少ない環境では起動画面が非常に長く止まってしまう
   * （スマホ等でSTARTボタンがいつまでも現れず押せない不具合の原因になっていた）。
   * そのため全番号を並列にチェックし、全体の所要時間を最長でも
   * 1件分（約6秒以内）に抑える。 */
  const nums = [];
  for (let n = 1; n <= 99; n++) nums.push(n);
  const results = await Promise.all(nums.map(detectOne));
  const list = results.filter(Boolean).sort((a, b) => a.no - b.no);

  GAME_DATA.cabinetBackgrounds = list;
  console.log('[Effects] 台演出用背景の検出数:', list.length,
    list.map(b => b.no + '(' + b.type + ')'));
  return list;
};