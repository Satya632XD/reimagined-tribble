// mechanics.js
(function () {
  'use strict';

  // === SAFETY CHECKS ===
  if (!window.GAME) {
    console.error('[mechanics.js] GAME global not found.');
    return;
  }

  if (!window.THREE) {
    console.error('[mechanics.js] THREE global not found.');
    return;
  }

  var GAME = window.GAME;

  if (!GAME.scene || !GAME.camera) {
    console.warn('[mechanics.js] Scene or camera missing. Mechanics initialization skipped.');
    return;
  }

  if (!GAME.entities) {
    GAME.entities = { player: null, enemies: [], pickups: [], projectiles: [] };
  }

  if (!GAME.input) {
    GAME.input = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      sprint: false,
      mouseX: 0,
      mouseY: 0,
      pointerLocked: false
    };
  }

  if (!GAME.state) {
    GAME.state = {
      score: 0,
      health: 100,
      maxHealth: 100,
      isRunning: false,
      isPaused: false,
      isGameOver: false
    };
  }

  // === PHYSICS / MOVEMENT CONSTANTS ===
  var PLAYER_HEIGHT = 2;
  var PLAYER_HALF_HEIGHT = PLAYER_HEIGHT * 0.5;
  var EYE_OFFSET = 0.6;
  var GROUND_Y = PLAYER_HALF_HEIGHT;

  var GRAVITY = -24;
  var JUMP_IMPULSE = 9;
  var BASE_SPEED = 6;
  var SPRINT_MULTIPLIER = 1.6;
  var PICKUP_COUNT = 5;
  var PICKUP_RADIUS_SQ = 2.25;

  // === REUSABLE TEMP VALUES ===
  var moveX = 0;
  var moveZ = 0;
  var yaw = 0;
  var pitch = 0;

  // === PLAYER CREATION ===
  if (!GAME.entities.player) {
    var playerGeometry = new THREE.BoxGeometry(0.8, PLAYER_HEIGHT, 0.8);
    var playerMaterial = new THREE.MeshNormalMaterial();
    var playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);

    playerMesh.position.set(0, GROUND_Y, 0);
    playerMesh.castShadow = true;
    playerMesh.receiveShadow = true;
    playerMesh.name = 'Player';

    playerMesh.velocity = new THREE.Vector3(0, 0, 0);
    playerMesh.grounded = true;
    playerMesh.jumpConsumed = false;
    playerMesh.yaw = 0;
    playerMesh.pitch = 0;
    playerMesh.takeDamage = function () {};

    GAME.scene.add(playerMesh);
    GAME.entities.player = playerMesh;
  }

  var player = GAME.entities.player;

  // === CAMERA CONFIGURATION ===
  GAME.camera.rotation.order = 'YXZ';

  // === INPUT HANDLING ===
  function setMovementState(code, isDown) {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        GAME.input.forward = isDown;
        break;

      case 'KeyS':
      case 'ArrowDown':
        GAME.input.backward = isDown;
        break;

      case 'KeyA':
      case 'ArrowLeft':
        GAME.input.left = isDown;
        break;

      case 'KeyD':
      case 'ArrowRight':
        GAME.input.right = isDown;
        break;

      case 'Space':
        GAME.input.jump = isDown;
        if (!isDown) {
          player.jumpConsumed = false;
        }
        break;

      case 'ShiftLeft':
      case 'ShiftRight':
        GAME.input.sprint = isDown;
        break;
    }
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    setMovementState(event.code, true);
  }

  function onKeyUp(event) {
    setMovementState(event.code, false);
  }

  document.addEventListener('keydown', onKeyDown, false);
  document.addEventListener('keyup', onKeyUp, false);

  // === POINTER LOCK / MOUSE LOOK ===
  function onPointerLockChange() {
    GAME.input.pointerLocked = (document.pointerLockElement === GAME.canvas);
    if (GAME.input.pointerLocked && GAME.hud && typeof GAME.hud.showStatus === 'function') {
      GAME.hud.showStatus('Pointer locked', 1200);
    }
  }

  function onPointerLockError() {
    GAME.input.pointerLocked = false;
    if (GAME.hud && typeof GAME.hud.showStatus === 'function') {
      GAME.hud.showStatus('Pointer lock unavailable', 2000);
    }
  }

  function onCanvasClick(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    if (GAME.canvas && typeof GAME.canvas.requestPointerLock === 'function') {
      GAME.canvas.requestPointerLock();
    }
  }

  function onMouseMove(event) {
    if (!GAME.input.pointerLocked) return;

    var sensitivity = 0.0025;

    yaw -= event.movementX * sensitivity;
    pitch -= event.movementY * sensitivity;

    var maxPitch = Math.PI / 2 - 0.01;
    if (pitch > maxPitch) pitch = maxPitch;
    if (pitch < -maxPitch) pitch = -maxPitch;

    GAME.input.mouseX = event.movementX || 0;
    GAME.input.mouseY = event.movementY || 0;
  }

  document.addEventListener('pointerlockchange', onPointerLockChange, false);
  document.addEventListener('pointerlockerror', onPointerLockError, false);
  document.addEventListener('mousemove', onMouseMove, false);

  if (GAME.canvas) {
    GAME.canvas.addEventListener('click', onCanvasClick, false);
  }

  // === PICKUP SPAWNING ===
  if (!GAME.entities.pickups) {
    GAME.entities.pickups = [];
  }

  var pickupGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  var pickupMaterial = new THREE.MeshNormalMaterial();

  function spawnPickups() {
    if (!GAME.scene) return;

    for (var i = 0; i < PICKUP_COUNT; i++) {
      var pickup = new THREE.Mesh(pickupGeometry, pickupMaterial);
      pickup.position.set(
        (Math.random() * 2 - 1) * 20,
        0.35,
        (Math.random() * 2 - 1) * 20
      );
      pickup.name = 'Pickup_' + i;
      pickup.userData.collectible = true;

      GAME.scene.add(pickup);
      GAME.entities.pickups.push(pickup);
    }
  }

  if (GAME.entities.pickups.length === 0) {
    spawnPickups();
  }

  // === PLAYER PHYSICS / MOVEMENT ===
  function updatePlayer(deltaTime) {
    if (!player || GAME.state.isPaused || GAME.state.isGameOver) return;

    // Sync view rotation.
    player.yaw = yaw;
    player.pitch = pitch;
    player.rotation.y = yaw;

    GAME.camera.rotation.y = yaw;
    GAME.camera.rotation.x = pitch;

    // Build movement from input and camera yaw.
    moveX = 0;
    moveZ = 0;

    if (GAME.input.forward) moveZ -= 1;
    if (GAME.input.backward) moveZ += 1;
    if (GAME.input.left) moveX -= 1;
    if (GAME.input.right) moveX += 1;

    if (moveX !== 0 || moveZ !== 0) {
      var length = Math.sqrt(moveX * moveX + moveZ * moveZ);
      moveX /= length;
      moveZ /= length;

      var speed = BASE_SPEED * (GAME.input.sprint ? SPRINT_MULTIPLIER : 1);
      var sinYaw = Math.sin(yaw);
      var cosYaw = Math.cos(yaw);

      var worldMoveX = moveX * cosYaw + moveZ * sinYaw;
      var worldMoveZ = moveZ * cosYaw - moveX * sinYaw;

      player.position.x += worldMoveX * speed * deltaTime;
      player.position.z += worldMoveZ * speed * deltaTime;
    }

    // Jump.
    if (GAME.input.jump && player.grounded && !player.jumpConsumed) {
      player.velocity.y = JUMP_IMPULSE;
      player.grounded = false;
      player.jumpConsumed = true;

      if (GAME.hud && typeof GAME.hud.showStatus === 'function') {
        GAME.hud.showStatus('Jump!', 500);
      }
    }

    // Gravity.
    player.velocity.y += GRAVITY * deltaTime;
    player.position.y += player.velocity.y * deltaTime;

    // Ground collision.
    if (player.position.y <= GROUND_Y) {
      player.position.y = GROUND_Y;
      if (player.velocity.y < 0) {
        player.velocity.y = 0;
      }
      player.grounded = true;
    }

    // Camera follow.
    GAME.camera.position.set(
      player.position.x,
      player.position.y + EYE_OFFSET,
      player.position.z
    );
  }

  // === PICKUP COLLECTION ===
  function checkPickups() {
    if (!player || !GAME.entities.pickups || GAME.entities.pickups.length === 0) return;
    if (GAME.state.isGameOver) return;

    for (var i = GAME.entities.pickups.length - 1; i >= 0; i--) {
      var pickup = GAME.entities.pickups[i];
      if (!pickup) {
        GAME.entities.pickups.splice(i, 1);
        continue;
      }

      var dx = player.position.x - pickup.position.x;
      var dy = (player.position.y + 0.2) - pickup.position.y;
      var dz = player.position.z - pickup.position.z;
      var distSq = dx * dx + dy * dy + dz * dz;

      if (distSq <= PICKUP_RADIUS_SQ) {
        GAME.scene.remove(pickup);
        GAME.entities.pickups.splice(i, 1);

        GAME.state.score += 10;

        if (GAME.hud && typeof GAME.hud.setScore === 'function') {
          GAME.hud.setScore(GAME.state.score);
        }

        if (GAME.hud && typeof GAME.hud.showStatus === 'function') {
          GAME.hud.showStatus('+10 points', 1000);
        }
      }
    }
  }

  // === DAMAGE STUB ===
  function damagePlayer(amount) {
    if (GAME.state.isGameOver) return;

    amount = typeof amount === 'number' ? amount : 0;
    if (amount <= 0) return;

    GAME.state.health = Math.max(0, GAME.state.health - amount);

    if (GAME.hud && typeof GAME.hud.setHealth === 'function') {
      GAME.hud.setHealth(GAME.state.health, GAME.state.maxHealth);
    }

    if (GAME.state.health <= 0) {
      GAME.state.isGameOver = true;
      GAME.state.isRunning = false;

      if (GAME.hud && typeof GAME.hud.showStatus === 'function') {
        GAME.hud.showStatus('Game Over', 2500);
      }
    }
  }

  player.takeDamage = damagePlayer;

  // === REGISTER PER-FRAME UPDATE ===
  if (typeof GAME.registerUpdate === 'function') {
    GAME.registerUpdate(function (deltaTime) {
      updatePlayer(deltaTime);
      checkPickups();
    });
  }

  // === INITIAL HUD SYNC ===
  if (GAME.hud) {
    if (typeof GAME.hud.setScore === 'function') {
      GAME.hud.setScore(GAME.state.score);
    }

    if (typeof GAME.hud.setHealth === 'function') {
      GAME.hud.setHealth(GAME.state.health, GAME.state.maxHealth);
    }
  }

  // === GAME STATE ===
  GAME.state.isRunning = true;

  console.log('[mechanics.js] Gameplay initialized');
})();
