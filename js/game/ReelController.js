/* ============================================================
 * js/game/ReelController.js  ―  一発台リール制御
 *
 * ■ 当たり時: 押し順によらず「同じ図柄」が横または斜めに揃う
 *   （揃う図柄はSEV/BSEV/BAR/BELL/REP/SUI/CHEのいずれか。
 *    HAZ（ハズレ図柄）は名前の通りの図柄なので当たり対象には含めない）
 * ■ ハズレ時: いずれの図柄も（HAZ以外は）横にも斜めにも
 *   絶対に揃わない出目を選択
 * ■ 押し順: どの順番でも正常に停止・役成立
 * ■ 当選確率・結果は変更しない
 * ============================================================ */
(function () {
  'use strict';

  const SYM_COUNT = 20;
  const DEG_PER_SYM = 360 / SYM_COUNT;
  const CELL_H = 60;
  const CELL_W = 100;
  const RADIUS = Math.round((CELL_H / 2) / Math.tan(Math.PI / SYM_COUNT));
  const SPIN_SPEED = 20;
  const STOP_ACCEL = 9999999;
  const STOP_MAX = 9999999;
  const MIN_SLIP = 1;

  /* 当たり対象となる図柄一覧（このいずれかが横or斜めに揃えば当たり）。
   * HAZ（ハズレ）は名前どおり「揃わない」ための図柄なので対象外とする。 */
  const WIN_SYMBOLS = ['SEV', 'BSEV', 'BAR', 'BELL', 'REP', 'SUI', 'CHE'];

  const reels = [];
  let stopsEnabled = false;
  let onAllStoppedCb = null;
  let activeIsWin = false;
  let winPositions = [null, null, null]; // 各リールの目標停止pos

  /* ---------- 図柄照合 ---------- */
  function matchSym(stripSym, want) {
    return want === '-' || stripSym === want;
  }

  /* ---------- WIN停止位置の計算（指定した1図柄について）---------- */
  function findWinPositionsForSymbol(strips, sym) {
    const results = [];

    /* 横中段: strips[r][pos] === sym となる pos を探す */
    const horizontal = [null, null, null];
    for (let r = 0; r < 3; r++) {
      for (let p = 0; p < SYM_COUNT; p++) {
        if (strips[r][p] === sym) {
          horizontal[r] = p;
          break;
        }
      }
    }
    if (horizontal.every(v => v !== null)) {
      results.push({ type: 'horizontal', symbol: sym, positions: horizontal });
    }

    /* 右下がり斜め: 左上段・中中段・右下段
       pos+1=sym(左), pos=sym(中), pos-1=sym(右) */
    const diagDown = [null, null, null];
    for (let p = 0; p < SYM_COUNT; p++) {
      // 左リール: 上段 = strips[r][(p+1)%SYM_COUNT]
      if (strips[0][(p + 1) % SYM_COUNT] === sym) diagDown[0] = p;
    }
    for (let p = 0; p < SYM_COUNT; p++) {
      if (strips[1][p] === sym) diagDown[1] = p;
    }
    for (let p = 0; p < SYM_COUNT; p++) {
      // 右リール: 下段 = strips[r][(p-1+SYM_COUNT)%SYM_COUNT]
      if (strips[2][(p + SYM_COUNT - 1) % SYM_COUNT] === sym) diagDown[2] = p;
    }
    if (diagDown.every(v => v !== null)) {
      results.push({ type: 'diagonal_down', symbol: sym, positions: diagDown });
    }

    /* 右上がり斜め: 左下段・中中段・右上段
       pos-1=sym(左), pos=sym(中), pos+1=sym(右) */
    const diagUp = [null, null, null];
    for (let p = 0; p < SYM_COUNT; p++) {
      if (strips[0][(p + SYM_COUNT - 1) % SYM_COUNT] === sym) diagUp[0] = p;
    }
    for (let p = 0; p < SYM_COUNT; p++) {
      if (strips[1][p] === sym) diagUp[1] = p;
    }
    for (let p = 0; p < SYM_COUNT; p++) {
      if (strips[2][(p + 1) % SYM_COUNT] === sym) diagUp[2] = p;
    }
    if (diagUp.every(v => v !== null)) {
      results.push({ type: 'diagonal_up', symbol: sym, positions: diagUp });
    }

    return results;
  }

  /* ---------- WIN停止位置の計算（全図柄まとめて）----------
   * WIN_SYMBOLSの各図柄について、横中段・右下がり斜め・右上がり斜めの
   * 3パターンそれぞれの揃い位置を求め、すべて候補としてまとめて返す。
   * startSpin()側でこの中からランダムに1つを選ぶため、
   * 「毎回SEVだけ」ではなく揃う図柄自体もランダムになる。 */
  function findWinPositions() {
    const strips = GAME_DATA.reelStrips;
    let results = [];
    WIN_SYMBOLS.forEach(sym => {
      results = results.concat(findWinPositionsForSymbol(strips, sym));
    });
    return results;
  }

  /* ---------- 指定した出目[p0,p1,p2]で、当たり対象図柄がどれか1つでも
   * 横（上・中・下段のいずれか）または斜めに揃ってしまっていないかを判定 ---------- */
  function hasAnySymbolAligned(strips, ps) {
    const win = ps.map((p, r) => [
      strips[r][(p + 1) % SYM_COUNT],        // 上段
      strips[r][p],                          // 中段
      strips[r][(p + SYM_COUNT - 1) % SYM_COUNT] // 下段
    ]);

    for (let i = 0; i < WIN_SYMBOLS.length; i++) {
      const sym = WIN_SYMBOLS[i];

      /* 横（上段・中段・下段のいずれか）*/
      for (let row = 0; row < 3; row++) {
        if (win[0][row] === sym && win[1][row] === sym && win[2][row] === sym) return true;
      }
      /* 右下がり斜め（左上段・中中段・右下段） */
      if (win[0][0] === sym && win[1][1] === sym && win[2][2] === sym) return true;
      /* 右上がり斜め（左下段・中中段・右上段） */
      if (win[0][2] === sym && win[1][1] === sym && win[2][0] === sym) return true;
    }
    return false;
  }

  /* ---------- LOSE停止位置の計算（当たり図柄がいずれも揃わない出目）---------- */
  function findLosePositions() {
    const strips = GAME_DATA.reelStrips;

    /* まずはランダムに試す（対象図柄が増えても大抵はすぐ見つかる） */
    for (let tryN = 0; tryN < 300; tryN++) {
      const ps = [RNG.int(0, SYM_COUNT - 1), RNG.int(0, SYM_COUNT - 1), RNG.int(0, SYM_COUNT - 1)];
      if (!hasAnySymbolAligned(strips, ps)) return ps;
    }

    /* 万一ランダム試行で見つからなかった場合のフォールバック:
     * 全組み合わせ(最大20×20×20通り)をしらみ潰しに探索し、
     * 「絶対に何も揃わない」出目を1つ確実に返す。 */
    for (let p0 = 0; p0 < SYM_COUNT; p0++) {
      for (let p1 = 0; p1 < SYM_COUNT; p1++) {
        for (let p2 = 0; p2 < SYM_COUNT; p2++) {
          const ps = [p0, p1, p2];
          if (!hasAnySymbolAligned(strips, ps)) return ps;
        }
      }
    }
    /* 理論上ここには到達しない（最終フォールバック） */
    return [1, 0, 2];
  }

  /* ---------- DOM（3D円筒ドラム） ---------- */
  function buildDom(container) {
    container.innerHTML = '';
    for (let r = 0; r < 3; r++) {
      const wrap = document.createElement('div');
      wrap.className = 'reel3d dim';
      wrap.style.width = CELL_W + 'px';

      const drum = document.createElement('div');
      drum.className = 'drum';

      for (let k = 0; k < SYM_COUNT; k++) {
        const sym = GAME_DATA.symbols[GAME_DATA.reelStrips[r][k]];
        const cell = document.createElement('div');
        cell.className = 'drum-cell ' + sym.cls;
        cell.style.width = CELL_W + 'px';
        cell.style.height = CELL_H + 'px';
        cell.style.transform =
          'rotateX(' + (k * DEG_PER_SYM) + 'deg) translateZ(' + RADIUS + 'px)';

        const icon = document.createElement('span');
        icon.className = 'cell-icon';
        icon.textContent = sym.icon;
        cell.appendChild(icon);

        const ri = GAME_DATA.reelImages;
        if (ri && ri.enabled && typeof ri.path === 'function') {
          const img = document.createElement('img');
          img.className = 'cell-img';
          img.alt = sym.name;
          img.draggable = false;
          img.addEventListener('load', () => cell.classList.add('has-img'), { once: true });
          img.addEventListener('error', () => { img.remove(); }, { once: true });
          img.src = ri.path(r, k);
          cell.appendChild(img);
        }
        drum.appendChild(cell);
      }
      wrap.appendChild(drum);
      container.appendChild(wrap);

      reels.push({
        el: wrap, drumEl: drum, pos: RNG.int(0, SYM_COUNT - 1), speed: 0,
        state: 'stopped', targetAbs: 0
      });
      render(r);
    }
  }

  function render(r) {
    const reel = reels[r];
    reel.drumEl.style.transform =
      'translateZ(' + (-RADIUS) + 'px) rotateX(' + (-reel.pos * DEG_PER_SYM) + 'deg)';
  }

  function setLight(r, lit) {
    reels[r].el.classList.toggle('lit', lit);
    reels[r].el.classList.toggle('dim', !lit);
  }

  const Reels = {
    init(container) {
      buildDom(container);
    },

    onAllStopped(cb) { onAllStoppedCb = cb; },

    /**
     * レバーON: WIN/LOSEに応じた停止目標を事前計算して回転開始
     * @param {boolean} isWin - 当たりかどうか
     */
    startSpin(isWin) {
      activeIsWin = isWin;
      stopsEnabled = false;

      if (isWin) {
        /* WIN: SEVが揃う停止パターンをランダムに選択 */
        const patterns = findWinPositions();
        if (patterns.length > 0) {
          const pat = RNG.pick(patterns);
          winPositions = pat.positions.slice();
        } else {
          /* フォールバック: 横中段 */
          winPositions = [0, 2, 4];
        }
      } else {
        /* LOSE: SEVが揃わない出目 */
        const losePos = findLosePositions();
        winPositions = losePos;
      }

      for (let r = 0; r < 3; r++) {
        const reel = reels[r];
        reel.state = 'spinning';
        reel.speed = SPIN_SPEED * (0.95 + r * 0.03);
        setLight(r, false);
      }
    },

    /** 演出読み込み完了→ボタン点灯 */
    enableStops() {
      stopsEnabled = true;
      for (let r = 0; r < 3; r++) {
        if (reels[r].state === 'spinning') setLight(r, true);
      }
      EventBus.emit('reels:buttonsLit');
    },

    canStop(r) {
      return stopsEnabled && reels[r].state === 'spinning';
    },

    /**
     * 停止ボタン押下
     * 押し順に関わらず、事前に計算した停止位置へ引き込む
     */
    requestStop(r) {
      if (!this.canStop(r)) return false;
      const reel = reels[r];
      const targetPos = winPositions[r];
      const base = Math.floor(reel.pos) + MIN_SLIP;

      let targetAbs;
      if (targetPos !== null && targetPos !== undefined) {
        const dist = ((targetPos - (base % SYM_COUNT)) % SYM_COUNT + SYM_COUNT) % SYM_COUNT;
        targetAbs = base + dist;
      } else {
        targetAbs = base + RNG.int(0, 3);
      }

      reel.targetAbs = targetAbs;
      reel.state = 'stopping';
      return true;
    },

    /**
     * プッシュ再抽選で当たりになった場合に
     * まだ停止していないリールの停止目標を当たり位置に更新する
     */
    updateWinPositions() {
      const strips = GAME_DATA.reelStrips;
      const patterns = findWinPositions();
      if (patterns.length === 0) return;

      /* まだ停止していないリールを確認 */
      const stoppedPos = reels.map((reel, r) =>
        reel.state === 'stopped' ? Math.floor(reel.pos) % SYM_COUNT : null);

      /* 既に停止したリールの位置から、対応する揃いパターンを選ぶ */
      let bestPattern = null;
      for (const pat of patterns) {
        let compatible = true;
        for (let r = 0; r < 3; r++) {
          if (stoppedPos[r] !== null && pat.positions[r] !== stoppedPos[r]) {
            compatible = false;
            break;
          }
        }
        if (compatible) { bestPattern = pat; break; }
      }

      if (bestPattern) {
        winPositions = bestPattern.positions.slice();
      } else {
        /* 互換パターンがなければ横中段のみ試みる */
        const hp = patterns.find(p => p.type === 'horizontal');
        if (hp) winPositions = hp.positions.slice();
      }
      activeIsWin = true;
    },

    /** メインループから毎フレーム呼ぶ */
    update(dt) {
      let changed = false;
      for (let r = 0; r < 3; r++) {
        const reel = reels[r];
        if (reel.state === 'spinning') {
          reel.pos += reel.speed * dt;
          render(r);
        } else if (reel.state === 'stopping') {
          reel.speed = Math.min(STOP_MAX, reel.speed + STOP_ACCEL * dt);
          reel.pos += reel.speed * dt;
          if (reel.pos >= reel.targetAbs) {
            reel.pos = reel.targetAbs % SYM_COUNT;
            reel.state = 'stopped';
            reel.speed = 0;
            setLight(r, false);
            changed = true;
          }
          render(r);
        }
      }
      if (changed && reels.every(x => x.state === 'stopped')) {
        stopsEnabled = false;
        if (onAllStoppedCb) onAllStoppedCb(activeIsWin);
      }
    },

    isSpinning() { return reels.some(x => x.state !== 'stopped'); },

    /** 当たり時: リール点滅 */
    blink(ms) {
      reels.forEach(reel => reel.el.classList.add('blink'));
      setTimeout(() => reels.forEach(reel => reel.el.classList.remove('blink')),
        ms || GAME_DATA.config.reelBlinkMs);
    }
  };

  window.Reels = Reels;
})();
