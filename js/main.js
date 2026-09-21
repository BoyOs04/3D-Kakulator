import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { CalculatorEngine } from "./calculator.js";

/**
 * 3D Kakulator
 * Application bootstrap / entry point.
 *
 * Responsibilities:
 * - Load the modular CSS layers.
 * - Build the initial application shell.
 * - Provide a functional calculator while feature modules are still being added.
 * - Initialize a lightweight Three.js background scene.
 * - Expose a small application context for the upcoming modules.
 *
 * The heavier feature logic is intentionally kept out of this file so the
 * application can later delegate to calculator.js, three-scene.js, ui.js,
 * settings.js, animations.js and utils.js without rebuilding the shell.
 */

const APP_VERSION = "0.1.0";
const CSS_FILES = [
  "./css/base.css",
  "./css/layout.css",
  "./css/components.css",
  "./css/animations.css",
];

const CALCULATOR_KEYS = [
  { label: "AC", action: "clear", type: "action" },
  { label: "DEL", action: "delete", type: "action" },
  { label: "%", action: "percent", type: "action" },
  { label: "÷", value: "/", type: "operator" },

  { label: "7", value: "7", type: "number" },
  { label: "8", value: "8", type: "number" },
  { label: "9", value: "9", type: "number" },
  { label: "×", value: "*", type: "operator" },

  { label: "4", value: "4", type: "number" },
  { label: "5", value: "5", type: "number" },
  { label: "6", value: "6", type: "number" },
  { label: "−", value: "-", type: "operator" },

  { label: "1", value: "1", type: "number" },
  { label: "2", value: "2", type: "number" },
  { label: "3", value: "3", type: "number" },
  { label: "+", value: "+", type: "operator" },

  { label: "±", action: "sign", type: "action" },
  { label: "0", value: "0", type: "number" },
  { label: ".", value: ".", type: "number" },
  { label: "=", action: "equals", type: "equals" },
];

const state = {
  expression: "",
  result: "0",
  numericResult: 0,
  justEvaluated: false,
  error: null,
  history: [],
  sceneEnabled: true,
  fpsEnabled: true,
};

const calculator = new CalculatorEngine({
  maxHistory: 20,
});

calculator.subscribe((snapshot) => {
  state.expression = snapshot.expression;
  state.result = snapshot.result;
  state.numericResult = snapshot.numericResult;
  state.justEvaluated = snapshot.justEvaluated;
  state.error = snapshot.error;
  state.history = snapshot.history;

  updateDisplay();
  renderHistory();
});

const appContext = {
  version: APP_VERSION,
  THREE,
  state,
  elements: {},
  scene: null,
  renderer: null,
  animationFrame: 0,
  destroy() {
    cancelAnimationFrame(this.animationFrame);
    this.controls?.dispose();
    this.threeCleanup?.();
    this.renderer?.dispose();
    document.querySelector("#app")?.replaceChildren();
  },
};

