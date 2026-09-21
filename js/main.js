import { CalculatorEngine } from "./calculator.js";
import { ThreeSceneController } from "./three-scene.js";

/**
 * 3D Kakulator — Application Bootstrap
 *
 * HTML owns the document structure.
 * This module only connects application behavior to the existing DOM.
 *
 * Responsibilities:
 * - Initialize the calculator engine.
 * - Bind calculator controls and keyboard input.
 * - Synchronize the HTML display and history.
 * - Initialize and control the Three.js scene.
 * - Manage lightweight global UI state such as the menu and settings.
 */

const APP_VERSION = "0.1.0";

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

const appContext = {
  version: APP_VERSION,
  state,
  elements: {},
  calculator,
  threeScene: null,
  motion: null,
  destroy() {
    this.threeScene?.destroy();
    calculator.destroy();
    this.elements.root?.replaceChildren();
  },
};

calculator.subscribe((snapshot) => {
  Object.assign(state, snapshot);

  updateDisplay();
  renderHistory();
});

function cacheElements() {
  const root = document.querySelector("#app");

  if (!root) {
    throw new Error("Container #app tidak ditemukan.");
  }

  const required = {
    root,
    app: root.querySelector(".app"),
    menuButton: root.querySelector("#menu-button"),
    menu: root.querySelector("#app-menu"),
    sceneToggleButton: root.querySelector("#scene-toggle-button"),
    sceneToggle: root.querySelector("#scene-toggle"),
    fpsToggle: root.querySelector("#fps-toggle"),
    fps: root.querySelector("#fps-counter"),
    sceneContainer: root.querySelector("#three-container"),
    keypad: root.querySelector("#calculator-keypad"),
    expression: root.querySelector("#calculator-expression"),
    result: root.querySelector("#calculator-result"),
    message: root.querySelector("#calculator-message"),
    historyList: root.querySelector("#history-list"),
    historyClear: root.querySelector("#history-clear"),
    status: root.querySelector("#app-status"),
  };

  for (const [name, element] of Object.entries(required)) {
    if (!element) {
      throw new Error(`Elemen UI wajib "${name}" tidak ditemukan.`);
    }
  }

  appContext.elements = required;

  root.dataset.appReady = "false";
}

function handleCalculatorInput(key) {
  calculator.press(key);
}

function handleKeypadClick(event) {
  const button = event.target.closest("button[data-action], button[data-value]");

  if (!button || !appContext.elements.keypad.contains(button)) {
    return;
  }

  const action = button.dataset.action;
  const value = button.dataset.value;

  handleCalculatorInput({
    label: button.textContent.trim(),
    action: action || undefined,
    value: value || undefined,
    type: action
      ? "action"
      : inferButtonType(value),
  });

  button.classList.remove("is-pressed");
  void button.offsetWidth;
  button.classList.add("is-pressed");

  window.setTimeout(() => {
    button.classList.remove("is-pressed");
  }, 180);
}

function inferButtonType(value) {
  if (!value) {
    return "unknown";
  }

  if (/^[0-9.]$/.test(value)) {
    return "number";
  }

  if (["+", "-", "*", "/"].includes(value)) {
    return "operator";
  }

  return "unknown";
}

function handleKeyboard(event) {
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    isTextEditingTarget(event.target)
  ) {
    return;
  }

  const supported = [
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
  ];

  if (!/^[0-9]$/.test(event.key) && !supported.includes(event.key)) {
    return;
  }

  if (["Enter", "=", "Backspace", "Escape"].includes(event.key)) {
    event.preventDefault();
  }

  calculator.handleKeyboardKey(event.key);
}

function isTextEditingTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      "input:not([type='checkbox']):not([type='radio']), textarea, select, [contenteditable='true']",
    ),
  );
}

function updateDisplay() {
  const {
    expression,
    result,
    message,
  } = appContext.elements;

  if (!expression || !result) {
    return;
  }

  expression.textContent = state.expression || "Ready";
  result.textContent = state.result;
  result.title = state.error || "";

  if (message) {
    message.textContent = state.error || "";
  }

  appContext.threeScene?.updateDisplay(
    state.expression,
    state.result,
  );

  updateStatus();
}

function updateStatus() {
  const status = appContext.elements.status;

  if (!status) {
    return;
  }

  if (state.error) {
    status.textContent = "Error";
    status.classList.remove("badge--status");
    status.classList.add("badge--danger");
    return;
  }

  status.textContent = "Ready";
  status.classList.remove("badge--danger");
  status.classList.add("badge--status");
}

function renderHistory() {
  const list = appContext.elements.historyList;

  if (!list) {
    return;
  }

  list.replaceChildren();

  if (!state.history.length) {
    list.append(
      createHistoryEmptyState(),
    );
    return;
  }

  for (const [index, item] of state.history.entries()) {
    const entry = document.createElement("button");

    entry.type = "button";
    entry.className = "history-item";
    entry.dataset.index = String(index);
    entry.dataset.historyId = item.id;
    entry.title = `Gunakan hasil ${item.result}`;

    const expression = document.createElement("span");
    expression.className = "history-item__expression";
    expression.textContent = item.expression;

    const result = document.createElement("strong");
    result.className = "history-item__result";
    result.textContent = item.result;

    entry.append(expression, result);
    list.append(entry);
  }
}

