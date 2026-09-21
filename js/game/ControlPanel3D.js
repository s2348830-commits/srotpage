/* ============================================================
 * js/game/ControlPanel3D.js  ―  3D操作パネル（レバーボタンUI.html採用）
 *
 *  レバーボタンUI.html の three.js シーンをそのまま移植:
 *   - ダークメタルの操作パネル台座
 *   - 黒クリアコートボール＋メタルシャフトのレバー（バネ物理で揺れ戻る）
 *   - 銀ベゼル＋アクリルリング/コアの発光ストップボタン
 *     （消灯=白 / 押せる=青発光 / 押した後=赤発光）
 *
 *  既存のゲームロジックとはDOM経由で連動する:
 *   - 3Dレバー/ボタンのクリック → 非表示のDOMボタン(#lever-btn/#stop-N)へ転送
 *   - DOMボタンの状態(.lit/.pressed/.pulled/disabled) → 毎フレーム3Dへ反映
 *  そのためキーボード操作・AUTO・押し順ナビ等は全てそのまま機能する。
 *
 *  three.js(js/lib/three.min.js)が読み込めない環境では何もせず、
 *  従来のCSS製レバー/ボタンにフォールバックする。
 * ============================================================ */
(function () {
  'use strict';

  function init() {
    if (!window.THREE) return false;                 // フォールバック（CSS UI）
    const host = document.getElementById('panel3d');
    const controlArea = document.getElementById('control-area');
    const leverDom = document.getElementById('lever-btn');
    const stopDoms = [0, 1, 2].map(i => document.getElementById('stop-' + i));
    if (!host || !controlArea || !leverDom) return false;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      console.warn('[Panel3D] WebGL初期化失敗。CSS UIで表示します。', e);
      return false;
    }

    controlArea.classList.add('has-3d');       // 先に表示切替してから実寸を測る
    const W = host.clientWidth || 460;
    const H = host.clientHeight || 170;

    /* --- シーン・カメラ（レバーボタンUI.html準拠） --- */
    const scene = new THREE.Scene();
    scene.background = null;                          // 背景はCSSのダークパネル

    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 1000);
    camera.position.set(0, 0, 4.2);
    camera.lookAt(0, 0, 0);

    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);

    /* --- ライティング --- */
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight.position.set(2, 4, 5);
    scene.add(dirLight);

    /* --- 操作パネル台座 --- */
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(6.5, 1.8, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x333336, roughness: 0.6, metalness: 0.4 })
    );
    panel.position.set(-0.1, 0, -0.25);
    scene.add(panel);

    /* --- 左側：レバー --- */
    const leverPivot = new THREE.Group();
    leverPivot.position.set(-2.2, 0, 0);
    leverPivot.rotation.x = Math.PI / 2;
    scene.add(leverPivot);

    const shaftLength = 1.4;
    const shaftGeo = new THREE.CylinderGeometry(0.06, 0.09, shaftLength, 16);
    shaftGeo.translate(0, shaftLength / 2, 0);
    const shaft = new THREE.Mesh(shaftGeo,
      new THREE.MeshStandardMaterial({ color: 0xdcdcdc, metalness: 0.9, roughness: 0.1 }));
    leverPivot.add(shaft);

    const ballMat = new THREE.MeshPhysicalMaterial({
      color: 0x000000, roughness: 0.1, metalness: 0.2,
      clearcoat: 1.0, clearcoatRoughness: 0.1
    });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.36, 32, 32), ballMat);
    ball.position.y = shaftLength;
    leverPivot.add(ball);

    const hitMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 16, 16),
      new THREE.MeshBasicMaterial({ visible: false }));
    hitMesh.position.y = shaftLength;
    leverPivot.add(hitMesh);

    /* --- 右側：3つのストップボタン --- */
    const buttons = [];
    const buttonPositions = [-0.6, 0.5, 1.6];

    for (let i = 0; i < 3; i++) {
      const btnGroup = new THREE.Group();
      btnGroup.position.set(buttonPositions[i], 0, 0);

      // 銀色のベゼル
      const bzGeo = new THREE.CylinderGeometry(0.46, 0.50, 0.1, 32);
      bzGeo.rotateX(Math.PI / 2);
      btnGroup.add(new THREE.Mesh(bzGeo,
        new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.85, roughness: 0.15 })));

      // 可動ボタン本体
      const movableBtnGroup = new THREE.Group();
      movableBtnGroup.position.z = 0.03;

      // 外縁リング（アクリル・発光で色がつく）
      const ringMat = new THREE.MeshPhysicalMaterial({
        color: 0x050505, emissive: 0x000000, emissiveIntensity: 0,
        roughness: 0.1, metalness: 0.1, clearcoat: 1.0, clearcoatRoughness: 0.1
      });
      movableBtnGroup.add(new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.08, 16, 32), ringMat));

      // 中心コア
      const coreGeo = new THREE.SphereGeometry(0.36, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      coreGeo.rotateX(Math.PI / 2);
      coreGeo.scale(1, 1, 0.25);
      const coreMat = new THREE.MeshPhysicalMaterial({
        color: 0x050505, emissive: 0x000000, emissiveIntensity: 0,
        roughness: 0.2, clearcoat: 1.0, clearcoatRoughness: 0.2
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.z = 0.01;
      movableBtnGroup.add(coreMesh);

      // ボタン周囲を照らす光源
      const glowLight = new THREE.PointLight(0x000000, 0, 2.0);
      glowLight.position.z = 0.2;
      movableBtnGroup.add(glowLight);

      btnGroup.add(movableBtnGroup);
      scene.add(btnGroup);

      buttons.push({
        group: movableBtnGroup, ringMat, coreMat, glowLight,
        targetZ: 0.03, currentZ: 0.03, isPressed: false, state: 'off'
      });
    }

    /* --- 発光（emissive）コントロール（レバーボタンUI.html準拠） --- */
    function setButtonState(btn, state) {
      if (btn.state === state) return;
      btn.state = state;
      if (state === 'off') {
        btn.ringMat.color.setHex(0x000000);
        btn.ringMat.emissive.setHex(0xff0011);
        btn.ringMat.emissiveIntensity = 2.0;
        btn.coreMat.color.setHex(0x000000);
        btn.coreMat.emissive.setHex(0xff88aa);
        btn.coreMat.emissiveIntensity = 1.0;
        btn.glowLight.color.setHex(0xff0022);
        btn.glowLight.intensity = 1.5;
      } else if (state === 'blue') {
        btn.ringMat.color.setHex(0x000000);
        btn.ringMat.emissive.setHex(0x0033ff);
        btn.ringMat.emissiveIntensity = 2.0;
        btn.coreMat.color.setHex(0x000000);
        btn.coreMat.emissive.setHex(0x88ccff);
        btn.coreMat.emissiveIntensity = 1.0;
        btn.glowLight.color.setHex(0x0055ff);
        btn.glowLight.intensity = 1.5;
      } else if (state === 'red') {
        btn.ringMat.color.setHex(0x000000);
        btn.ringMat.emissive.setHex(0xff0011);
        btn.ringMat.emissiveIntensity = 2.0;
        btn.coreMat.color.setHex(0x000000);
        btn.coreMat.emissive.setHex(0xff88aa);
        btn.coreMat.emissiveIntensity = 1.0;
        btn.glowLight.color.setHex(0xff0022);
        btn.glowLight.intensity = 1.5;
      }
    }
    buttons.forEach(btn => setButtonState(btn, 'off'));

    /* --- レバーのバネ物理（レバーボタンUI.html準拠） --- */
    const BASE_ANGLE = Math.PI / 2;
    const MAX_ANGLE = BASE_ANGLE + 1.25;
    let currentAngle = BASE_ANGLE;
    let pullPhase = 0;
    let velocity = 0;
    const springK = 0.26;
    const damping = 0.74;
    let prevPulled = false;

    function startPull() {
      if (pullPhase === 0) pullPhase = 1;
    }

    /* --- クリック判定 → 非表示DOMボタンへ転送 --- */
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function onPointerDown(e) {
      const rect = renderer.domElement.getBoundingClientRect();
      const clientX = e.clientX != null ? e.clientX : (e.touches && e.touches[0].clientX);
      const clientY = e.clientY != null ? e.clientY : (e.touches && e.touches[0].clientY);
      if (clientX == null || clientY == null) return;
      mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);

      // 1. レバー（左側エリアのタップでも反応）
      const leverHit = raycaster.intersectObject(hitMesh);
      if (leverHit.length > 0 || mouse.x < -0.45) {
        leverDom.click();                       // ゲームロジックへ（disabled中は無効）
        return;
      }
      // 2. ボタン（青の時だけゲーム側が受け付ける）
      let hitAny = false;
      buttons.forEach((btn, i) => {
        if (hitAny) return;
        const btnHit = raycaster.intersectObjects(btn.group.children, true);
        if (btnHit.length > 0) { stopDoms[i].click(); hitAny = true; }
      });
      // フォールバック（ボタン付近のタップ）
      if (!hitAny && mouse.x >= -0.45) {
        if (mouse.x < 0.05) stopDoms[0].click();
        else if (mouse.x < 0.45) stopDoms[1].click();
        else stopDoms[2].click();
      }
    }
    renderer.domElement.addEventListener('mousedown', onPointerDown);
    renderer.domElement.addEventListener('touchstart', (e) => {
      if (e.cancelable) e.preventDefault();
      onPointerDown(e);
    }, { passive: false });

    /* --- 毎フレーム: DOM状態→3D反映 ＆ アニメーション --- */
    function animate() {
      requestAnimationFrame(animate);

      // DOMレバーの .pulled 出現でプル開始（クリック/Space/AUTO共通）
      const pulled = leverDom.classList.contains('pulled');
      if (pulled && !prevPulled) startPull();
      prevPulled = pulled;

      // レバーのバネ挙動
      if (pullPhase === 1) {
        currentAngle += (MAX_ANGLE - currentAngle) * 0.38;
        if (MAX_ANGLE - currentAngle < 0.01) {
          currentAngle = MAX_ANGLE;
          pullPhase = 2;
        }
      } else if (pullPhase === 2) {
        const springForce = -springK * (currentAngle - BASE_ANGLE);
        velocity += springForce;
        velocity *= damping;
        currentAngle += velocity;
        if (Math.abs(currentAngle - BASE_ANGLE) < 0.001 && Math.abs(velocity) < 0.001) {
          currentAngle = BASE_ANGLE;
          velocity = 0;
          pullPhase = 0;
        }
      }
      leverPivot.rotation.x = currentAngle;

      // DOMボタン状態 → 発光状態（lit=青 / pressed=赤 / その他=消灯）
      buttons.forEach((btn, i) => {
        const dom = stopDoms[i];
        const state = dom.classList.contains('lit') ? 'blue'
                    : dom.classList.contains('pressed') ? 'red' : 'off';
        if (state === 'red' && btn.state !== 'red') btn.isPressed = true;  // 押し込み
        setButtonState(btn, state);

        // 押し込みアニメーション
        if (btn.isPressed) {
          btn.targetZ = -0.02;
          if (Math.abs(btn.currentZ - btn.targetZ) < 0.01) btn.isPressed = false;
        } else {
          btn.targetZ = 0.03;
        }
        btn.currentZ += (btn.targetZ - btn.currentZ) * 0.35;
        btn.group.position.z = btn.currentZ;
      });

      renderer.render(scene, camera);
    }
    animate();

    return true;
  }

  window.addEventListener('DOMContentLoaded', () => {
    try {
      init();
    } catch (e) {
      console.warn('[Panel3D] 3Dパネル初期化エラー。CSS UIで表示します。', e);
      const ca = document.getElementById('control-area');
      if (ca) ca.classList.remove('has-3d');
    }
  });
})();
