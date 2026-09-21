import { CalculatorEngine } from "./calculator.js";
import {
  ThreeSceneController,
  THREE_REVISION,
} from "./three-scene.js";
import { AnimationController } from "./animations.js";
import { UIController } from "./ui.js";

/**
 * 3D Kakulator — Application Bootstrap
 *
 * main.js is intentionally small:
 * - create application services
 * - wire modules together
 * - start the application
 * - own global lifecycle
 *
 * Static structure lives in index.html.
 * Calculator logic lives in calculator.js.
 * DOM behavior lives in ui.js.
 * 3D rendering lives in three-scene.js.
 * Motion helpers live in animations.js.
 */

export const APP_VERSION = "0.1.0";
export { THREE_REVISION };

export const appState = {
  sceneEnabled: true,
  fpsEnabled: true,
};

export const calculator = new CalculatorEngine({
  maxHistory: 20,
});

export const appContext = {
  version: APP_VERSION,
  state: appState,
  calculator,
  ui: null,
  animation: null,
  threeScene: null,
  initialized: false,

  destroy() {
    this.ui?.destroy();
    this.animation?.destroy();
    this.threeScene?.destroy();
    this.calculator.destroy();

    this.ui = null;
    this.animation = null;
    this.threeScene = null;
    this.initialized = false;

    document.documentElement.removeAttribute("data-app-ready");
  },
};

function createApplication() {
  const root = document.querySelector("#app");

  if (!root) {
    throw new Error("Container #app tidak ditemukan.");
  }

  const animation = new AnimationController({
    root,
  });

  let threeScene = null;

  const ui = new UIController({
    root,
    calculator,
    animationController: animation,
    onSceneToggle(enabled) {
      appState.sceneEnabled = Boolean(enabled);
      threeScene?.setEnabled(appState.sceneEnabled);
    },
    onFPSToggle(enabled) {
      appState.fpsEnabled = Boolean(enabled);

      const fpsElement = root.querySelector("#fps-counter");

      if (fpsElement) {
        fpsElement.hidden = !appState.fpsEnabled;
      }
    },
  });

  ui.bind();

  threeScene = new ThreeSceneController({
    container: ui.elements.sceneContainer,
    fpsElement: ui.elements.fps,
    state: appState,
    onCalculatorKey(key) {
      calculator.press(key);
    },
  });

  threeScene.init();
  threeScene.setEnabled(appState.sceneEnabled);

  ui.attachThreeScene(threeScene);

  appContext.ui = ui;
  appContext.animation = animation;
  appContext.threeScene = threeScene;

  synchronizeInitialState();
  markApplicationReady();

  return appContext;
}

function synchronizeInitialState() {
  const {
    ui,
  } = appContext;

  if (!ui) {
    return;
  }

  appState.sceneEnabled =
    ui.elements.sceneToggle.checked;

  appState.fpsEnabled =
    ui.elements.fpsToggle.checked;

  ui.sync();
}

function markApplicationReady() {
  const root = document.querySelector("#app");

  if (!root) {
    return;
  }

  root.dataset.appReady = "true";
  document.documentElement.dataset.appReady = "true";
  appContext.initialized = true;
}

function showFatalError(error) {
  const root = document.querySelector("#app");

  if (!root) {
    return;
  }

  const message =
    error instanceof Error
      ? error.message
      : "Unknown error";

  root.dataset.appReady = "false";

  root.innerHTML = "";

  const section = document.createElement("section");
  section.className = "empty-state";
  section.setAttribute("role", "alert");

  const content = document.createElement("div");
  content.className = "empty-state__content";

  const title = document.createElement("div");
  title.className = "empty-state__title";
  title.textContent = "Aplikasi gagal dimuat.";

  const description = document.createElement("div");
  description.className = "empty-state__description";
  description.textContent = message;

  content.append(title, description);
  section.append(content);
  root.append(section);
}

export function init() {
  if (appContext.initialized) {
    return appContext;
  }

  try {
    return createApplication();
  } catch (error) {
    console.error(
      "3D Kakulator failed to initialize:",
      error,
    );

    showFatalError(error);

    return null;
  }
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    init,
    { once: true },
  );
} else {
  init();
}