function createHistoryEmptyState() {
  const empty = document.createElement("div");
  empty.className = "empty-state";

  const text = document.createElement("span");
  text.textContent = "Belum ada perhitungan.";

  empty.append(text);

  return empty;
}

function handleHistoryClick(event) {
  const item = event.target.closest("button[data-index]");

  if (!item || !appContext.elements.historyList.contains(item)) {
    return;
  }

  const index = Number(item.dataset.index);

  if (Number.isInteger(index) && index >= 0) {
    calculator.recallHistory(index);
  }
}

function clearHistory() {
  calculator.clearHistory();
}

function toggleMenu(force) {
  const {
    menu,
    menuButton,
  } = appContext.elements;

  if (!menu || !menuButton) {
    return;
  }

  const open = force ?? menu.hidden;
  menu.hidden = !open;

  menuButton.setAttribute(
    "aria-expanded",
    String(open),
  );
}

function closeMenu() {
  toggleMenu(false);
}

function setSceneEnabled(enabled) {
  state.sceneEnabled = Boolean(enabled);

  appContext.threeScene?.setEnabled(
    state.sceneEnabled,
  );

  appContext.elements.sceneToggle.checked =
    state.sceneEnabled;

  appContext.elements.sceneToggleButton.setAttribute(
    "aria-pressed",
    String(state.sceneEnabled),
  );

  appContext.elements.app?.classList.toggle(
    "scene-disabled",
    !state.sceneEnabled,
  );
}

function setFPSEnabled(enabled) {
  state.fpsEnabled = Boolean(enabled);

  appContext.elements.fps.hidden =
    !state.fpsEnabled;

  appContext.elements.fpsToggle.checked =
    state.fpsEnabled;
}

function bindEvents() {
  const {
    menuButton,
    menu,
    keypad,
    historyList,
    historyClear,
    sceneToggleButton,
    sceneToggle,
    fpsToggle,
  } = appContext.elements;

  keypad.addEventListener(
    "click",
    handleKeypadClick,
  );

  historyList.addEventListener(
    "click",
    handleHistoryClick,
  );

  historyClear.addEventListener(
    "click",
    clearHistory,
  );

  menuButton.addEventListener(
    "click",
    () => toggleMenu(),
  );

  sceneToggleButton.addEventListener(
    "click",
    () => setSceneEnabled(!state.sceneEnabled),
  );

  sceneToggle.addEventListener(
    "change",
    (event) => {
      setSceneEnabled(event.currentTarget.checked);
    },
  );

  fpsToggle.addEventListener(
    "change",
    (event) => {
      setFPSEnabled(event.currentTarget.checked);
    },
  );

  document.addEventListener(
    "keydown",
    handleKeyboard,
  );

  document.addEventListener(
    "click",
    (event) => {
      if (
        !menu.hidden &&
        !menu.contains(event.target) &&
        !menuButton.contains(event.target)
      ) {
        closeMenu();
      }
    },
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && !menu.hidden) {
        closeMenu();
      }
    },
  );
}

function initializeThreeScene() {
  const scene = new (appContext.threeScene = ThreeSceneController)({
    container: appContext.elements.sceneContainer,
    fpsElement: appContext.elements.fps,
    state,
    onCalculatorKey: handleCalculatorInput,
  });

  scene.init();
  appContext.threeScene = scene;

  scene.setEnabled(state.sceneEnabled);
}

function synchronizeInitialState() {
  state.sceneEnabled =
    appContext.elements.sceneToggle.checked;

  state.fpsEnabled =
    appContext.elements.fpsToggle.checked;

  appContext.elements.fps.hidden =
    !state.fpsEnabled;

  updateDisplay();
  renderHistory();
  updateStatus();
  updateSceneEnabledUI();
}

function updateSceneEnabledUI() {
  const enabled = state.sceneEnabled;

  appContext.elements.sceneToggle.checked =
    enabled;

  appContext.elements.sceneToggleButton.setAttribute(
    "aria-pressed",
    String(enabled),
  );

  appContext.elements.app?.classList.toggle(
    "scene-disabled",
    !enabled,
  );
}

function markReady() {
  appContext.elements.root.dataset.appReady = "true";
  document.documentElement.dataset.appReady = "true";
}

function init() {
  try {
    cacheElements();
    bindEvents();
    synchronizeInitialState();
    initializeThreeScene();
    updateDisplay();
    markReady();

    console.info(
      `3D Kakulator v${APP_VERSION} initialized.`,
    );
  } catch (error) {
    console.error(
      "3D Kakulator failed to initialize:",
      error,
    );

    showFatalError(error);
  }
}

function showFatalError(error) {
  const root = appContext.elements.root ||
    document.querySelector("#app");

  if (!root) {
    return;
  }

  const message =
    error instanceof Error
      ? error.message
      : "Unknown error";

  root.dataset.appReady = "false";

  root.innerHTML = `
    <section class="empty-state" role="alert">
      <div class="empty-state__content">
        <div class="empty-state__title">
          Aplikasi gagal dimuat.
        </div>
        <div class="empty-state__description">
          ${escapeHTML(message)}
        </div>
      </div>
    </section>
  `;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

export {
  appContext,
  calculator,
  init,
};
