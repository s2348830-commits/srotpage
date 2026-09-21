/* ============================================================
 * data/config.js  ―  一発台設定（データ駆動）
 * ============================================================ */
window.GAME_DATA = window.GAME_DATA || {};

GAME_DATA.config = {
  /* ---- 一発台 基本設定 ---- */
  normalWinRate: 1000,        // 通常当選確率（1/1000）※実際の当選確率はこの値のみで決まる
  pushEffectRate: 15,         // プッシュボタン演出発生率（1/15）※見た目の煽り演出の発生率で、当否には一切影響しない

  /* ---- 1日1回制限 ---- */
  dailyLimitKey: 'hyakka_lastPlayedDate',  // localStorage保存キー

  /* ---- 演出タイミング ---- */
  reelBlinkMs: 500,          // 当たり時のリール点滅時間(0.5秒)
  stopButtonDelayMs: 250,     // リール回転開始からボタンが押せるまでの遅延

  /* ---- 演出期待度（管理者ツールの「🎯 演出期待度設定」で編集可能） ----
   * 演出セット番号(effectSets[].no)や台演出のid(GAME_DATA.cabinetEffects[].id)
   * ごとの重み（1〜100）。数値が大きいほどレバーON時にその演出が選ばれやすくなる。
   * ※内部抽選(Lottery.js)の当選確率には一切影響しない、演出選択の比率のみ。
   * 未設定の演出は defaultEffectExpectation の値として扱われる。
   * 演出セット(mp4)と台演出は同じプールから1つだけ選ばれるため、重複表示はしない。 */
  effectExpectations: {
    reelDark: 48,     // 台演出「リール暗転」（回転中・ボタン点灯中でもあえて画面を暗くする）
    oshijun: 67,      // 台演出「押し順ナビ」（image/kaikaのボタン画像で押し順を案内）
    shakeVision: 55,  // 台演出「シェイクビジョン」（回転中・ボタン点灯中に画面全体が揺れる）
    titleFlip: 90     // 台演出「タイトル画像切替」（レバーを下げた1G中、title.png→title2.png）
    // 演出セット(mp4)側の例: "1": 10, "2": 30 ← 管理者ツールで保存すると自動的にここに書き出される
  },
  defaultEffectExpectation: 50,

  /* ---- リソース管理 ---- */
  resource: {
    concurrency: 3,
    loadTimeoutMs: 8000,
    releaseIdleMs: 90000,
    cleanupIntervalMs: 20000
  }
};
