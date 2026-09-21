import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/**
 * 3D Kakulator — Three.js Scene Controller
 *
 * Owns the complete 3D presentation layer:
 * - Room / desk environment
 * - Physical scientific-calculator model
 * - Camera and OrbitControls
 * - Lighting, shadows and particles
 * - 3D calculator button picking
 * - 3D display texture synchronization
 * - Render-loop lifecycle and cleanup
 *
 * This module does not know about the DOM calculator implementation.
 * Calculator input is emitted through the onCalculatorKey callback.
 */

export class ThreeSceneController {
  constructor({
    container,
    fpsElement = null,
    state,
    onCalculatorKey,
  }) {
    if (!container) {
      throw new Error("Container Three.js tidak ditemukan.");
    }

    if (!state || typeof state !== "object") {
      throw new TypeError("State aplikasi diperlukan untuk ThreeSceneController.");
    }

    if (typeof onCalculatorKey !== "function") {
      throw new TypeError("onCalculatorKey harus berupa function.");
    }

    this.container = container;
    this.fpsElement = fpsElement;
    this.state = state;
    this.onCalculatorKey = onCalculatorKey;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.calculator3D = null;
    this.displayTexture = null;
    this.animationFrame = 0;
    this.resizeObserver = null;
    this.resizeHandler = null;
    this.visibilityHandler = null;
    this.initialized = false;
    this.running = true;
    this.reducedMotion = false;

    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.hoveredKey = null;
    this.pointerDown = null;
  }

  init() {
    if (this.initialized) {
      return this;
    }

    if (!("WebGLRenderingContext" in window)) {
      throw new Error("WebGL tidak tersedia pada browser ini.");
    }

    this.createRenderer();
    this.createCamera();
    this.createScene();
    this.createControls();
    this.bindEvents();

    this.initialized = true;
    this.resize();
    this.startRenderLoop();

    this.updateDisplay(
      this.state.expression || "",
      this.state.result || "0",
    );

    return this;
  }

