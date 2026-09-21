import { CalculatorEngine } from "./calculator.js";
import {
  ThreeSceneController,
  THREE_REVISION,
} from "./three-scene.js";
import { AnimationController } from "./animations.js";
import {
  SettingsManager,
  SettingsKey,
} from "./settings.js";
import { UIController } from "./ui.js";

/**
 * 3D Kakulator — Application Bootstrap
 *
 * main.js is intentionally small:
 * - create application services
 * - restore persistent settings
 * - wire modules together
 * - start the application
 * - own global lifecycle
 *
 * Feature logic belongs to the owning modules.
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

export const settings = new SettingsManager();

export const appContext = {
  version: APP_VERSION,
  state: appState,
  calculator,
  settings,
  ui: null,
  animation: null,
  threeScene: null,
  initialized: false,

  destroy() {
    this.ui?.destroy();
    this.animation?.destroy();
    this.threeScene?.destroy();
    this.settings?.destroy();
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

  const runtime = settings.getRuntimeProfile();

  appState.sceneEnabled = runtime.sceneEnabled;
  appState.fpsEnabled = runtime.fpsEnabled;

  const animation = new AnimationController({
    root,
    reducedMotion: runtime.reducedMotion,
  });

  let threeScene = null;

  const ui = new UIController({
    root,
    calculator,
    animationController: animation,

    onSceneToggle(enabled) {
      settings.set(
        SettingsKey.SCENE_ENABLED,
        enabled,
      );
    },

    onFPSToggle(enabled) {
      settings.set(
        SettingsKey.FPS_ENABLED,
        enabled,
      );
    },
  });

  ui.bind();

  /*
   * Restore persisted UI state before creating the 3D controller.
   * UIController owns the actual DOM controls; SettingsManager owns
   * persistence and normalization.
   */
  ui.elements.sceneToggle.checked =
    runtime.sceneEnabled;

  ui.elements.fpsToggle.checked =
    runtime.fpsEnabled;

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

  /*
   * Settings are the single source of truth for persistent preferences.
   * UI events update SettingsManager; SettingsManager changes update
   * application state and the corresponding runtime services.
   */
  const unsubscribeSettings = settings.subscribe(
    ({ runtime: nextRuntime }) => {
      appState.sceneEnabled =
        nextRuntime.sceneEnabled;

      appState.fpsEnabled =
        nextRuntime.fpsEnabled;

      ui.syncSettings({
        sceneEnabled:
          nextRuntime.sceneEnabled,
        fpsEnabled:
          nextRuntime.fpsEnabled,
      });

      threeScene?.setEnabled(
        nextRuntime.sceneEnabled,
      );

      animation.reducedMotion =
        nextRuntime.reducedMotion;

      const fpsElement = ui.elements.fps;

      if (fpsElement) {
        fpsElement.hidden =
          !nextRuntime.fpsEnabled;
      }
    },
  );

  appContext.unsubscribeSettings =
    unsubscribeSettings;

  synchronizeInitialState();
  markApplicationReady();

  return appContext;
}

function synchronizeInitialState() {
  const { ui } = appContext;

  if (!ui) {
    return;
  }

  /*
   * Do not overwrite restored settings with HTML defaults.
   * SettingsManager remains the source of truth.
   */
  const runtime = settings.getRuntimeProfile();

  appState.sceneEnabled =
    runtime.sceneEnabled;

  appState.fpsEnabled =
    runtime.fpsEnabled;

  ui.syncSettings({
    sceneEnabled:
      runtime.sceneEnabled,
    fpsEnabled:
      runtime.fpsEnabled,
  });

  appContext.threeScene?.setEnabled(
    runtime.sceneEnabled,
  );

  if (appContext.animation) {
    appContext.animation.reducedMotion =
      runtime.reducedMotion;
  }
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
