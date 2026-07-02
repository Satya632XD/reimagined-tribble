// mechanics.js
(function () {
  'use strict';

  if (!window.GAME) { console.error('[mechanics.js] GAME global not found.'); return; }
  if (!window.THREE) { console.error('[mechanics.js] THREE global not found.'); return; }

  var GAME = window.GAME;

  if (!GAME.scene || !GAME.camera) {
    console.warn('[mechanics.js] Scene or camera missing. Mechanics initialization skipped.');
    return;
  }
  if (!GAME.entities) GAME.entities = { player: null, enemies: [], pickups: [], projectiles: [] };
  if (!GAME.input) {
    GAME.input = { forward: false, backward: false, left: false, right: false, jump: false, sprint: false, mouseX: 0, mouseY: 0, pointerLocked: false };
  }
  if (!GAME.state) {
    GAME.state = { score: 0, health: 100, maxHealth: 100, isRunning: false, isPaused: false, isGameOver: false };
  }

  function ensureObjectiveState() {
    if (typeof GAME.state.isGameWon !== 'boolean') GAME.state.isGameWon = false;
    if (typeof GAME.state.pickupsCollected !== 'number') GAME.state.pickupsCollected = 0;
    if (typeof GAME.state.totalPickups !== 'number') GAME.state.totalPickups = 0;
    if (typeof GAME.state.objectiveTarget !== 'number') GAME.state.objectiveTarget = 5;
    if (typeof GAME.state.objectiveBonus !== 'number') GAME.state.objectiveBonus = 0;
  }
  ensureObjectiveState();

  if (!GAME.scene.userData) GAME.scene.userData = {};
  if (!GAME.scene.userData.colliders) GAME.scene.userData.colliders = [];

  var PLAYER_HEIGHT = 2;
  var PLAYER_HALF_HEIGHT = PLAYER_HEIGHT * 0.5;
  var EYE_OFFSET = 0.6;
  var GROUND_Y = PLAYER_HALF_HEIGHT;
  var GRAVITY = -24;
  var JUMP_IMPULSE = 9;
  var BASE_SPEED = 6;
  var SPRINT_MULTIPLIER = 1.6;

  var TOTAL_PICKUPS = 8;
  var OBJECTIVE_TARGET = 5;
  var PICKUP_RADIUS_SQ = 2.25;
  var WORLD_SPAWN_RADIUS = 22;
  var OBJECTIVE_REMINDER_DELAY = 2200;

  var moveX = 0, moveZ = 0, yaw = 0, pitch = 0;
  var objectiveReminderShown = false;

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
  GAME.camera.rotation.order = 'YXZ';

  function setMovementState(code, isDown) {
    switch (code) {
      case 'KeyW': case 'ArrowUp': GAME.input.forward = isDown; break;
      case 'KeyS': case 'ArrowDown': GAME.input.backward = isDown; break;
      case 'KeyA': case 'ArrowLeft': GAME.input.left = isDown; break;
      case 'KeyD': case 'ArrowRight': GAME.input.right = isDown; break;
      case 'Space':
        GAME.input.jump = isDown;
        if (!isDown) player.jumpConsumed = false;
        break;
      case 'ShiftLeft': case 'ShiftRight': GAME.input.sprint = isDown; break;
    }
  }

  function onKeyDown(e) { if (e.repeat) return; setMovementState(e.code, true); }
  function onKeyUp(e) { setMovementState(e.code, false); }
  document.addEventListener('keydown', onKeyDown, false);
  document.addEventListener('keyup', onKeyUp, false);

  function onPointerLockChange() {
    GAME.input.pointerLocked = (document.pointerLockElement === GAME.canvas);
    if (GAME.input.pointerLocked && GAME.hud && typeof GAME.hud.showStatus === 'function') {
      GAME.hud.showStatus('Pointer locked', 1200);
    }
  }

  function onPointerLockError() {
    GAME.input.pointerLocked = false;
    if (GAME.hud && typeof GAME.hud.showStatus === 'function') GAME.hud.showStatus('Pointer lock unavailable', 2000);
  }

  function onCanvasClick(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    if (GAME.canvas && typeof GAME.canvas.requestPointerLock === 'function') GAME.canvas.requestPointerLock();
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
  if (GAME.canvas) GAME.canvas.addEventListener('click', onCanvasClick, false);

  function getColliders() {
    var raw = GAME.scene && GAME.scene.userData ? GAME.scene.userData.colliders : null;
    var colliders = [];
    var i;
    if (!raw || !raw.length) return colliders;

    // Brute force is fine for this small obstacle count; revisit if this grows past ~50 colliders.
    for (i = 0; i < raw.length; i++) {
      if (raw[i] && raw[i].isBox3) colliders.push(raw[i]);
    }
    return colliders;
  }

  function getPlayerBoxAt(posX, posY, posZ) {
    var halfWidth = 0.4;
    return new THREE.Box3(
      new THREE.Vector3(posX - halfWidth, posY - PLAYER_HALF_HEIGHT, posZ - halfWidth),
      new THREE.Vector3(posX + halfWidth, posY + PLAYER_HALF_HEIGHT, posZ + halfWidth)
    );
  }

  function playerBoxOverlapsAnyCollider(playerBox, colliders) {
    var i;
    for (i = 0; i < colliders.length; i++) {
      if (colliders[i] && playerBox.intersectsBox(colliders[i])) return true;
    }
    return false;
  }

  function playerBoxOverlapsColliderXZ(playerBox, collider) {
    if (!collider) return false;
    return (
      playerBox.max.x >= collider.min.x &&
      playerBox.min.x <= collider.max.x &&
      playerBox.max.z >= collider.min.z &&
      playerBox.min.z <= collider.max.z
    );
  }

  function isPointBlocked(x, z, colliders, padding) {
    var i, box;
    if (!colliders || !colliders.length) return false;
    for (i = 0; i < colliders.length; i++) {
      box = colliders[i];
      if (!box) continue;
      if (
        x >= box.min.x - padding &&
        x <= box.max.x + padding &&
        z >= box.min.z - padding &&
        z <= box.max.z + padding
      ) {
        return true;
      }
    }
    return false;
  }

  function getClosestColliderDistanceSq(x, z, colliders) {
    var i, box, dx, dz, distSq, best = Infinity;
    if (!colliders || !colliders.length) return best;
    for (i = 0; i < colliders.length; i++) {
      box = colliders[i];
      if (!box) continue;
      dx = x - box.getCenter(new THREE.Vector3()).x;
      dz = z - box.getCenter(new THREE.Vector3()).z;
      distSq = dx * dx + dz * dz;
      if (distSq < best) best = distSq;
    }
    return best;
  }

  function clampToWorld(value, limit) {
    if (value > limit) return limit;
    if (value < -limit) return -limit;
    return value;
  }

  function createSpawnPointNearCollider(collider) {
    var center = new THREE.Vector3();
    var size = new THREE.Vector3();
    var angle, ring, x, z, tries, padding;

    collider.getCenter(center);
    collider.getSize(size);

    tries = 0;
    padding = 0.85;

    while (tries < 12) {
      angle = Math.random() * Math.PI * 2;
      ring = Math.max(size.x, size.z) * 0.5 + 1.6 + Math.random() * 2.8;
      x = center.x + Math.cos(angle) * ring;
      z = center.z + Math.sin(angle) * ring;

      x = clampToWorld(x, WORLD_SPAWN_RADIUS);
      z = clampToWorld(z, WORLD_SPAWN_RADIUS);

      if (!isPointBlocked(x, z, getColliders(), padding)) {
        return new THREE.Vector3(x, 0.35, z);
      }
      tries++;
    }

    return new THREE.Vector3(
      clampToWorld(center.x + 5 + Math.random() * 3, WORLD_SPAWN_RADIUS),
      0.35,
      clampToWorld(center.z + 5 + Math.random() * 3, WORLD_SPAWN_RADIUS)
    );
  }

  function createSpawnPointInOpenSpace() {
    var colliders = getColliders();
    var tries = 0;
    var x, z;

    while (tries < 24) {
      x = (Math.random() * 2 - 1) * WORLD_SPAWN_RADIUS;
      z = (Math.random() * 2 - 1) * WORLD_SPAWN_RADIUS;

      if (
        !isPointBlocked(x, z, colliders, 0.75) &&
        (Math.abs(x) > 4 || Math.abs(z) > 4)
      ) {
        return new THREE.Vector3(x, 0.35, z);
      }
      tries++;
    }

    return new THREE.Vector3(
      (Math.random() * 2 - 1) * WORLD_SPAWN_RADIUS,
      0.35,
      (Math.random() * 2 - 1) * WORLD_SPAWN_RADIUS
    );
  }

  function createPickupDescriptor(index, total, colliders) {
    var descriptor = {
      value: 10,
      tier: 'common',
      label: 'Common Cache',
      preferObstacle: false
    };

    if (index >= total - 2) {
      descriptor.value = 35;
      descriptor.tier = 'rare';
      descriptor.label = 'High-Risk Cache';
      descriptor.preferObstacle = true;
    } else if (index >= total - 4) {
      descriptor.value = 20;
      descriptor.tier = 'uncommon';
      descriptor.label = 'Tactical Cache';
      descriptor.preferObstacle = true;
    }

    if (!colliders || !colliders.length) {
      if (index % 3 === 0) {
        descriptor.value = 20;
        descriptor.tier = 'uncommon';
        descriptor.label = 'Tactical Cache';
      }
      if (index === total - 1) {
        descriptor.value = 35;
        descriptor.tier = 'rare';
        descriptor.label = 'High-Risk Cache';
      }
    }

    return descriptor;
  }

  var pickupGeometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  var pickupMaterial = new THREE.MeshNormalMaterial();

  function spawnPickups() {
    var colliders = getColliders();
    var i, pickup, descriptor, position, dangerDistanceSq;

    if (!GAME.scene) return;

    if (GAME.entities.pickups && GAME.entities.pickups.length > 0) {
      for (i = GAME.entities.pickups.length - 1; i >= 0; i--) {
        if (GAME.entities.pickups[i]) GAME.scene.remove(GAME.entities.pickups[i]);
      }
      GAME.entities.pickups.length = 0;
    }

    for (i = 0; i < TOTAL_PICKUPS; i++) {
      descriptor = createPickupDescriptor(i, TOTAL_PICKUPS, colliders);

      if (descriptor.preferObstacle && colliders.length > 0) {
        position = createSpawnPointNearCollider(colliders[i % colliders.length]);
      } else {
        position = createSpawnPointInOpenSpace();
      }

      dangerDistanceSq = getClosestColliderDistanceSq(position.x, position.z, colliders);

      pickup = new THREE.Mesh(pickupGeometry, pickupMaterial);
      pickup.position.copy(position);
      pickup.name = 'Pickup_' + i;
      pickup.userData.collectible = true;
      pickup.userData.pickupValue = descriptor.value;
      pickup.userData.pickupTier = descriptor.tier;
      pickup.userData.pickupLabel = descriptor.label;
      pickup.userData.dangerDistanceSq = dangerDistanceSq;
      GAME.scene.add(pickup);
      GAME.entities.pickups.push(pickup);
    }

    GAME.state.totalPickups = TOTAL_PICKUPS;
    GAME.state.objectiveTarget = Math.min(OBJECTIVE_TARGET, TOTAL_PICKUPS);
  }

  if (!GAME.entities.pickups || GAME.entities.pickups.length === 0) spawnPickups();

  function completeObjective() {
    if (GAME.state.isGameOver || GAME.state.isGameWon) return;

    GAME.state.isGameWon = true;
    GAME.state.isRunning = false;

    GAME.state.objectiveBonus = Math.max(0, (GAME.state.totalPickups - GAME.state.pickupsCollected) * 5);
    GAME.state.score += GAME.state.objectiveBonus;

    if (GAME.hud && typeof GAME.hud.setScore === 'function') GAME.hud.setScore(GAME.state.score);
    if (GAME.hud && typeof GAME.hud.showStatus === 'function') {
      GAME.hud.showStatus('Level Complete! +' + GAME.state.objectiveBonus + ' bonus', 2500);
    }

    if (GAME.entities.pickups && GAME.entities.pickups.length > 0) {
      while (GAME.entities.pickups.length > 0) {
        var remainingPickup = GAME.entities.pickups.pop();
        if (remainingPickup) GAME.scene.remove(remainingPickup);
      }
    }
  }

  function resolveHorizontalCollision(startX, startZ) {
    var colliders = getColliders();
    var testBox;

    if (player.position.x !== startX) {
      testBox = getPlayerBoxAt(player.position.x, player.position.y, startZ);
      if (playerBoxOverlapsAnyCollider(testBox, colliders)) player.position.x = startX;
    }

    if (player.position.z !== startZ) {
      testBox = getPlayerBoxAt(player.position.x, player.position.y, player.position.z);
      if (playerBoxOverlapsAnyCollider(testBox, colliders)) player.position.z = startZ;
    }
  }

  function resolveObstacleLanding(startY) {
    var colliders = getColliders();
    var playerBox = getPlayerBoxAt(player.position.x, player.position.y, player.position.z);
    var previousBottom = startY - PLAYER_HALF_HEIGHT;
    var currentBottom = player.position.y - PLAYER_HALF_HEIGHT;
    var bestTop = -Infinity;
    var i, box;

    if (player.velocity.y > 0) return false;

    for (i = 0; i < colliders.length; i++) {
      box = colliders[i];
      if (!box) continue;

      if (!playerBoxOverlapsColliderXZ(playerBox, box)) continue;

      if (previousBottom >= box.max.y && currentBottom <= box.max.y) {
        if (box.max.y > bestTop) bestTop = box.max.y;
      }
    }

    if (bestTop > -Infinity) {
      player.position.y = bestTop + PLAYER_HALF_HEIGHT;
      if (player.velocity.y < 0) player.velocity.y = 0;
      player.grounded = true;
      return true;
    }

    return false;
  }

  function updatePlayer(deltaTime) {
    if (!player || GAME.state.isPaused || GAME.state.isGameOver || GAME.state.isGameWon) return;

    player.yaw = yaw;
    player.pitch = pitch;
    player.rotation.y = yaw;
    GAME.camera.rotation.y = yaw;
    GAME.camera.rotation.x = pitch;

    moveX = 0;
    moveZ = 0;

    if (GAME.input.forward) moveZ -= 1;
    if (GAME.input.backward) moveZ += 1;
    if (GAME.input.left) moveX -= 1;
    if (GAME.input.right) moveX += 1;

    var startX = player.position.x;
    var startZ = player.position.z;
    var startY = player.position.y;

    if (moveX !== 0 || moveZ !== 0) {
      var length = Math.sqrt(moveX * moveX + moveZ * moveZ);
      var speed, sinYaw, cosYaw, worldMoveX, worldMoveZ;

      moveX /= length;
      moveZ /= length;

      speed = BASE_SPEED * (GAME.input.sprint ? SPRINT_MULTIPLIER : 1);
      sinYaw = Math.sin(yaw);
      cosYaw = Math.cos(yaw);
      worldMoveX = moveX * cosYaw + moveZ * sinYaw;
      worldMoveZ = moveZ * cosYaw - moveX * sinYaw;

      player.position.x += worldMoveX * speed * deltaTime;
      player.position.z += worldMoveZ * speed * deltaTime;

      resolveHorizontalCollision(startX, startZ);
    }

    if (GAME.input.jump && player.grounded && !player.jumpConsumed) {
      player.velocity.y = JUMP_IMPULSE;
      player.grounded = false;
      player.jumpConsumed = true;
      if (GAME.hud && typeof GAME.hud.showStatus === 'function') GAME.hud.showStatus('Jump!', 500);
    }

    player.grounded = false;
    player.velocity.y += GRAVITY * deltaTime;
    player.position.y += player.velocity.y * deltaTime;

    if (!resolveObstacleLanding(startY)) {
      if (player.position.y <= GROUND_Y) {
        player.position.y = GROUND_Y;
        if (player.velocity.y < 0) player.velocity.y = 0;
        player.grounded = true;
      }
    }

    GAME.camera.position.set(player.position.x, player.position.y + EYE_OFFSET, player.position.z);
  }

  function checkObjectiveProgress() {
    var collected = GAME.state.pickupsCollected;
    var target = GAME.state.objectiveTarget;

    if (GAME.state.isGameOver || GAME.state.isGameWon) return;

    if (GAME.hud && typeof GAME.hud.showStatus === 'function' && !objectiveReminderShown) {
      GAME.hud.showStatus('Collect ' + target + ' pickups to complete the level', OBJECTIVE_REMINDER_DELAY);
      objectiveReminderShown = true;
    }

    if (collected >= target) completeObjective();
  }

  function checkPickups() {
    if (!player || !GAME.entities.pickups || GAME.entities.pickups.length === 0) return;
    if (GAME.state.isGameOver || GAME.state.isGameWon) return;

    for (var i = GAME.entities.pickups.length - 1; i >= 0; i--) {
      var pickup = GAME.entities.pickups[i];
      var dx, dy, dz, distSq, pickupValue, progressText, tierText;

      if (!pickup) {
        GAME.entities.pickups.splice(i, 1);
        continue;
      }

      dx = player.position.x - pickup.position.x;
      dy = (player.position.y + 0.2) - pickup.position.y;
      dz = player.position.z - pickup.position.z;
      distSq = dx * dx + dy * dy + dz * dz;

      if (distSq <= PICKUP_RADIUS_SQ) {
        pickupValue = typeof pickup.userData.pickupValue === 'number' ? pickup.userData.pickupValue : 10;
        tierText = pickup.userData.pickupLabel || 'Pickup';

        GAME.scene.remove(pickup);
        GAME.entities.pickups.splice(i, 1);

        GAME.state.score += pickupValue;
        GAME.state.pickupsCollected += 1;

        if (GAME.hud && typeof GAME.hud.setScore === 'function') GAME.hud.setScore(GAME.state.score);

        progressText = GAME.state.pickupsCollected + '/' + GAME.state.objectiveTarget + ' collected';
        if (GAME.hud && typeof GAME.hud.showStatus === 'function') {
          GAME.hud.showStatus(tierText + ' +' + pickupValue + ' points | ' + progressText, 1200);
        }

        checkObjectiveProgress();
      }
    }
  }

  function damagePlayer(amount) {
    if (GAME.state.isGameOver || GAME.state.isGameWon) return;
    amount = typeof amount === 'number' ? amount : 0;
    if (amount <= 0) return;

    GAME.state.health = Math.max(0, GAME.state.health - amount);

    if (GAME.hud && typeof GAME.hud.setHealth === 'function') GAME.hud.setHealth(GAME.state.health, GAME.state.maxHealth);

    if (GAME.state.health <= 0) {
      GAME.state.isGameOver = true;
      GAME.state.isRunning = false;
      if (GAME.hud && typeof GAME.hud.showStatus === 'function') GAME.hud.showStatus('Game Over', 2500);
      if (GAME.hud && typeof GAME.hud.setDebug === 'function') GAME.hud.setDebug('GAME OVER');
    }
  }

  player.takeDamage = damagePlayer;

  if (typeof GAME.registerUpdate === 'function') {
    GAME.registerUpdate(function (deltaTime) {
      updatePlayer(deltaTime);
      checkPickups();
    });
  }

  if (GAME.hud) {
    if (typeof GAME.hud.setScore === 'function') GAME.hud.setScore(GAME.state.score);
    if (typeof GAME.hud.setHealth === 'function') GAME.hud.setHealth(GAME.state.health, GAME.state.maxHealth);
    if (typeof GAME.hud.showStatus === 'function') {
      GAME.hud.showStatus('Collect ' + GAME.state.objectiveTarget + ' pickups to complete the level', 2200);
    }
  }

  GAME.state.isRunning = true;
  console.log('[mechanics.js] Gameplay initialized');
})();
