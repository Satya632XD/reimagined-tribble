// setup.js
(function () {
  'use strict';

  if (!window.GAME) { console.error('[setup.js] GAME global not found.'); return; }
  if (!window.THREE) { console.error('[setup.js] THREE global not found.'); return; }

  var GAME = window.GAME;

  if (!GAME.scene) GAME.scene = new THREE.Scene();
  if (!GAME.camera) {
    GAME.camera = new THREE.PerspectiveCamera(75, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 1000);
  }
  if (!GAME.renderer) {
    try {
      GAME.renderer = new THREE.WebGLRenderer({ canvas: GAME.canvas || undefined, antialias: true });
    } catch (err) { console.error('[setup.js] Failed to create renderer:', err); return; }
  }
  if (!GAME.clock) GAME.clock = new THREE.Clock();

  if (!GAME.visuals) GAME.visuals = { lights: {}, materials: {}, particleSystems: [] };
  else {
    if (!GAME.visuals.lights) GAME.visuals.lights = {};
    if (!GAME.visuals.materials) GAME.visuals.materials = {};
    if (!GAME.visuals.particleSystems) GAME.visuals.particleSystems = [];
  }
  if (!GAME.scene.userData) GAME.scene.userData = {};
  if (!GAME.scene.userData.colliders) GAME.scene.userData.colliders = [];
  if (!GAME.scene.userData.obstacles) GAME.scene.userData.obstacles = [];

  GAME.renderer.setSize(window.innerWidth, window.innerHeight, false);
  GAME.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  GAME.renderer.shadowMap.enabled = true;

  GAME.camera.position.set(0, 2, 6);

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

  if (!GAME.visuals.materials.ground) {
    GAME.visuals.materials.ground = new THREE.MeshBasicMaterial({ color: 0x3a3a3a });
  }
  var groundGeometry = new THREE.PlaneGeometry(200, 200);
  var groundMesh = new THREE.Mesh(groundGeometry, GAME.visuals.materials.ground);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  groundMesh.name = 'GroundPlane';
  GAME.scene.add(groundMesh);
  GAME.scene.userData.groundMesh = groundMesh;

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function getObstacleMaterial(color) {
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.7,
      metalness: 0.08
    });
  }

  function createObstacleMesh(config) {
    var mesh;
    var material = getObstacleMaterial(config.color);

    if (config.type === 'cylinder') {
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(config.radiusTop, config.radiusBottom, config.height, config.segments || 10, 1),
        material
      );
      mesh.position.y = config.height * 0.5;
      mesh.scale.set(config.scaleX || 1, config.scaleY || 1, config.scaleZ || 1);
    } else {
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(config.width, config.height, config.depth),
        material
      );
      mesh.position.y = config.height * 0.5;
      mesh.scale.set(config.scaleX || 1, config.scaleY || 1, config.scaleZ || 1);
      mesh.rotation.y = config.rotationY || 0;
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = config.name || 'Obstacle';
    mesh.userData.isObstacle = true;
    return mesh;
  }

  function placeStaticObstacles() {
    var obstacleConfigs = [
      { type: 'box', width: 3.6, height: 2.2, depth: 2.6, color: 0x6f5b4b, rotationY: 0.2, name: 'Obstacle_Box_0' },
      { type: 'cylinder', radiusTop: 1.3, radiusBottom: 1.6, height: 4.8, color: 0x445c70, segments: 10, name: 'Obstacle_Cyl_1' },
      { type: 'box', width: 5.2, height: 1.6, depth: 2.0, color: 0x4f6b4f, rotationY: 0.9, name: 'Obstacle_Box_2' },
      { type: 'cylinder', radiusTop: 1.1, radiusBottom: 1.1, height: 3.4, color: 0x7a6a3e, segments: 12, name: 'Obstacle_Cyl_3' },
      { type: 'box', width: 2.4, height: 5.2, depth: 2.4, color: 0x5a4b78, rotationY: 0.45, name: 'Obstacle_Box_4' },
      { type: 'box', width: 4.4, height: 2.8, depth: 1.8, color: 0x7a4f3b, rotationY: 1.15, name: 'Obstacle_Box_5' },
      { type: 'cylinder', radiusTop: 1.8, radiusBottom: 1.4, height: 2.6, color: 0x6b7a3f, segments: 11, name: 'Obstacle_Cyl_6' },
      { type: 'box', width: 2.8, height: 3.8, depth: 3.2, color: 0x3f6774, rotationY: 0.7, name: 'Obstacle_Box_7' },
      { type: 'cylinder', radiusTop: 1.0, radiusBottom: 1.8, height: 5.6, color: 0x885c42, segments: 10, name: 'Obstacle_Cyl_8' },
      { type: 'box', width: 6.0, height: 1.4, depth: 2.4, color: 0x54656f, rotationY: 0.35, name: 'Obstacle_Box_9' },
      { type: 'cylinder', radiusTop: 1.4, radiusBottom: 1.2, height: 4.0, color: 0x6d4a6c, segments: 12, name: 'Obstacle_Cyl_10' },
      { type: 'box', width: 3.0, height: 4.6, depth: 2.0, color: 0x5f6e44, rotationY: 1.5, name: 'Obstacle_Box_11' }
    ];

    var placed = [];
    var maxAttemptsPerObstacle = 60;
    var worldLimit = 86;
    var spawnClearance = 8;
    var i, j, config, mesh, colliderBox, x, z, tries, centerDistSq, ok, radius, other, dx, dz, distSq;

    GAME.scene.userData.colliders.length = 0;
    GAME.scene.userData.obstacles.length = 0;

    for (i = 0; i < obstacleConfigs.length; i++) {
      config = obstacleConfigs[i];
      mesh = createObstacleMesh(config);

      radius = 0;
      if (config.type === 'cylinder') {
        radius = Math.max(config.radiusTop, config.radiusBottom) + 0.6;
      } else {
        radius = Math.max(config.width, config.depth) * 0.5 + 0.7;
      }

      tries = 0;
      ok = false;

      while (tries < maxAttemptsPerObstacle && !ok) {
        x = randomRange(-worldLimit, worldLimit);
        z = randomRange(-worldLimit, worldLimit);

        centerDistSq = x * x + z * z;
        if (centerDistSq < (spawnClearance + radius) * (spawnClearance + radius)) {
          tries++;
          continue;
        }

        ok = true;
        for (j = 0; j < placed.length; j++) {
          other = placed[j];
          dx = x - other.x;
          dz = z - other.z;
          distSq = dx * dx + dz * dz;
          if (distSq < (radius + other.radius + 1.8) * (radius + other.radius + 1.8)) {
            ok = false;
            break;
          }
        }

        if (ok) {
          mesh.position.x = x;
          mesh.position.z = z;
        } else {
          tries++;
        }
      }

      if (!ok) {
        mesh.position.x = (i % 2 === 0 ? 1 : -1) * (18 + i * 2.5);
        mesh.position.z = (i % 3 === 0 ? 1 : -1) * (14 + i * 1.7);
      }

      mesh.updateMatrixWorld(true);

      colliderBox = new THREE.Box3();
      colliderBox.setFromObject(mesh);

      GAME.scene.add(mesh);
      GAME.scene.userData.obstacles.push(mesh);
      GAME.scene.userData.colliders.push(colliderBox.clone());

      placed.push({
        x: mesh.position.x,
        z: mesh.position.z,
        radius: radius
      });
    }
  }

  placeStaticObstacles();

  if (GAME.hud && typeof GAME.hud.hideLoadingScreen === 'function') {
    GAME.hud.hideLoadingScreen();
  }

  function animate() {
    var deltaTime = 0;
    if (GAME.clock && typeof GAME.clock.getDelta === 'function') {
      deltaTime = GAME.clock.getDelta();
    }
    var callbacks = GAME.updateCallbacks || [];
    for (var i = 0; i < callbacks.length; i++) {
      var fn = callbacks[i];
      if (typeof fn !== 'function') continue;
      try { fn(deltaTime); } catch (err) { console.error('[setup.js] Update callback failed:', err); }
    }
    if (GAME.renderer && GAME.scene && GAME.camera) {
      GAME.renderer.render(GAME.scene, GAME.camera);
    }
    requestAnimationFrame(animate);
  }
  animate();

  console.log('[setup.js] Engine initialized');
})();
