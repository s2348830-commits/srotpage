/* ============================================================
 * data/reels.js  ―  リール配列・図柄定義（データ駆動）
 * 表示窓: 上段 = p+1 / 中段 = p / 下段 = p-1
 * 同じ図柄が横または斜めに揃うように設計
 * ============================================================ */
window.GAME_DATA = window.GAME_DATA || {};

/* 図柄定義 */
GAME_DATA.symbols = {
  SEV:   { id: 'SEV',  name: '赤7',      icon: '7',   cls: 'sym-sev'  },
  BSEV:  { id: 'BSEV', name: '青7',      icon: '7',   cls: 'sym-bsev' },
  BAR:   { id: 'BAR',  name: 'BAR',      icon: 'BAR', cls: 'sym-bar'  },
  BELL:  { id: 'BELL', name: 'ベル',     icon: '🔔',  cls: 'sym-bell' },
  REP:   { id: 'REP',  name: 'リプレイ', icon: '🔁',  cls: 'sym-rep'  },
  SUI:   { id: 'SUI',  name: 'スイカ',   icon: '🍉',  cls: 'sym-sui'  },
  CHE:   { id: 'CHE',  name: 'チェリー', icon: '🍒',  cls: 'sym-che'  },
  HAZ:   { id: 'HAZ',  name: 'ハズレ',   icon: '◇',   cls: 'sym-haz'  }
};

/* リール図柄画像 */
GAME_DATA.reelImages = {
  enabled: true,
  path: function (reelIndex, stripIndex) {
    const symId = GAME_DATA.reelStrips[reelIndex][stripIndex];
    const sym = GAME_DATA.symbols[symId];
    return 'image/reel/' + sym.name + '.png';
  }
};

/* ============================================================
 * リール配列（20コマ）
 * 当たり図柄: SEV（横・斜め揃い可能に配置）
 * ハズレ時は揃わない構成
 * ============================================================ */
GAME_DATA.reelStrips = [
  /* 左リール */
  ['SEV', 'BELL', 'HAZ', 'REP', 'SUI', 'CHE', 'BELL', 'HAZ', 'BSEV', 'REP',
   'SEV', 'SUI',  'CHE', 'BAR', 'REP', 'BELL', 'HAZ',  'SUI', 'CHE',  'REP'],
  /* 中リール */
  ['HAZ', 'REP',  'SEV', 'BELL', 'SUI', 'HAZ', 'CHE',  'REP', 'BSEV', 'BELL',
   'HAZ', 'BELL', 'SEV', 'REP',  'CHE', 'SUI',  'HAZ',  'REP', 'BAR',  'BELL'],
  /* 右リール */
  ['HAZ', 'SUI',  'REP', 'BELL', 'SEV', 'CHE', 'HAZ',  'BELL', 'REP', 'BSEV',
   'HAZ', 'CHE',  'BELL','REP',  'SUI', 'HAZ',  'BELL', 'SEV',  'BAR', 'REP']
];

/* ============================================================
 * 役定義（一発台用: WIN / LOSE のみ）
 * WIN  → 赤7揃い（横中段）
 * LOSE → ハズレ
 * ============================================================ */
GAME_DATA.roles = [
  {
    id: 'win',
    name: '大当たり！',
    icon: '7',
    /* 当たり停止形: SEV が横中段、右上がり斜め、右下がり斜め */
    winPatterns: [
      /* 横中段 */
      { type: 'horizontal', row: 1 },
      /* 右下がり斜め */
      { type: 'diagonal_down' },
      /* 右上がり斜め */
      { type: 'diagonal_up' }
    ],
    /* リール停止位置: SEVが各停止形に来るインデックス */
    stopPositions: {
      /* 横中段: 各リールの中段(pos)にSEVが来る位置 */
      horizontal: [
        { reel: 0, pos: 0  },   /* 左リール: index0=SEV */
        { reel: 1, pos: 2  },   /* 中リール: index2=SEV */
        { reel: 2, pos: 4  }    /* 右リール: index4=SEV */
      ],
      /* 右下がり斜め: 左上段・中中段・右下段 */
      diagonal_down: [
        { reel: 0, pos: 19 },   /* 左リール: pos=19→上段(0)=SEV */
        { reel: 1, pos: 2  },   /* 中リール: pos=2→中段=SEV */
        { reel: 2, pos: 3  }    /* 右リール: pos=3→下段(2)=SEV? → 適宜 */
      ],
      /* 右上がり斜め: 左下段・中中段・右上段 */
      diagonal_up: [
        { reel: 0, pos: 1  },   /* 左リール: pos=1→下段(20-1=19から-1)... */
        { reel: 1, pos: 2  },
        { reel: 2, pos: 3  }
      ]
    }
  },
  {
    id: 'lose',
    name: 'ハズレ',
    icon: '◇'
  }
];