  createRenderer() {
    const isCoarsePointer = window.matchMedia(
      "(pointer: coarse)",
    ).matches;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });

    this.renderer.setPixelRatio(
      Math.min(
        window.devicePixelRatio || 1,
        isCoarsePointer ? 1.5 : 2,
      ),
    );

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.renderer.domElement.className = "three-canvas";
    this.renderer.domElement.style.touchAction = "none";

    this.container.replaceChildren(this.renderer.domElement);
  }

  createCamera() {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);

    this.camera = new THREE.PerspectiveCamera(
      42,
      width / height,
      0.1,
      40,
    );

    this.camera.position.set(9.2, 8.2, 12.5);
  }

  createScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0d14);
    this.scene.fog = new THREE.Fog(0x0a0d14, 11, 28);

    createRoom(this.scene);

    this.calculator3D = create3DCalculator(this.scene);
    this.displayTexture = this.calculator3D.displayTexture;

    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    this.reducedMotion = reducedMotionQuery.matches;

    if (this.reducedMotion) {
      this.state.sceneEnabled = false;
    }
  }

  createControls() {
    this.controls = new OrbitControls(
      this.camera,
      this.renderer.domElement,
    );

    this.controls.target.set(0, 2.35, 0);
    this.controls.enableDamping = !this.reducedMotion;
    this.controls.dampingFactor = 0.065;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 19;
    this.controls.minPolarAngle = THREE.MathUtils.degToRad(28);
    this.controls.maxPolarAngle = THREE.MathUtils.degToRad(72);
    this.controls.enablePan = false;
  }

  bindEvents() {
    this.renderer.domElement.addEventListener(
      "pointermove",
      this.handlePointerMove,
    );
    this.renderer.domElement.addEventListener(
      "pointerleave",
      this.handlePointerLeave,
    );
    this.renderer.domElement.addEventListener(
      "pointerdown",
      this.handlePointerDown,
    );
    this.renderer.domElement.addEventListener(
      "pointerup",
      this.handlePointerUp,
    );

    this.resizeHandler = () => this.resize();

    if ("ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(this.resizeHandler);
      this.resizeObserver.observe(this.container);
    } else {
      window.addEventListener(
        "resize",
        this.resizeHandler,
        { passive: true },
      );
    }

    this.visibilityHandler = () => {
      this.running = document.visibilityState !== "hidden";

      if (!this.running) {
        this.previousTime = performance.now();
      }
    };

    document.addEventListener(
      "visibilitychange",
      this.visibilityHandler,
    );
  }

  handlePointerMove = (event) => {
    const key = this.pickKey(event);

    if (this.hoveredKey !== key) {
      this.hoveredKey?.userData &&
        (this.hoveredKey.userData.hover = false);

      this.hoveredKey = key;

      if (this.hoveredKey) {
        this.hoveredKey.userData.hover = true;
      }
    }

    this.renderer.domElement.style.cursor =
      key ? "pointer" : "grab";
  };

  handlePointerLeave = () => {
    if (this.hoveredKey) {
      this.hoveredKey.userData.hover = false;
      this.hoveredKey = null;
    }

    this.renderer.domElement.style.cursor = "grab";
  };

  handlePointerDown = (event) => {
    this.pointerDown = {
      x: event.clientX,
      y: event.clientY,
    };
  };

  handlePointerUp = (event) => {
    if (!this.pointerDown) {
      return;
    }

    const distance = Math.hypot(
      event.clientX - this.pointerDown.x,
      event.clientY - this.pointerDown.y,
    );

    this.pointerDown = null;

    if (distance > 8) {
      return;
    }

    const key = this.pickKey(event);

    if (!key) {
      return;
    }

    press3DKey(key);

    const mapped = key.userData.calculatorKey;

    if (mapped?.action || mapped?.value) {
      this.onCalculatorKey(mapped);
    }
  };

  pickKey(event) {
    if (!this.camera || !this.renderer || !this.calculator3D) {
      return null;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();

    if (!rect.width || !rect.height) {
      return null;
    }

    this.pointer.x =
      ((event.clientX - rect.left) / rect.width) * 2 - 1;

    this.pointer.y =
      -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(
      this.pointer,
      this.camera,
    );

    const intersections = this.raycaster.intersectObjects(
      this.calculator3D.keyMeshes,
      true,
    );

    if (!intersections.length) {
      return null;
    }

    return getCalculatorKeyGroup(intersections[0].object);
  }

  resize() {
    if (!this.renderer || !this.camera) {
      return;
    }

    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height, false);
  }

  startRenderLoop() {
    let previousTime = performance.now();
    let fpsTime = previousTime;
    let frames = 0;

    const animate = (time) => {
      this.animationFrame = requestAnimationFrame(animate);

      const delta = Math.min(
        (time - previousTime) / 1000,
        0.05,
      );

      previousTime = time;

      if (!this.running) {
        return;
      }

      this.controls?.update();

      if (this.state.sceneEnabled) {
        animate3DCalculator(
          this.calculator3D,
          delta,
          this.reducedMotion,
        );
      }

      update3DKeyStates(this.calculator3D, delta);

      this.renderer.render(
        this.scene,
        this.camera,
      );

      frames += 1;

      if (time - fpsTime >= 500) {
        const fps = Math.round(
          (frames * 1000) /
            Math.max(time - fpsTime, 1),
        );

        if (this.fpsElement) {
          this.fpsElement.textContent = `FPS: ${fps}`;
        }

        frames = 0;
        fpsTime = time;
      }
    };

    this.previousTime = previousTime;
    requestAnimationFrame(animate);
  }

  setEnabled(enabled) {
    this.state.sceneEnabled = Boolean(enabled);

    if (this.renderer) {
      this.renderer.domElement.style.opacity =
        this.state.sceneEnabled ? "1" : "0";
    }

    if (this.controls) {
      this.controls.enabled = this.state.sceneEnabled;
    }
  }

  updateDisplay(expression, result) {
    const texture = this.displayTexture;

    if (!texture?.userData?.context) {
      return;
    }

    const { canvas, context } = texture.userData;

    context.clearRect(
      0,
      0,
      canvas.width,
      canvas.height,
    );

    context.fillStyle = "#b9d3bf";
    context.fillRect(
      0,
      0,
      canvas.width,
      canvas.height,
    );

    context.fillStyle = "#1e3526";
    context.font = "600 30px system-ui, sans-serif";
    context.textAlign = "left";
    context.textBaseline = "top";
    context.fillText(
      (expression || "READY").slice(-29),
      28,
      28,
    );

    context.font =
      "700 66px ui-monospace, SFMono-Regular, Menlo, monospace";
    context.textAlign = "right";
    context.textBaseline = "bottom";
    context.fillText(
      String(result || "0").slice(0, 18),
      canvas.width - 24,
      canvas.height - 24,
    );

    texture.needsUpdate = true;
  }

  destroy() {
    cancelAnimationFrame(this.animationFrame);

    this.controls?.dispose();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.resizeHandler) {
      window.removeEventListener(
        "resize",
        this.resizeHandler,
      );
    }

    if (this.visibilityHandler) {
      document.removeEventListener(
        "visibilitychange",
        this.visibilityHandler,
      );
    }

    this.renderer?.domElement.removeEventListener(
      "pointermove",
      this.handlePointerMove,
    );
    this.renderer?.domElement.removeEventListener(
      "pointerleave",
      this.handlePointerLeave,
    );
    this.renderer?.domElement.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
    );
    this.renderer?.domElement.removeEventListener(
      "pointerup",
      this.handlePointerUp,
    );

    if (this.scene) {
      disposeScene(this.scene);
    }

    this.renderer?.dispose();

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.calculator3D = null;
    this.displayTexture = null;
    this.initialized = false;
  }
}