function loadStyles() {
  const head = document.head;

  for (const href of CSS_FILES) {
    if (head.querySelector(`link[data-app-style="${href}"]`)) {
      continue;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.appStyle = href;
    head.append(link);
  }
}

function createElement(tag, options = {}, children = []) {
  const element = document.createElement(tag);

  if (options.className) {
    element.className = options.className;
  }

  if (options.id) {
    element.id = options.id;
  }

  if (options.text) {
    element.textContent = options.text;
  }

  if (options.html) {
    element.innerHTML = options.html;
  }

  if (options.attributes) {
    for (const [name, value] of Object.entries(options.attributes)) {
      if (value !== null && value !== undefined) {
        element.setAttribute(name, String(value));
      }
    }
  }

  if (options.dataset) {
    Object.assign(element.dataset, options.dataset);
  }

  if (options.listeners) {
    for (const [event, handler] of Object.entries(options.listeners)) {
      element.addEventListener(event, handler);
    }
  }

  for (const child of children) {
    if (child) {
      element.append(child);
    }
  }

  return element;
}

function buildShell() {
  const root = document.querySelector("#app");

  if (!root) {
    throw new Error("Container #app tidak ditemukan.");
  }

  root.replaceChildren();
  root.className = "app-shell";

  const app = createElement("div", {
    className: "app",
    attributes: {
      "data-app-version": APP_VERSION,
    },
  });

  const header = createElement(
    "header",
    { className: "app-header" },
    [
      createElement("div", { className: "app-header__start" }, [
        createElement("button", {
          className: "menu-button",
          attributes: {
            type: "button",
            "aria-label": "Buka menu",
            "aria-expanded": "false",
            "aria-controls": "app-menu",
          },
          html: `
            <span class="menu-button__bars" aria-hidden="true">
              <span></span><span></span><span></span>
            </span>
          `,
          listeners: {
            click: toggleMenu,
          },
        }),
        createElement("a", {
          className: "brand",
          attributes: {
            href: "#",
            "aria-label": "3D Kakulator",
          },
        }, [
          createElement("span", {
            className: "brand__mark",
            text: "3D",
            attributes: { "aria-hidden": "true" },
          }),
          createElement("span", {
            className: "brand__name",
            text: "Kakulator",
          }),
        ]),
      ]),
      createElement("div", { className: "toolbar-end" }, [
        createElement("span", {
          className: "badge badge--status",
          html: '<span class="status-dot" aria-hidden="true"></span> Ready',
        }),
        createElement("button", {
          className: "btn btn--ghost btn--icon",
          attributes: {
            type: "button",
            "aria-label": "Aktif/nonaktif efek 3D",
            title: "Toggle efek 3D",
            "aria-pressed": String(state.sceneEnabled),
          },
          html: "3D",
          listeners: {
            click: toggleScene,
          },
        }),
      ]),
    ],
  );

  const menu = createElement(
    "nav",
    {
      className: "popover menu",
      id: "app-menu",
      attributes: {
        hidden: "",
      },
    },
    [
      createElement("div", { className: "menu__title", text: "Pengaturan" }),
      createMenuSwitch("FPS Counter", state.fpsEnabled, toggleFPS),
      createMenuSwitch("Efek 3D", state.sceneEnabled, toggleScene),
    ],
  );

  const viewport = createElement(
    "section",
    {
      className: "viewport three-surface",
      attributes: {
        "aria-label": "Tampilan 3D",
      },
    },
    [
      createElement("div", { className: "viewport__canvas", id: "three-container" }),
      createElement("div", { className: "viewport-overlay viewport-overlay--top" }, [
        createElement("div", { className: "viewport-hud" }, [
          createElement("span", { text: "3D ENGINE" }),
          createElement("span", { text: `THREE.JS ${THREE.REVISION}` }),
        ]),
      ]),
      createElement("div", { className: "viewport-overlay viewport-overlay--bottom" }, [
        createElement("span", {
          className: "fps-counter",
          id: "fps-counter",
          text: "FPS: --",
          attributes: { "aria-live": "off" },
        }),
      ]),
    ],
  );

  const display = createElement("section", {
    className: "calculator-display",
    attributes: {
      "aria-label": "Layar kalkulator",
    },
  }, [
    createElement("div", {
      className: "calculator-display__expression",
      id: "calculator-expression",
      text: "",
    }),
    createElement("output", {
      className: "calculator-display__result",
      id: "calculator-result",
      text: "0",
      attributes: {
        "aria-live": "polite",
        "aria-label": "Hasil",
      },
    }),
  ]);

  const keypad = createElement("div", {
    className: "calculator-keypad calculator-keypad--five-column",
    attributes: {
      role: "group",
      "aria-label": "Tombol kalkulator",
    },
  });

  for (const key of CALCULATOR_KEYS) {
    keypad.append(createCalculatorKey(key));
  }

  const calculator = createElement(
    "section",
    {
      className: "calculator panel panel--fill",
      attributes: {
        "aria-label": "Kalkulator",
      },
    },
    [
      createElement("div", { className: "panel__header" }, [
        createElement("div", {}, [
          createElement("span", { className: "panel__eyebrow", text: "CALCULATOR" }),
          createElement("h1", { className: "panel__title", text: "3D Kakulator" }),
        ]),
        createElement("span", {
          className: "badge",
          text: `v${APP_VERSION}`,
        }),
      ]),
      display,
      keypad,
      createElement("section", {
        className: "calculator-history",
        attributes: {
          "aria-label": "Riwayat perhitungan",
        },
      }, [
        createElement("div", { className: "calculator-history__header" }, [
          createElement("h2", { className: "calculator-history__title", text: "History" }),
          createElement("button", {
            className: "btn btn--ghost btn--small",
            text: "Clear",
            attributes: { type: "button" },
            listeners: { click: clearHistory },
          }),
        ]),
        createElement("div", {
          className: "history-list",
          id: "history-list",
        }),
      ]),
    ],
  );

  const workspace = createElement(
    "main",
    {
      className: "app-main workspace workspace--calculator-first",
      attributes: {
        "aria-label": "Ruang kerja kalkulator",
      },
    },
    [
      createElement("div", { className: "workspace__main" }, [calculator]),
      createElement("aside", {
        className: "workspace__side panel panel--fill",
        attributes: {
          "aria-label": "3D Preview",
        },
      }, [
        viewport,
      ]),
    ],
  );

  const footer = createElement("footer", {
    className: "app-footer",
    html: `
      <span>3D Kakulator</span>
      <span>•</span>
      <span>Powered by Three.js</span>
    `,
  });

  app.append(header, menu, workspace, footer);
  root.append(app);

  appContext.elements = {
    root,
    app,
    header,
    menu,
    viewport,
    calculator,
    display,
    expression: document.querySelector("#calculator-expression"),
    result: document.querySelector("#calculator-result"),
    keypad,
    historyList: document.querySelector("#history-list"),
    fps: document.querySelector("#fps-counter"),
    menuButton: header.querySelector(".menu-button"),
    sceneContainer: document.querySelector("#three-container"),
  };

  renderHistory();
}

function createMenuSwitch(label, checked, handler) {
  const inputId = `setting-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  const input = createElement("input", {
    attributes: {
      type: "checkbox",
      id: inputId,
      role: "switch",
      checked: checked ? "" : null,
    },
    listeners: {
      change: handler,
    },
  });

  return createElement("label", { className: "settings-row", attributes: { for: inputId } }, [
    createElement("span", { className: "settings-row__label", text: label }),
    createElement("span", { className: "switch" }, [input, createElement("span", {
      className: "switch__track",
      attributes: { "aria-hidden": "true" },
    })]),
  ]);
}

function createCalculatorKey(key) {
  const classes = ["calc-key"];

  if (key.type === "operator") classes.push("calc-key--operator");
  if (key.type === "equals") classes.push("calc-key--equals");
  if (key.type === "action") classes.push("calc-key--action");

  return createElement("button", {
    className: classes.join(" "),
    text: key.label,
    attributes: {
      type: "button",
      "aria-label": key.label === "×" ? "Kali" : undefined,
      "data-action": key.action ?? "",
      "data-value": key.value ?? "",
    },
    listeners: {
      click: () => handleKey(key),
    },
  });
}

function handleKey(key) {
  return calculator.press(key);
}

function calculate() {
  return calculator.calculate();
}

function updateDisplay() {
  if (!appContext.elements.expression || !appContext.elements.result) {
    return;
  }

  appContext.elements.expression.textContent = state.expression || "Ready";
  appContext.elements.result.textContent = state.result;
  appContext.elements.result.title = state.error || "";
  update3DDisplay();
}

function renderHistory() {
  const list = appContext.elements.historyList;

  if (!list) return;

  list.replaceChildren();

  if (!state.history.length) {
    list.append(createElement("div", {
      className: "empty-state",
      html: "<span>Belum ada perhitungan.</span>",
    }));
    return;
  }

  for (const item of state.history) {
    const entry = createElement("button", {
      className: "history-item",
      attributes: {
        type: "button",
        title: `Gunakan hasil ${item.result}`,
      },
      listeners: {
        click: () => {
          const index = state.history.findIndex((entry) => entry.id === item.id);
          if (index >= 0) {
            calculator.recallHistory(index);
          }
        },
      },
    }, [
      createElement("span", {
        className: "history-item__expression",
        text: item.expression,
      }),
      createElement("strong", {
        className: "history-item__result",
        text: item.result,
      }),
    ]);

    entry.dataset.index = String(state.history.indexOf(item));
    list.append(entry);
  }
}

function clearHistory() {
  calculator.clearHistory();
}

function toggleMenu() {
  const { menu, menuButton } = appContext.elements;

  if (!menu || !menuButton) return;

  const willOpen = menu.hasAttribute("hidden");

  if (willOpen) {
    menu.removeAttribute("hidden");
  } else {
    menu.setAttribute("hidden", "");
  }

  menuButton.setAttribute("aria-expanded", String(willOpen));
}

function toggleScene(event) {
  state.sceneEnabled = event?.target?.checked ?? !state.sceneEnabled;

  const renderer = appContext.renderer;
  if (renderer) {
    renderer.domElement.style.opacity = state.sceneEnabled ? "1" : "0";
  }

  updateSceneVisibility();

  const button = appContext.elements.header?.querySelector('[title="Toggle efek 3D"]');
  button?.setAttribute("aria-pressed", String(state.sceneEnabled));
}

function updateSceneVisibility() {
  appContext.elements.viewport?.classList.toggle(
    "is-disabled",
    !state.sceneEnabled,
  );
}

function toggleFPS(event) {
  state.fpsEnabled = event?.target?.checked ?? !state.fpsEnabled;

  if (appContext.elements.fps) {
    appContext.elements.fps.hidden = !state.fpsEnabled;
  }
}

function initCalculatorKeyboard() {
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const supportedKeys = new Set([
      "Enter",
      "=",
      "Backspace",
      "Escape",
      "%",
      ".",
      "+",
      "-",
      "*",
      "/",
    ]);

    if (/^[0-9]$/.test(event.key) || supportedKeys.has(event.key)) {
      if (["Enter", "=", "Backspace", "Escape"].includes(event.key)) {
        event.preventDefault();
      }

      calculator.handleKeyboardKey(event.key);
    }
  });
}

function initThreeScene() {
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

function initGlobalInteractions() {
  document.addEventListener("click", (event) => {
    const { menu, menuButton } = appContext.elements;

    if (
      menu &&
      !menu.hasAttribute("hidden") &&
      !menu.contains(event.target) &&
      !menuButton?.contains(event.target)
    ) {
      menu.setAttribute("hidden", "");
      menuButton?.setAttribute("aria-expanded", "false");
    }
  });
}

function showStartupState() {
  updateDisplay();
  updateSceneVisibility();

  if (appContext.elements.fps) {
    appContext.elements.fps.hidden = !state.fpsEnabled;
  }
}

function init() {
  try {
    loadStyles();
    buildShell();
    initCalculatorKeyboard();
    initGlobalInteractions();
    initThreeScene();
    showStartupState();

    document.documentElement.dataset.appReady = "true";
    console.info(`3D Kakulator v${APP_VERSION} initialized.`);
  } catch (error) {
    console.error("3D Kakulator failed to initialize:", error);

    const root = document.querySelector("#app");
    if (root) {
      root.innerHTML = `
        <section class="empty-state" role="alert">
          <strong>Aplikasi gagal dimuat.</strong>
          <span>${error instanceof Error ? error.message : "Unknown error"}</span>
        </section>
      `;
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

export { appContext, init };
