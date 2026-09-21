/* ============================================================
 * js/game/AdminPanel.js  ―  管理者ツール（一発台版）
 * パスワード: 0728
 * ============================================================ */
(function () {
  'use strict';

  const PASSWORD = '0728';
  const CONFIG_OVERRIDE_KEY = 'hyakka_configOverride';
  let unlocked = false;

  /* ============================================================
   * 管理者ツールで保存した確率・演出期待度の変更を、次回アクセス時にも
   * 反映させるためのlocalStorage上書き。
   * このファイルの読み込み時点（main.js起動より前）に即座に適用する。
   * data/config.js自体は書き換えられないため、あくまで「この端末の
   * ブラウザ上での上書き」。恒久的に反映するには、管理者ツールの
   * 「config.jsをダウンロード」で書き出したファイルで
   * data/config.js を置き換える必要がある。
   * ============================================================ */
  (function applyConfigOverride() {
    try {
      const raw = localStorage.getItem(CONFIG_OVERRIDE_KEY);
      if (!raw) return;
      const override = JSON.parse(raw);
      window.GAME_DATA = window.GAME_DATA || {};
      GAME_DATA.config = GAME_DATA.config || {};
      if (override.normalWinRate) GAME_DATA.config.normalWinRate = override.normalWinRate;
      if (override.pushWinRate) GAME_DATA.config.pushWinRate = override.pushWinRate;
      if (override.pushEffectRate) GAME_DATA.config.pushEffectRate = override.pushEffectRate;
      if (override.effectExpectations) GAME_DATA.config.effectExpectations = override.effectExpectations;
    } catch (e) { /* noop */ }
  })();

  function persistConfigOverride() {
    try {
      const cfg = GAME_DATA.config || {};
      const override = {
        normalWinRate: cfg.normalWinRate,
        pushWinRate: cfg.pushWinRate,
        pushEffectRate: cfg.pushEffectRate,
        effectExpectations: cfg.effectExpectations || {}
      };
      localStorage.setItem(CONFIG_OVERRIDE_KEY, JSON.stringify(override));
    } catch (e) { /* noop */ }
  }

  function buildLockedUI(panel) {
    panel.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'admin-title';
    title.textContent = '🛠 管理者ツール';
    panel.appendChild(title);

    const pwWrap = document.createElement('div');
    pwWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:8px;';

    const pwLabel = document.createElement('div');
    pwLabel.className = 'admin-note';
    pwLabel.textContent = 'パスワードを入力してください';
    pwWrap.appendChild(pwLabel);

    const pwInput = document.createElement('input');
    pwInput.type = 'password';
    pwInput.maxLength = 10;
    pwInput.className = 'admin-select';
    pwInput.placeholder = 'パスワード';
    pwInput.style.cssText = 'text-align:center;letter-spacing:4px;font-size:18px;';
    pwWrap.appendChild(pwInput);

    const pwBtn = document.createElement('button');
    pwBtn.className = 'admin-btn';
    pwBtn.textContent = '🔓 解除';
    pwBtn.style.textAlign = 'center';
    pwWrap.appendChild(pwBtn);

    const errMsg = document.createElement('div');
    errMsg.style.cssText = 'color:#f66;font-size:11px;text-align:center;';
    pwWrap.appendChild(errMsg);

    panel.appendChild(pwWrap);

    function tryUnlock() {
      if (pwInput.value === PASSWORD) {
        unlocked = true;
        buildUnlockedUI(panel);
      } else {
        errMsg.textContent = 'パスワードが違います';
        pwInput.value = '';
        setTimeout(() => { errMsg.textContent = ''; }, 2000);
      }
    }
    pwBtn.addEventListener('click', tryUnlock);
    pwInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
  }

  function buildUnlockedUI(panel) {
    panel.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'admin-title';
    title.textContent = '🛠 管理者ツール';
    panel.appendChild(title);

    const note = document.createElement('div');
    note.className = 'admin-note';
    note.textContent = 'デバッグ・強制操作';
    panel.appendChild(note);

    const ACTIONS = [
      {
        label: '✅ 次ゲーム 当たり確定',
        fn: () => {
          GameState.adminSetResult(true);
          UI.showStatus('当たり確定（管理者）');
        }
      },
      {
        label: '❌ 次ゲーム ハズレ確定',
        fn: () => {
          GameState.adminSetResult(false);
          UI.showStatus('ハズレ確定（管理者）');
        }
      },
      {
        label: '🗓 1日制限リセット',
        fn: () => {
          GameState.adminResetDaily();
          const resumed = window.Game && typeof window.Game.resumeAfterDailyReset === 'function'
            ? window.Game.resumeAfterDailyReset()
            : false;
          if (resumed) {
            UI.showStatus('制限リセット済み（プレイ可能になりました）');
          } else {
            /* ゲームプレイ中など、即座に再開できない状況の場合のみリロードを案内 */
            UI.showStatus('制限リセット済み');
            alert('1日制限をリセットしました。\n現在プレイ中のため、次回のロード時から反映されます。');
          }
        }
      },
      {
        label: '🎬 演出プレビュー（全件表示）',
        fn: () => showEffectPreview()
      },
      {
        label: '🔒 ロック',
        fn: () => {
          unlocked = false;
          buildLockedUI(panel);
        }
      }
    ];

    ACTIONS.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'admin-btn';
      btn.textContent = a.label;
      btn.addEventListener('click', a.fn);
      panel.appendChild(btn);
    });

    /* 演出セット情報 */
    const effectInfo = document.createElement('div');
    effectInfo.className = 'admin-note';
    effectInfo.style.marginTop = '10px';
    const sets = GAME_DATA.effectSets || [];
    effectInfo.textContent = '演出セット数: ' + sets.length + '個\n（' + sets.map(s => s.no).join(', ') + '番）';
    effectInfo.style.whiteSpace = 'pre-line';
    panel.appendChild(effectInfo);

    /* ---- 確率設定 ---- */
    const probTitle = document.createElement('div');
    probTitle.className = 'admin-title';
    probTitle.style.cssText = 'margin-top:14px;font-size:13px;';
    probTitle.textContent = '⚙ 確率設定（分母を入力。例: 1000 → 1/1000）';
    panel.appendChild(probTitle);

    const probWrap = document.createElement('div');
    probWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:6px;';

    function buildProbRow(labelText, key) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';
      const label = document.createElement('span');
      label.className = 'admin-note';
      label.textContent = labelText;
      const inputWrap = document.createElement('span');
      inputWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';
      const pre = document.createElement('span');
      pre.textContent = '1 / ';
      pre.style.color = '#ccc';
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.step = '1';
      input.className = 'admin-select';
      input.style.cssText = 'width:80px;text-align:center;';
      input.value = GAME_DATA.config[key];
      inputWrap.appendChild(pre);
      inputWrap.appendChild(input);
      row.appendChild(label);
      row.appendChild(inputWrap);
      probWrap.appendChild(row);
      return input;
    }

    const normalWinInput = buildProbRow('通常当選確率', 'normalWinRate');
    const pushWinInput = buildProbRow('プッシュ当選確率', 'pushWinRate');
    const pushEffectInput = buildProbRow('プッシュ演出発生率', 'pushEffectRate');

    const probSaveBtn = document.createElement('button');
    probSaveBtn.className = 'admin-btn';
    probSaveBtn.textContent = '💾 確率を保存（即時反映）';
    probSaveBtn.addEventListener('click', () => {
      const nw = Math.max(1, parseInt(normalWinInput.value, 10) || GAME_DATA.config.normalWinRate);
      const pw = Math.max(1, parseInt(pushWinInput.value, 10) || GAME_DATA.config.pushWinRate);
      const pe = Math.max(1, parseInt(pushEffectInput.value, 10) || GAME_DATA.config.pushEffectRate);
      GAME_DATA.config.normalWinRate = nw;
      GAME_DATA.config.pushWinRate = pw;
      GAME_DATA.config.pushEffectRate = pe;
      normalWinInput.value = nw;
      pushWinInput.value = pw;
      pushEffectInput.value = pe;
      persistConfigOverride();
      UI.showStatus('確率設定を保存しました（即時反映）');
    });
    probWrap.appendChild(probSaveBtn);
    panel.appendChild(probWrap);

    /* ---- 演出期待度設定 ----
     * 演出番号（例: image/レバー/1.mp4 → 番号「1」、image/レバー/2.mp4 → 番号「2」）や
     * 台演出（リール暗転・押し順ナビ・シェイクビジョン・タイトル画像切替）ごとに、個別に期待値(1〜100)を設定できる。
     * これらは全て同じ抽選プールから1つだけ選ばれるため、
     * ここで数値を大きくした演出ほど選ばれやすくなる。
     * ・すでにファイルが検出済みの番号は自動で行が並ぶ
     * ・まだファイルを置いていない番号でも「番号を追加」から先に設定でき、
     *   保存内容は effectExpectations に残るので、後からファイルを配置して
     *   検出されるようになった時点で自動的にその値が使われる。
     * ・台演出（reelDark/oshijun/shakeVision/titleFlip）は常に固定で表示され、削除はできない。 */
    const defaultExp = GAME_DATA.config.defaultEffectExpectation || 50;

    const expTitle = document.createElement('div');
    expTitle.className = 'admin-title';
    expTitle.style.cssText = 'margin-top:14px;font-size:13px;';
    expTitle.textContent = '🎯 演出期待度設定（1〜100・未設定は' + defaultExp + '扱い）';
    panel.appendChild(expTitle);

    const expNote = document.createElement('div');
    expNote.className = 'admin-note';
    expNote.textContent =
      '内部抽選の当選確率自体は変わりません。演出セット(mp4)・台演出はすべて同じ抽選から' +
      '1つだけ選ばれるので、かぶって表示されることはありません' +
      '（例: 1.mp4系の演出=10、2.mp4系の演出=30、台演出「押し順」=67）。';
    panel.appendChild(expNote);

    const expWrap = document.createElement('div');
    expWrap.style.cssText =
      'display:flex;flex-direction:column;gap:4px;margin-top:6px;' +
      'max-height:220px;overflow-y:auto;';
    panel.appendChild(expWrap);

    const sumDisplay = document.createElement('div');
    sumDisplay.style.cssText = 'color:#9f9;font-size:12px;margin-top:6px;font-weight:bold;';

    const expEmptyNote = document.createElement('div');
    expEmptyNote.className = 'admin-note';
    expEmptyNote.textContent = 'まだ演出番号が登録されていません。下の「番号を追加」から追加してください。';

    /* expEntries: [{ key, input, row }] ※keyはGAME_DATA.config.effectExpectationsのキー */
    const expEntries = [];
    const savedExp = GAME_DATA.config.effectExpectations || {};
    const detectedNos = sets.map(s => s.no);
    const cabinetEffects = GAME_DATA.cabinetEffects || [];

    function recalcSum() {
      const total = expEntries.reduce((acc, o) => acc + (parseInt(o.input.value, 10) || 0), 0);
      sumDisplay.textContent = '期待値合計: ' + total;
    }

    function refreshEmptyNote() {
      if (expEntries.length === 0) {
        if (!expEmptyNote.parentNode) panel.insertBefore(expEmptyNote, expWrap.nextSibling);
      } else if (expEmptyNote.parentNode) {
        expEmptyNote.remove();
      }
    }

    /* 個別の演出1行分（入力欄＋削除可能な場合のみ✕ボタン）を追加する
     * key: effectExpectationsに保存するキー（mp4番号は数値、台演出はid文字列）
     * label: 行のラベル文字列
     * removable: trueなら削除ボタンを付ける（手動追加した未検出の番号のみ） */
    function addExpRow(key, label, value, removable, labelColor) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';

      const labelEl = document.createElement('span');
      labelEl.className = 'admin-note';
      labelEl.textContent = label;
      if (labelColor) labelEl.style.color = labelColor;

      const inputWrap = document.createElement('span');
      inputWrap.style.cssText = 'display:flex;align-items:center;gap:4px;';

      const input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.max = '100';
      input.className = 'admin-select';
      input.style.cssText = 'width:64px;text-align:center;';
      input.value = value;
      input.addEventListener('input', recalcSum);
      inputWrap.appendChild(input);

      if (removable) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.textContent = '✕';
        delBtn.title = 'この番号の設定を削除';
        delBtn.style.cssText =
          'width:22px;height:22px;line-height:20px;padding:0;font-size:12px;' +
          'background:#502020;color:#faa;border:1px solid #833;border-radius:4px;';
        delBtn.addEventListener('click', () => {
          const idx = expEntries.findIndex(o => o.row === row);
          if (idx !== -1) expEntries.splice(idx, 1);
          row.remove();
          recalcSum();
          refreshEmptyNote();
        });
        inputWrap.appendChild(delBtn);
      }

      row.appendChild(labelEl);
      row.appendChild(inputWrap);
      expWrap.appendChild(row);
      expEntries.push({ key: key, label: label, input: input, row: row });
    }

    /* 1) 台演出（リール暗転・押し順ナビ）は常に固定表示・削除不可 */
    cabinetEffects.forEach(c => {
      const v = (savedExp[c.id] !== undefined ? savedExp[c.id] : defaultExp);
      addExpRow(c.id, '🎯 台演出: ' + (c.label || c.id), v, false, '#8cf');
    });

    /* 2) 検出済みの演出セット番号＋以前保存済みだが未検出の番号、両方を番号順に表示する */
    const allNos = Array.from(new Set(
      detectedNos.map(String).concat(
        Object.keys(savedExp).filter(k => !cabinetEffects.some(c => c.id === k))
      )
    )).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);

    allNos.forEach(no => {
      const detected = detectedNos.indexOf(no) !== -1;
      const v = (savedExp[no] !== undefined ? savedExp[no] : defaultExp);
      addExpRow(no, 'No.' + no + (detected ? '' : '（未検出）'), v, !detected, detected ? null : '#f96');
    });

    panel.appendChild(sumDisplay);
    recalcSum();
    refreshEmptyNote();

    /* ---- 番号を手動で追加 ----
     * ファイルをまだ配置していない演出番号にも、先に期待値だけ設定しておける。 */
    const addRow = document.createElement('div');
    addRow.style.cssText =
      'display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap;';

    const addNoInput = document.createElement('input');
    addNoInput.type = 'number';
    addNoInput.min = '1';
    addNoInput.placeholder = '番号';
    addNoInput.className = 'admin-select';
    addNoInput.style.cssText = 'width:56px;text-align:center;';

    const addValInput = document.createElement('input');
    addValInput.type = 'number';
    addValInput.min = '1';
    addValInput.max = '100';
    addValInput.placeholder = '期待値';
    addValInput.className = 'admin-select';
    addValInput.style.cssText = 'width:64px;text-align:center;';
    addValInput.value = defaultExp;

    const addBtn = document.createElement('button');
    addBtn.className = 'admin-btn';
    addBtn.textContent = '＋ 番号を追加';
    addBtn.style.cssText = 'width:auto;padding:6px 10px;';
    addBtn.addEventListener('click', () => {
      const no = parseInt(addNoInput.value, 10);
      if (!no || no < 1) { UI.showStatus('演出番号を入力してください'); return; }
      if (expEntries.some(o => String(o.key) === String(no))) {
        UI.showStatus('No.' + no + ' はすでに設定されています');
        return;
      }
      let v = parseInt(addValInput.value, 10);
      if (isNaN(v)) v = defaultExp;
      v = Math.min(100, Math.max(1, v));
      const detected = detectedNos.indexOf(no) !== -1;
      addExpRow(no, 'No.' + no + (detected ? '' : '（未検出）'), v, !detected, detected ? null : '#f96');
      recalcSum();
      refreshEmptyNote();
      addNoInput.value = '';
    });

    addRow.appendChild(addNoInput);
    addRow.appendChild(addValInput);
    addRow.appendChild(addBtn);
    panel.appendChild(addRow);

    const expSaveBtn = document.createElement('button');
    expSaveBtn.className = 'admin-btn';
    expSaveBtn.style.marginTop = '4px';
    expSaveBtn.textContent = '💾 期待度を保存（即時反映）';
    expSaveBtn.addEventListener('click', () => {
      const newExp = {};
      expEntries.forEach(o => {
        let v = parseInt(o.input.value, 10);
        if (isNaN(v)) v = defaultExp;
        v = Math.min(100, Math.max(1, v));
        o.input.value = v;
        newExp[o.key] = v;
      });
      GAME_DATA.config.effectExpectations = newExp;
      recalcSum();
      persistConfigOverride();
      UI.showStatus('演出期待度を保存しました（即時反映）');
    });
    panel.appendChild(expSaveBtn);

    /* ---- 期待値一覧表示 ----
     * 現在の入力値（保存前の変更も含む）から、選ばれる比率(%)を計算して
     * 一覧をalertで表示する。CSSの表示/非表示切り替えに頼らず、
     * クリックすれば確実に見える形にしている。 */
    const expListBtn = document.createElement('button');
    expListBtn.className = 'admin-btn';
    expListBtn.style.marginTop = '6px';
    expListBtn.textContent = '📋 期待値一覧を表示';
    expListBtn.addEventListener('click', () => {
      if (expEntries.length === 0) {
        alert('演出期待度がまだ1件も登録されていません。');
        return;
      }

      /* ※演出セット(mp4)・台演出は全て同じプールから1つだけ選ばれるため、
       *   ここでの%がそのままレバーON時にその演出が選ばれる確率になる。 */
      const items = expEntries.map(o => {
        let v = parseInt(o.input.value, 10);
        if (isNaN(v)) v = defaultExp;
        v = Math.min(100, Math.max(1, v));
        return { label: o.label, value: v };
      });
      const total = items.reduce((acc, it) => acc + it.value, 0);
      items.sort((a, b) => b.value - a.value); // 選ばれやすい順

      const lines = items.map(it => {
        const pct = total > 0 ? (it.value / total * 100) : 0;
        return it.label + '：' + it.value + '（' + pct.toFixed(1) + '%）';
      });
      lines.push('----------------');
      lines.push('合計：' + total + '（100%）');

      alert('🎯 演出期待度一覧（選ばれやすい順）\n\n' + lines.join('\n'));
    });
    panel.appendChild(expListBtn);

    /* ---- 次の演出を指定 ----
     * GAME_DATA.forcedNextPerformance に {kind, key} をセットすると、
     * Director.pickPerformance() が次回のレバーONで必ずその演出を選ぶ
     * （1回使われると自動的に解除され、以降は通常の重み付き抽選に戻る）。
     * 内部抽選(当たり/はずれ)には一切影響しない、演出選択のみの上書き。 */
    const forceTitle = document.createElement('div');
    forceTitle.className = 'admin-title';
    forceTitle.style.cssText = 'margin-top:14px;font-size:13px;';
    forceTitle.textContent = '▶ 次の演出を指定';
    panel.appendChild(forceTitle);

    const forceNote = document.createElement('div');
    forceNote.className = 'admin-note';
    forceNote.textContent =
      '次回レバーONで発生する演出（演出セットmp4／台演出）を1回だけ強制指定できます。' +
      '使われると自動的に解除され、以降は通常の抽選（期待度による重み付き）に戻ります。' +
      '内部抽選(当たり/はずれ)には影響しません。';
    panel.appendChild(forceNote);

    const forceSelect = document.createElement('select');
    forceSelect.className = 'admin-select';
    forceSelect.style.cssText = 'width:100%;margin-top:6px;';

    const cabinetGroup = document.createElement('optgroup');
    cabinetGroup.label = '台演出';
    cabinetEffects.forEach(c => {
      const opt = document.createElement('option');
      opt.value = 'cabinet:' + c.id;
      opt.textContent = c.label || c.id;
      cabinetGroup.appendChild(opt);
    });
    if (cabinetEffects.length > 0) forceSelect.appendChild(cabinetGroup);

    if (sets.length > 0) {
      const setGroup = document.createElement('optgroup');
      setGroup.label = '演出セット(mp4)';
      sets.forEach(s => {
        const opt = document.createElement('option');
        opt.value = 'set:' + s.no;
        opt.textContent = 'No.' + s.no;
        setGroup.appendChild(opt);
      });
      forceSelect.appendChild(setGroup);
    }
    panel.appendChild(forceSelect);

    const forceStatus = document.createElement('div');
    forceStatus.style.cssText = 'font-size:12px;margin-top:6px;font-weight:bold;';

    function refreshForceStatus() {
      const forced = GAME_DATA.forcedNextPerformance;
      if (!forced) {
        forceStatus.textContent = '現在: 通常抽選中（指定なし）';
        forceStatus.style.color = '#9f9';
        return;
      }
      let label;
      if (forced.kind === 'cabinet') {
        const c = cabinetEffects.find(x => x.id === forced.key);
        label = '台演出: ' + (c ? (c.label || c.id) : forced.key);
      } else {
        label = '演出セット No.' + forced.key;
      }
      forceStatus.textContent = '次回G: 「' + label + '」を強制発生予定';
      forceStatus.style.color = '#ffd944';
    }
    refreshForceStatus();
    panel.appendChild(forceStatus);

    const forceBtnRow = document.createElement('div');
    forceBtnRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;';

    const forceSetBtn = document.createElement('button');
    forceSetBtn.className = 'admin-btn';
    forceSetBtn.style.cssText = 'flex:1;';
    forceSetBtn.textContent = '▶ 次のGで発生させる';
    forceSetBtn.addEventListener('click', () => {
      const val = forceSelect.value;
      if (!val) { UI.showStatus('演出を選択してください'); return; }
      const sep = val.indexOf(':');
      const kind = val.slice(0, sep);
      const key = val.slice(sep + 1);
      GAME_DATA.forcedNextPerformance = { kind: kind, key: key };
      refreshForceStatus();
      UI.showStatus('次回のレバーONで指定した演出が発生します');
    });

    const forceClearBtn = document.createElement('button');
    forceClearBtn.className = 'admin-btn';
    forceClearBtn.style.cssText = 'flex:1;';
    forceClearBtn.textContent = '⏹ 指定解除';
    forceClearBtn.addEventListener('click', () => {
      GAME_DATA.forcedNextPerformance = null;
      refreshForceStatus();
      UI.showStatus('指定を解除しました（通常抽選に戻ります）');
    });

    forceBtnRow.appendChild(forceSetBtn);
    forceBtnRow.appendChild(forceClearBtn);
    panel.appendChild(forceBtnRow);

    if (cabinetEffects.length === 0 && sets.length === 0) {
      const forceEmptyNote = document.createElement('div');
      forceEmptyNote.className = 'admin-note';
      forceEmptyNote.textContent = '指定できる演出がまだありません。';
      panel.appendChild(forceEmptyNote);
    }

    /* ---- config.jsダウンロード ---- */
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'admin-btn';
    downloadBtn.style.marginTop = '10px';
    downloadBtn.textContent = '⬇ 現在の設定でconfig.jsをダウンロード';
    downloadBtn.addEventListener('click', () => downloadConfigJs());
    panel.appendChild(downloadBtn);

    const downloadNote = document.createElement('div');
    downloadNote.className = 'admin-note';
    downloadNote.style.cssText = 'font-size:10px;color:#999;margin-top:4px;';
    downloadNote.textContent =
      'ブラウザからサーバー上のファイルを直接書き換えることはできません。' +
      'ダウンロードしたconfig.jsで data/config.js を上書きすると恒久的に反映されます' +
      '（保存ボタンの時点でこの端末には次回アクセス時も自動反映されます）。';
    panel.appendChild(downloadNote);
  }

  /* ============================================================
   * 現在のGAME_DATA.configの内容から、data/config.js相当のソースコードを
   * 生成してダウンロードさせる（管理者が実ファイルを手動で置き換える用）。
   * ============================================================ */
  function buildConfigJsContent() {
    const cfg = GAME_DATA.config || {};
    const exp = cfg.effectExpectations || {};
    const res = cfg.resource || {};
    const expLines = Object.keys(exp)
      .sort((a, b) => {
        const na = Number(a), nb = Number(b);
        const aIsNum = !isNaN(na), bIsNum = !isNaN(nb);
        if (aIsNum && bIsNum) return na - nb;
        if (aIsNum) return -1;              // 数値キー(mp4演出セット番号)を先に
        if (bIsNum) return 1;
        return a.localeCompare(b);           // 台演出のidは文字列順
      })
      .map(k => '    ' + JSON.stringify(String(k)) + ': ' + exp[k])
      .join(',\n');

    return '/* ============================================================\n' +
      ' * data/config.js  ―  一発台設定（データ駆動）\n' +
      ' * ============================================================ */\n' +
      'window.GAME_DATA = window.GAME_DATA || {};\n\n' +
      'GAME_DATA.config = {\n' +
      '  /* ---- 一発台 基本設定 ---- */\n' +
      '  normalWinRate: ' + cfg.normalWinRate + ',           // 通常当選確率の分母（1/' + cfg.normalWinRate + '）\n' +
      '  pushWinRate: ' + cfg.pushWinRate + ',              // プッシュボタン演出発生時の当選確率の分母（1/' + cfg.pushWinRate + '）\n' +
      '  pushEffectRate: ' + cfg.pushEffectRate + ',          // プッシュボタン演出発生率の分母（1/' + cfg.pushEffectRate + '）\n\n' +
      '  /* ---- 1日1回制限 ---- */\n' +
      '  dailyLimitKey: ' + JSON.stringify(cfg.dailyLimitKey) + ',  // localStorage保存キー\n\n' +
      '  /* ---- 演出タイミング ---- */\n' +
      '  reelBlinkMs: ' + cfg.reelBlinkMs + ',          // 当たり時のリール点滅時間\n' +
      '  stopButtonDelayMs: ' + cfg.stopButtonDelayMs + ',     // リール回転開始からボタンが押せるまでの遅延\n\n' +
      '  /* ---- リソース管理 ---- */\n' +
      '  resource: {\n' +
      '    concurrency: ' + res.concurrency + ',\n' +
      '    loadTimeoutMs: ' + res.loadTimeoutMs + ',\n' +
      '    releaseIdleMs: ' + res.releaseIdleMs + ',\n' +
      '    cleanupIntervalMs: ' + res.cleanupIntervalMs + '\n' +
      '  },\n\n' +
      '  /* ---- 演出期待度（1〜100。数値が大きいほど選ばれやすい。\n' +
      '   *      未設定の演出セットは defaultEffectExpectation 扱い） ---- */\n' +
      '  effectExpectations: {\n' +
      expLines + '\n' +
      '  },\n\n' +
      '  /* 演出期待度が未設定の演出セットに使われるデフォルト値（1〜100） */\n' +
      '  defaultEffectExpectation: ' + (cfg.defaultEffectExpectation || 50) + '\n' +
      '};\n';
  }

  function downloadConfigJs() {
    const content = buildConfigJsContent();
    const blob = new Blob([content], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ============================================================
   * 演出プレビュー: 検出された演出セットを全件同時にループ再生し、
   * グリッド表示することで「いっぺんに」見比べられるようにする。
   * 各カードは lever → s1 → s2 → s3 の順で自動的に繋げて再生する。
   * ============================================================ */
  function buildPreviewCard(effectSet) {
    const card = document.createElement('div');
    card.className = 'admin-preview-card';
    card.style.cssText =
      'position:relative;width:170px;height:128px;background:#000;' +
      'border:1px solid #555;border-radius:4px;overflow:hidden;flex:0 0 auto;';

    if (effectSet.bg) {
      const img = document.createElement('img');
      img.src = effectSet.bg;
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:fill;';
      card.appendChild(img);
    }

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;object-fit:fill;mix-blend-mode:screen;';
    card.appendChild(video);

    const label = document.createElement('div');
    label.textContent = 'No.' + effectSet.no;
    label.style.cssText =
      'position:absolute;left:4px;top:4px;color:#fff;font-size:11px;' +
      'background:rgba(0,0,0,0.65);padding:1px 5px;border-radius:2px;z-index:2;';
    card.appendChild(label);

    const clips = [effectSet.lever, effectSet.s1, effectSet.s2, effectSet.s3].filter(Boolean);
    let idx = 0;
    let stopped = false;
    function playNext() {
      if (stopped || clips.length === 0) return;
      video.src = clips[idx % clips.length];
      idx++;
      video.currentTime = 0;
      video.play().catch(() => {});
    }
    video.addEventListener('ended', playNext);
    video.addEventListener('error', playNext);
    playNext();

    card._stop = () => { stopped = true; try { video.pause(); } catch (e) {} };
    return card;
  }

  function showEffectPreview() {
    const existing = document.getElementById('admin-preview-overlay');
    if (existing) existing.remove();

    const sets = GAME_DATA.effectSets || [];
    const overlay = document.createElement('div');
    overlay.id = 'admin-preview-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);' +
      'overflow:auto;padding:20px;';

    const header = document.createElement('div');
    header.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';
    const title = document.createElement('div');
    title.style.cssText = 'color:#fff;font-size:16px;font-weight:bold;';
    title.textContent = '演出プレビュー（全' + sets.length + '件・自動ループ再生）';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'admin-btn';
    closeBtn.textContent = '✕ 閉じる';
    closeBtn.style.cssText = 'width:auto;padding:6px 14px;';
    closeBtn.addEventListener('click', () => {
      Array.from(overlay.querySelectorAll('.admin-preview-card')).forEach(c => {
        if (c._stop) c._stop();
      });
      overlay.remove();
    });
    header.appendChild(title);
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;';
    sets.forEach(s => grid.appendChild(buildPreviewCard(s)));
    overlay.appendChild(grid);

    if (sets.length === 0) {
      const empty = document.createElement('div');
      empty.style.color = '#aaa';
      empty.textContent = '検出された演出セットがありません。';
      overlay.appendChild(empty);
    }

    document.body.appendChild(overlay);
  }

  const AdminPanel = {
    init() {
      const panel = document.getElementById('admin-panel');
      if (!panel) return;
      buildLockedUI(panel);
    }
  };

  window.AdminPanel = AdminPanel;
})();