function getCalculatorKeyGroup(object) {
  let current = object;

  while (current) {
    if (current.userData?.calculatorKey) {
      return current;
    }

    current = current.parent;
  }

  return null;
}

function initThreeSceneLegacy() {
  const container = appContext.elements.sceneContainer;

  if (!container) {
    return;
  }

  if (!("WebGLRenderingContext" in window)) {
    throw new Error("WebGL tidak tersedia pada browser ini.");
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0d14);
  scene.fog = new THREE.Fog(0x0a0d14, 11, 28);

  const camera = new THREE.PerspectiveCamera(
    42,
    Math.max(container.clientWidth, 1) /
      Math.max(container.clientHeight, 1),
    0.1,
    40,
  );

  camera.position.set(9.2, 8.2, 12.5);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });

  const pixelRatio = Math.min(
    window.devicePixelRatio || 1,
    window.matchMedia("(pointer: coarse)").matches ? 1.5 : 2,
  );

  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(
    Math.max(container.clientWidth, 1),
    Math.max(container.clientHeight, 1),
    false,
  );
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.className = "three-canvas";
  renderer.domElement.style.touchAction = "none";

  container.replaceChildren(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2.35, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.minDistance = 8;
  controls.maxDistance = 19;
  controls.minPolarAngle = THREE.MathUtils.degToRad(28);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(72);
  controls.enablePan = false;

  appContext.scene = scene;
  appContext.renderer = renderer;
  appContext.controls = controls;
  appContext.threeDisplayTexture = null;

  createRoom(scene);
  const calculator = create3DCalculator(scene);
  appContext.calculator3D = calculator;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerDown = null;
  let hoveredKey = null;

  const getCalculatorKey = (object) => {
    let current = object;

    while (current) {
      if (current.userData?.calculatorKey) {
        return current;
      }
      current = current.parent;
    }

    return null;
  };

  const setPointer = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();

    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  };

  const pickKey = (event) => {
    setPointer(event);
    raycaster.setFromCamera(pointer, camera);

    const intersections = raycaster.intersectObjects(
      calculator.keyMeshes,
      true,
    );

    return intersections.length
      ? getCalculatorKey(intersections[0].object)
      : null;
  };

  const pointerMove = (event) => {
    const key = pickKey(event);

    if (hoveredKey !== key) {
      if (hoveredKey) {
        hoveredKey.userData.hover = false;
      }

      hoveredKey = key;

      if (hoveredKey) {
        hoveredKey.userData.hover = true;
      }
    }

    renderer.domElement.style.cursor = key ? "pointer" : "grab";
  };

  const pointerLeave = () => {
    if (hoveredKey) {
      hoveredKey.userData.hover = false;
      hoveredKey = null;
    }

    renderer.domElement.style.cursor = "grab";
  };

  const pointerDownHandler = (event) => {
    pointerDown = {
      x: event.clientX,
      y: event.clientY,
    };
  };

  const pointerUpHandler = (event) => {
    if (!pointerDown) {
      return;
    }

    const distance = Math.hypot(
      event.clientX - pointerDown.x,
      event.clientY - pointerDown.y,
    );

    pointerDown = null;

    if (distance > 8) {
      return;
    }

    const key = pickKey(event);

    if (!key) {
      return;
    }

    press3DKey(key);
    const mapped = key.userData.calculatorKey;

    if (mapped?.action || mapped?.value) {
      handleKey(mapped);
    }
  };

  renderer.domElement.addEventListener("pointermove", pointerMove);
  renderer.domElement.addEventListener("pointerleave", pointerLeave);
  renderer.domElement.addEventListener("pointerdown", pointerDownHandler);
  renderer.domElement.addEventListener("pointerup", pointerUpHandler);

  let resizeObserver = null;

  const resize = () => {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
  } else {
    window.addEventListener("resize", resize, { passive: true });
  }

  resize();

  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (reducedMotion) {
    state.sceneEnabled = false;
    renderer.domElement.style.opacity = "0.6";
    controls.enableDamping = false;
  }

  let previousTime = performance.now();
  let frames = 0;
  let fpsTime = previousTime;
  let running = true;

  const visibilityChange = () => {
    running = document.visibilityState !== "hidden";

    if (!running) {
      previousTime = performance.now();
    }
  };

  document.addEventListener("visibilitychange", visibilityChange);

  const animate = (time) => {
    appContext.animationFrame = requestAnimationFrame(animate);

    const delta = Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;

    if (!running) {
      return;
    }

    controls.update();

    if (state.sceneEnabled) {
      animate3DCalculator(calculator, delta, reducedMotion);
    }

    update3DKeyStates(calculator, delta);
    renderer.render(scene, camera);

    frames += 1;

    if (time - fpsTime >= 500) {
      const fps = Math.round(
        (frames * 1000) / Math.max(time - fpsTime, 1),
      );

      if (appContext.elements.fps) {
        appContext.elements.fps.textContent = \`FPS: \${fps}\`;
      }

      frames = 0;
      fpsTime = time;
    }
  };

  requestAnimationFrame(animate);

  appContext.threeCleanup = () => {
    cancelAnimationFrame(appContext.animationFrame);
    controls.dispose();
    resizeObserver?.disconnect();

    if (!resizeObserver) {
      window.removeEventListener("resize", resize);
    }

    document.removeEventListener(
      "visibilitychange",
      visibilityChange,
    );

    renderer.domElement.removeEventListener(
      "pointermove",
      pointerMove,
    );
    renderer.domElement.removeEventListener(
      "pointerleave",
      pointerLeave,
    );
    renderer.domElement.removeEventListener(
      "pointerdown",
      pointerDownHandler,
    );
    renderer.domElement.removeEventListener(
      "pointerup",
      pointerUpHandler,
    );

    disposeScene(scene);
  };
}

function createRoom(scene) {
  const room = new THREE.Group();
  scene.add(room);

  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x151a22,
    roughness: 0.88,
    metalness: 0.05,
  });

  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x242a35,
    roughness: 0.95,
    metalness: 0.02,
  });

  const ceilingMaterial = new THREE.MeshStandardMaterial({
    color: 0x10141b,
    roughness: 1,
  });

  const woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x5b4030,
    roughness: 0.68,
    metalness: 0.06,
  });

  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d201a,
    roughness: 0.55,
  });

  addBox(room, [20, 0.25, 20], [0, -0.12, 0], floorMaterial, true, false);

  addBox(
    room,
    [20, 9, 0.22],
    [0, 4.5, -7],
    wallMaterial,
    false,
    true,
  );

  addBox(
    room,
    [0.22, 9, 14],
    [-10, 4.5, 0],
    wallMaterial,
    false,
    true,
  );

  addBox(
    room,
    [20, 0.18, 14],
    [0, 9, 0],
    ceilingMaterial,
    false,
    false,
  );

  addBox(
    room,
    [20, 0.08, 0.15],
    [0, 0.18, -6.82],
    trimMaterial,
    false,
    false,
  );

  const desk = new THREE.Group();
  desk.position.set(0, 0, 0.35);
  room.add(desk);

  addRoundedBox(
    desk,
    [11.5, 0.42, 6.4],
    [0, 2.15, 0],
    0.16,
    woodMaterial,
    true,
    true,
  );

  const legPositions = [
    [-5.1, 0.95, -2.4],
    [5.1, 0.95, -2.4],
    [-5.1, 0.95, 2.4],
    [5.1, 0.95, 2.4],
  ];

  for (const position of legPositions) {
    addRoundedBox(
      desk,
      [0.52, 1.9, 0.52],
      position,
      0.08,
      trimMaterial,
      true,
      true,
    );
  }

  const drawer = addRoundedBox(
    desk,
    [3.3, 0.8, 1.7],
    [0, 1.55, -2.05],
    0.1,
    trimMaterial,
    true,
    true,
  );

  addRoundedBox(
    drawer,
    [1.25, 0.09, 0.12],
    [0, 0.18, 0.9],
    0.04,
    new THREE.MeshStandardMaterial({
      color: 0xc39b66,
      metalness: 0.65,
      roughness: 0.28,
    }),
    true,
    true,
  );

  addRoundedBox(
    desk,
    [6.4, 0.045, 3.65],
    [0, 2.39, 0.15],
    0.05,
    new THREE.MeshStandardMaterial({
      color: 0x202731,
      roughness: 0.78,
      metalness: 0.08,
    }),
    false,
    false,
  );

  createWindow(scene);
  createDeskLamp(room);
  createBooks(room);
  createPlant(room);

  const keyLight = new THREE.DirectionalLight(0xf4eee4, 3.2);
  keyLight.position.set(-4, 8, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -10;
  keyLight.shadow.camera.right = 10;
  keyLight.shadow.camera.top = 10;
  keyLight.shadow.camera.bottom = -10;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 28;
  room.add(keyLight);

  const fill = new THREE.HemisphereLight(
    0x9bb8ff,
    0x21180f,
    1.75,
  );
  room.add(fill);

  const roomGlow = new THREE.PointLight(0x5477ff, 8, 16, 2);
  roomGlow.position.set(-4, 5.5, -4.8);
  room.add(roomGlow);
}

function createWindow(scene) {
  const group = new THREE.Group();
  group.position.set(1.9, 5.45, -6.82);
  scene.add(group);

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x171b24,
    roughness: 0.45,
    metalness: 0.55,
  });

  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x5375a7,
    emissive: 0x1c3154,
    emissiveIntensity: 1.35,
    roughness: 0.22,
    metalness: 0.08,
  });

  addBox(group, [5.7, 3.1, 0.18], [0, 0, 0], frameMaterial, false, true);
  addBox(group, [5.05, 2.45, 0.05], [0, 0, 0.1], glassMaterial, false, false);

  addBox(group, [0.08, 2.45, 0.14], [0, 0, 0.16], frameMaterial, false, false);
  addBox(group, [5.05, 0.08, 0.14], [0, 0, 0.16], frameMaterial, false, false);

  const moonLight = new THREE.PointLight(0x7fa7ff, 16, 13, 2);
  moonLight.position.set(1.5, 5.2, -3.8);
  scene.add(moonLight);
}

function createDeskLamp(parent) {
  const lamp = new THREE.Group();
  lamp.position.set(-4.4, 2.37, 0.8);
  parent.add(lamp);

  const metal = new THREE.MeshStandardMaterial({
    color: 0x30343c,
    roughness: 0.31,
    metalness: 0.8,
  });

  const warm = new THREE.MeshStandardMaterial({
    color: 0xffd49b,
    emissive: 0xf08c45,
    emissiveIntensity: 2.5,
    roughness: 0.34,
    metalness: 0.05,
  });

  addRoundedBox(
    lamp,
    [0.95, 0.12, 0.72],
    [0, 0.06, 0],
    0.05,
    metal,
    true,
    true,
  );

  addRoundedBox(
    lamp,
    [0.1, 2.35, 0.1],
    [0, 1.18, 0],
    0.04,
    metal,
    true,
    true,
  );

  const shade = addRoundedBox(
    lamp,
    [1.45, 0.5, 0.9],
    [0, 2.34, 0.05],
    0.18,
    metal,
    true,
    true,
  );

  shade.rotation.z = THREE.MathUtils.degToRad(-11);

  addRoundedBox(
    lamp,
    [1.03, 0.05, 0.56],
    [0, 2.09, 0.15],
    0.03,
    warm,
    false,
    false,
  );

  const light = new THREE.PointLight(0xffc77c, 32, 9, 2);
  light.position.set(0, 1.93, 0.18);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  lamp.add(light);
}

function createBooks(parent) {
  const bookColors = [0x7c3342, 0x314b75, 0x8d6d32];
  const positions = [
    [-4.1, 2.62, -1.65, 0.9],
    [-3.78, 2.78, -1.65, 0.68],
    [-3.46, 2.89, -1.65, 0.44],
  ];

  positions.forEach(([x, y, z, h], index) => {
    addRoundedBox(
      parent,
      [2.1, h * 0.38, 1.35],
      [x, y, z],
      0.04,
      new THREE.MeshStandardMaterial({
        color: bookColors[index],
        roughness: 0.72,
      }),
      true,
      true,
    );
  });
}

function createPlant(parent) {
  const plant = new THREE.Group();
  plant.position.set(4.25, 2.4, -1.1);
  parent.add(plant);

  const potMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b5542,
    roughness: 0.84,
  });

  const leafMaterial = new THREE.MeshStandardMaterial({
    color: 0x44694d,
    roughness: 0.9,
  });

  const pot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.7, 0.72, 20),
    potMaterial,
  );
  pot.position.y = 0.36;
  pot.castShadow = true;
  pot.receiveShadow = true;
  plant.add(pot);

  for (let index = 0; index < 7; index += 1) {
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.05, 1.5, 8),
      leafMaterial,
    );

    const angle = (index / 7) * Math.PI * 2;
    stem.position.set(
      Math.cos(angle) * 0.12,
      1.38,
      Math.sin(angle) * 0.12,
    );
    stem.rotation.z = Math.cos(angle) * 0.32;
    stem.rotation.x = Math.sin(angle) * -0.32;

    plant.add(stem);

    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 14, 10),
      leafMaterial,
    );

    leaf.scale.set(1.45, 0.55, 0.7);
    leaf.position.copy(stem.position);
    leaf.position.y += 0.7;
    leaf.rotation.y = angle;
    plant.add(leaf);
  }
}

function create3DCalculator(scene) {
  const calculator = new THREE.Group();
  calculator.position.set(0, 2.62, 0.12);
  calculator.rotation.x = THREE.MathUtils.degToRad(7);
  scene.add(calculator);

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x252a33,
    roughness: 0.34,
    metalness: 0.48,
  });

  const topMaterial = new THREE.MeshStandardMaterial({
    color: 0x11151c,
    roughness: 0.29,
    metalness: 0.6,
  });

  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0x8d9bff,
    emissive: 0x313b9a,
    emissiveIntensity: 0.65,
    roughness: 0.2,
    metalness: 0.45,
  });

  const displayMaterial = new THREE.MeshStandardMaterial({
    color: 0xc0d7bb,
    emissive: 0x234a33,
    emissiveIntensity: 0.58,
    roughness: 0.28,
    metalness: 0.04,
  });

  addRoundedBox(
    calculator,
    [3.9, 0.4, 6.65],
    [0, 0, 0],
    0.2,
    bodyMaterial,
    true,
    true,
  );

  addRoundedBox(
    calculator,
    [3.58, 0.08, 6.28],
    [0, 0.22, 0],
    0.16,
    topMaterial,
    true,
    false,
  );

  addRoundedBox(
    calculator,
    [3.02, 0.08, 1.38],
    [0, 0.31, -2.3],
    0.13,
    new THREE.MeshStandardMaterial({
      color: 0x0b1014,
      roughness: 0.2,
      metalness: 0.55,
    }),
    true,
    false,
  );

  const screen = addRoundedBox(
    calculator,
    [2.74, 0.04, 1.0],
    [0, 0.375, -2.3],
    0.09,
    displayMaterial,
    false,
    false,
  );

  screen.userData.isThreeDisplay = true;

  const displayTexture = createDisplayTexture();
  const displayPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.52, 0.76),
    new THREE.MeshBasicMaterial({
      map: displayTexture,
      transparent: true,
      depthWrite: false,
    }),
  );

  displayPlane.rotation.x = -Math.PI / 2;
  displayPlane.position.set(0, 0.405, -2.3);
  calculator.add(displayPlane);

  appContext.threeDisplayTexture = displayTexture;
  update3DDisplay();

  const solar = new THREE.Group();
  solar.position.set(0, 0.355, -1.43);
  calculator.add(solar);

  addRoundedBox(
    solar,
    [2.82, 0.035, 0.42],
    [0, 0, 0],
    0.05,
    new THREE.MeshStandardMaterial({
      color: 0x171b22,
      roughness: 0.38,
      metalness: 0.72,
    }),
    false,
    false,
  );

  for (let index = -3; index <= 3; index += 1) {
    addBox(
      solar,
      [0.02, 0.03, 0.31],
      [index * 0.38, 0.022, 0],
      new THREE.MeshStandardMaterial({
        color: 0x65758a,
        roughness: 0.25,
        metalness: 0.4,
      }),
      false,
      false,
    );
  }

  const keyRows = [
    ["SHIFT", "ALPHA", "MODE", "SETUP", "ON"],
    ["sin", "cos", "tan", "log", "ln"],
    ["√", "x²", "xʸ", "(", ")"],
    ["7", "8", "9", "DEL", "AC"],
    ["4", "5", "6", "×", "÷"],
    ["1", "2", "3", "+", "−"],
    ["±", "0", ".", "%", "="],
  ];

  const keyMeshes = [];
  const keyMaterials = new Map();

  keyRows.forEach((row, rowIndex) => {
    row.forEach((label, columnIndex) => {
      const key = create3DKey(
        calculator,
        label,
        rowIndex,
        columnIndex,
        keyMaterials,
      );

      if (key) {
        keyMeshes.push(key);
      }
    });
  });

  const logoTexture = createTextTexture(
    "3D KAKULATOR",
    "600 22px system-ui, sans-serif",
    "#bbc4d8",
    320,
    64,
  );

  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.34),
    new THREE.MeshBasicMaterial({
      map: logoTexture,
      transparent: true,
      depthWrite: false,
    }),
  );

  logo.rotation.x = -Math.PI / 2;
  logo.position.set(0, 0.37, -3.03);
  calculator.add(logo);

  const accent = addRoundedBox(
    calculator,
    [3.18, 0.04, 0.06],
    [0, 0.36, 0.26],
    0.02,
    accentMaterial,
    false,
    false,
  );

  accent.userData.isAccent = true;

  return {
    group: calculator,
    keyMeshes,
    accent,
    displayTexture,
  };
}

function create3DKey(parent, label, rowIndex, columnIndex, materials) {
  const mapped = map3DKeyToCalculator(label);

  const x = (columnIndex - 2) * 0.66;
  const z = -0.58 + rowIndex * 0.72;

  const type =
    ["AC", "DEL", "ON"].includes(label)
      ? "action"
      : ["×", "÷", "+", "−", "="].includes(label)
        ? "operator"
        : ["SHIFT", "ALPHA", "MODE", "SETUP", "sin", "cos", "tan", "log", "ln", "√", "x²", "xʸ"].includes(label)
          ? "function"
          : "number";

  if (!materials.has(type)) {
    materials.set(
      type,
      new THREE.MeshStandardMaterial({
        color:
          type === "operator"
            ? 0x455a87
            : type === "action"
              ? 0x526b58
              : type === "function"
                ? 0x303741
                : 0x454c56,
        roughness: 0.48,
        metalness: 0.36,
      }),
    );
  }

  const keyGroup = new THREE.Group();
  keyGroup.position.set(x, 0.415, z);
  keyGroup.userData.calculatorKey = mapped;
  keyGroup.userData.label = label;
  keyGroup.userData.baseY = 0.415;
  keyGroup.userData.press = 0;
  keyGroup.userData.hover = false;

  parent.add(keyGroup);

  const key = addRoundedBox(
    keyGroup,
    [0.53, 0.16, 0.46],
    [0, 0, 0],
    0.08,
    materials.get(type),
    true,
    true,
  );

  key.userData.calculatorKey = mapped;
  key.userData.calculatorKeyGroup = keyGroup;

  const texture = createTextTexture(
    label,
    label.length > 4
      ? "600 14px system-ui, sans-serif"
      : "700 20px system-ui, sans-serif",
    type === "operator" ? "#e4edff" : "#f3f5f8",
    256,
    128,
  );

  const textMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(
      label.length > 4 ? 0.43 : 0.38,
      0.20,
    ),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    }),
  );

  textMesh.rotation.x = -Math.PI / 2;
  textMesh.position.y = 0.093;
  keyGroup.add(textMesh);

  return keyGroup;
}

function map3DKeyToCalculator(label) {
  const mapping = {
    AC: { action: "clear", type: "action", label },
    DEL: { action: "delete", type: "action", label },
    "%": { action: "percent", type: "action", label },
    "±": { action: "sign", type: "action", label },
    "=": { action: "equals", type: "equals", label },
    "×": { value: "*", type: "operator", label },
    "÷": { value: "/", type: "operator", label },
    "+": { value: "+", type: "operator", label },
    "−": { value: "-", type: "operator", label },
  };

  if (mapping[label]) {
    return mapping[label];
  }

  if (/^[0-9.]$/.test(label)) {
    return { value: label, type: "number", label };
  }

  return null;
}

function createDisplayTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 256;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D tidak tersedia untuk display 3D.");
  }

  context.fillStyle = "#b9d3bf";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  texture.userData.canvas = canvas;
  texture.userData.context = context;

  return texture;
}

function update3DDisplay() {
  const texture = appContext.threeDisplayTexture;

  if (!texture?.userData?.context) {
    return;
  }

  const { canvas, context } = texture.userData;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#b9d3bf";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#1e3526";
  context.font = "600 30px system-ui, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText(
    (state.expression || "READY").slice(-29),
    28,
    28,
  );

  context.font = "700 66px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textAlign = "right";
  context.textBaseline = "bottom";
  context.fillText(
    state.result.slice(0, 18),
    canvas.width - 24,
    canvas.height - 24,
  );

  texture.needsUpdate = true;
}

function createTextTexture(
  text,
  font,
  fillStyle,
  width = 256,
  height = 128,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Canvas 2D tidak tersedia untuk label 3D.");
  }

  context.clearRect(0, 0, width, height);
  context.fillStyle = fillStyle;
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  return texture;
}

function press3DKey(keyGroup) {
  keyGroup.userData.press = 1;

  const originalScale = keyGroup.scale.clone();
  keyGroup.userData.originalScale = originalScale;
}

function update3DKeyStates(calculator, delta) {
  for (const keyGroup of calculator.keyMeshes) {
    const targetPress = keyGroup.userData.press > 0
      ? 0.13
      : 0;

    keyGroup.userData.press = Math.max(
      0,
      keyGroup.userData.press - delta * 5,
    );

    const hoverLift = keyGroup.userData.hover ? 0.035 : 0;
    const targetY = keyGroup.userData.baseY - targetPress + hoverLift;

    keyGroup.position.y = THREE.MathUtils.lerp(
      keyGroup.position.y,
      targetY,
      1 - Math.pow(0.001, delta),
    );
  }
}

function animate3DCalculator(calculator, delta, reducedMotion) {
  if (reducedMotion) {
    return;
  }

  const time = performance.now() * 0.001;

  calculator.group.rotation.z =
    Math.sin(time * 0.32) * THREE.MathUtils.degToRad(0.55);

  calculator.group.position.y =
    2.62 + Math.sin(time * 0.75) * 0.018;

  calculator.accent.material.emissiveIntensity =
    0.55 + Math.sin(time * 1.8) * 0.1;
}

function addBox(
  parent,
  size,
  position,
  material,
  castShadow = false,
  receiveShadow = false,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size[0], size[1], size[2]),
    material,
  );

  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  parent.add(mesh);

  return mesh;
}

function addRoundedBox(
  parent,
  size,
  position,
  radius,
  material,
  castShadow = false,
  receiveShadow = false,
) {
  const segments = 5;

  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(
      size[0],
      size[1],
      size[2],
      segments,
      radius,
    ),
    material,
  );

  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  parent.add(mesh);

  return mesh;
}

function disposeScene(scene) {
  scene.traverse((object) => {
    if (object.geometry) {
      object.geometry.dispose();
    }

    if (object.material) {
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];

      for (const material of materials) {
        if (material.map) {
          material.map.dispose();
        }

        material.dispose();
      }
    }
  });
}

function createParticles() {
  const count = 90;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = THREE.MathUtils.randFloatSpread(15);
    positions[i * 3 + 1] = THREE.MathUtils.randFloat(2.7, 8.2);
    positions[i * 3 + 2] = THREE.MathUtils.randFloat(-6.5, 6);
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );

  const material = new THREE.PointsMaterial({
    color: 0xc5d2ff,
    size: 0.018,
    transparent: true,
    opacity: 0.32,
    sizeAttenuation: true,
  });

  return new THREE.Points(geometry, material);
}


