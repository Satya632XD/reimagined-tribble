// setup.js
(function () {
  'use strict';

  // === SAFETY CHECKS ===
  if (!window.GAME) {
    console.error('[setup.js] GAME global not found.');
    return;
  }

  if (!window.THREE) {
    console.error('[setup.js] THREE global not found.');
    return;
  }

  var GAME = window.GAME;

  // === CORE ENGINE OBJECTS ===
  if (!GAME.scene) {
    GAME.scene = new THREE.Scene();
  }

  if (!GAME.camera) {
    GAME.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.1,
      1000
    );
  }

  if (!GAME.renderer) {
    try {
      GAME.renderer = new THREE.WebGLRenderer({
        canvas: GAME.canvas || undefined,
        antialias: true
      });
    } catch (err) {
      console.error('[setup.js] Failed to create renderer:', err);
      return;
    }
  }

  if (!GAME.clock) {
    GAME.clock = new THREE.Clock();
  }

  if (!GAME.visuals) {
    GAME.visuals = { lights: {}, materials: {}, particleSystems: [] };
  } else {
    if (!GAME.visuals.lights) GAME.visuals.lights = {};
    if (!GAME.visuals.materials) GAME.visuals.materials = {};
    if (!GAME.visuals.particleSystems) GAME.visuals.particleSystems = [];
  }

  if (!GAME.scene.userData) {
    GAME.scene.userData = {};
  }

  // === RENDERER SETUP ===
  GAME.renderer.setSize(window.innerWidth, window.innerHeight, false);
  GAME.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  GAME.renderer.shadowMap.enabled = true;

  // === DEFAULT CAMERA POSITION ===
  GAME.camera.position.set(0, 2, 6);

  // === RESIZE HANDLING ===
  function onResize() {
    if (!GAME.camera || !GAME.renderer) return;

    var width = window.innerWidth;
    var height = Math.max(1, window.innerHeight);

    GAME.camera.aspect = width / height;
    GAME.camera.updateProjectionMatrix();
    GAME.renderer.setSize(width, height, false);
  }

  window.addEventListener('resize', onResize, false);
  onResize();

  // === GROUND PLANE ===
  if (!GAME.visuals.materials.ground) {
    GAME.visuals.materials.ground = new THREE.MeshBasicMaterial({
      color: 0x3a3a3a
    });
  }

  var groundGeometry = new THREE.PlaneGeometry(200, 200);
  var groundMesh = new THREE.Mesh(groundGeometry, GAME.visuals.materials.ground);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  groundMesh.name = 'GroundPlane';
  GAME.scene.add(groundMesh);
  GAME.scene.userData.groundMesh = groundMesh;

  // === HUD / LOADING SCREEN ===
  if (GAME.hud && typeof GAME.hud.hideLoadingScreen === 'function') {
    GAME.hud.hideLoadingScreen();
  }

  // === MASTER ANIMATION LOOP ===
  function animate() {
    var deltaTime = 0;

    if (GAME.clock && typeof GAME.clock.getDelta === 'function') {
      deltaTime = GAME.clock.getDelta();
    }

    var callbacks = GAME.updateCallbacks || [];
    for (var i = 0; i < callbacks.length; i++) {
      var fn = callbacks[i];
      if (typeof fn !== 'function') continue;

      try {
        fn(deltaTime);
      } catch (err) {
        console.error('[setup.js] Update callback failed:', err);
      }
    }

    if (GAME.renderer && GAME.scene && GAME.camera) {
      GAME.renderer.render(GAME.scene, GAME.camera);
    }

    requestAnimationFrame(animate);
  }

  // === START LOOP ===
  animate();

  console.log('[setup.js] Engine initialized');
})();
