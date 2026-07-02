// visuals.js
(function () {
  'use strict';

  // === SAFETY CHECKS ===
  if (!window.GAME) {
    console.error('[visuals.js] GAME global not found.');
    return;
  }

  if (!window.THREE) {
    console.error('[visuals.js] THREE global not found.');
    return;
  }

  const GAME = window.GAME;

  // === LIGHTING SETUP ===
  // Soft ambient fill light to prevent full pitch-black shadows
  const ambientLight = new THREE.AmbientLight(0xddeeff, 0.4);
  GAME.scene.add(ambientLight);
  GAME.visuals.lights.ambient = ambientLight;

  // Realistic hemisphere light to balance sky and ground color grading reflections
  const hemiLight = new THREE.HemisphereLight(0x7ec0ee, 0x332211, 0.3);
  hemiLight.position.set(0, 50, 0);
  GAME.scene.add(hemiLight);
  GAME.visuals.lights.hemisphere = hemiLight;

  // Primary directional "sun" light capable of producing casting shadows
  const sunLight = new THREE.DirectionalLight(0xfffaed, 1.0);
  sunLight.position.set(40, 60, 20);
  sunLight.castShadow = true;

  // Maximize shadow details without losing performance
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;

  // Scale the directional shadow frustum bounding box to cleanly cover the 100x100 playground area
  const d = 60;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 200;
  sunLight.shadow.bias = -0.0005;

  GAME.scene.add(sunLight);
  GAME.visuals.lights.sun = sunLight;


  // === GROUND MATERIAL UPGRADE ===
  let groundMesh = GAME.scene.userData.groundMesh;
  if (!groundMesh) {
    GAME.scene.traverse((child) => {
      if (child.isMesh && (child.name === 'GroundPlane' || child.geometry.type === 'PlaneGeometry')) {
        groundMesh = child;
      }
    });
  }

  // Create procedural checkerboard tile grid using HTML5 Canvas
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Background tone
  ctx.fillStyle = '#1a1a20';
  ctx.fillRect(0, 0, 256, 256);

  // Modern cyber grid lines
  ctx.strokeStyle = '#282835';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 256, 256);

  // Decorative internal panel frame
  ctx.strokeStyle = '#323245';
  ctx.lineWidth = 1;
  ctx.strokeRect(16, 16, 224, 224);

  const groundTexture = new THREE.CanvasTexture(canvas);
  groundTexture.wrapS = THREE.RepeatWrapping;
  groundTexture.wrapT = THREE.RepeatWrapping;
  groundTexture.repeat.set(25, 25); // Scale texture density relative to plane dimensions

  const upgradedGroundMaterial = new THREE.MeshStandardMaterial({
    map: groundTexture,
    roughness: 0.7,
    metalness: 0.15
  });

  if (groundMesh) {
    if (groundMesh.material) groundMesh.material.dispose();
    groundMesh.material = upgradedGroundMaterial;
    groundMesh.receiveShadow = true;
  }
  GAME.visuals.materials.ground = upgradedGroundMaterial;


  // === SKY / ENVIRONMENT ===
  // Large scale sphere representing the atmospheric dome environment boundary
  const skyGeometry = new THREE.SphereGeometry(500, 32, 15);

  const skyVertexShader = `
    varying vec3 vWorldPosition;
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `;

  const skyFragmentShader = `
    varying vec3 vWorldPosition;
    void main() {
      vec3 normalizePos = normalize(vWorldPosition);
      float height = normalizePos.y;
      
      // Interpolate from dark space zenith to a bright hazy atmospheric horizon color
      vec3 skyColor = vec3(0.04, 0.06, 0.12);
      vec3 horizonColor = vec3(0.45, 0.55, 0.65);
      
      float factor = max(0.0, height);
      vec3 finalColor = mix(horizonColor, skyColor, pow(factor, 0.65));
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  const skyMaterial = new THREE.ShaderMaterial({
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    side: THREE.BackSide,
    depthWrite: false
  });

  const skyMesh = new THREE.Mesh(skyGeometry, skyMaterial);
  GAME.scene.add(skyMesh);
  GAME.visuals.materials.sky = skyMaterial;

  // Inject a clean exponential depth fog matching the exact palette value of the sky horizon
  const horizonFogColor = new THREE.Color(0.45, 0.55, 0.65);
  GAME.scene.fog = new THREE.FogExp2(horizonFogColor, 0.015);
  GAME.renderer.setClearColor(horizonFogColor);


  // === PARTICLE SYSTEM ===
  const particleCount = 350;
  const particleGeometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const driftSpeeds = new Float32Array(particleCount);

  // Distribute particles across space around play zone coordinates
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 100;     // X
    positions[i * 3 + 1] = Math.random() * 40;         // Y
    positions[i * 3 + 2] = (Math.random() - 0.5) * 100; // Z
    driftSpeeds[i] = 0.6 + Math.random() * 1.4;         // Velocity rate
  }

  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  // Generate smooth glowing circle particle texture layout
  const pCanvas = document.createElement('canvas');
  pCanvas.width = 16;
  pCanvas.height = 16;
  const pCtx = pCanvas.getContext('2d');
  const gradient = pCtx.createRadialGradient(8, 8, 0, 8, 8, 8);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
  gradient.addColorStop(0.4, 'rgba(220, 240, 255, 0.6)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  pCtx.fillStyle = gradient;
  pCtx.fillRect(0, 0, 16, 16);

  const particleTexture = new THREE.CanvasTexture(pCanvas);

  const particleMaterial = new THREE.PointsMaterial({
    size: 0.4,
    map: particleTexture,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    opacity: 0.65
  });

  const ambientParticles = new THREE.Points(particleGeometry, particleMaterial);
  GAME.scene.add(ambientParticles);
  GAME.visuals.particleSystems.push(ambientParticles);

  // Register per-frame high performance mathematical loop updates avoiding reallocations
  GAME.registerUpdate((deltaTime) => {
    const posArr = particleGeometry.attributes.position.array;
    const elapsedTime = GAME.clock.getElapsedTime();

    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      // Drift upwards
      posArr[idx + 1] += driftSpeeds[i] * deltaTime;
      
      // Gentle horizontal atmospheric sway behavior simulation
      posArr[idx] += Math.sin(elapsedTime * 0.4 + i) * 0.012;

      // Handle height wraparound
      if (posArr[idx + 1] > 40) {
        posArr[idx + 1] = 0;
        posArr[idx] = (Math.random() - 0.5) * 100;
        posArr[idx + 2] = (Math.random() - 0.5) * 100;
      }
    }
    particleGeometry.attributes.position.needsUpdate = true;
  });


  // === PLAYER VISUAL POLISH ===
  let playerSkinned = false;

  // Handle lazy loading structure evaluation to update mechanics.js assets once instantiated
  GAME.registerUpdate(() => {
    if (playerSkinned) return;

    if (GAME.entities && GAME.entities.player) {
      const playerMesh = GAME.entities.player;

      // Swap out standard MeshNormalMaterial for high-fidelity physical shading profile
      const professionalPlayerMaterial = new THREE.MeshStandardMaterial({
        color: 0x2563eb,
        roughness: 0.25,
        metalness: 0.75
      });

      if (playerMesh.material) {
        playerMesh.material.dispose();
      }

      playerMesh.material = professionalPlayerMaterial;
      playerMesh.castShadow = true;
      playerMesh.receiveShadow = true;

      playerSkinned = true;
      console.log('[visuals.js] Deferred player visual enhancements applied successfully.');
    }
  });

  console.log('[visuals.js] Visual systems initialized');
})();
