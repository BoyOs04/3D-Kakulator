/*
 * 3D Kakulator — UI Controller
 *
 * Responsibilities:
 * - Bind the static HTML structure to application behavior.
 * - Render calculator state into the DOM.
 * - Handle keypad, keyboard, history and menu interactions.
 * - Coordinate the HTML display with the Three.js display.
 * - Keep DOM/event logic out of main.js and calculator.js.
 *
 * This module intentionally does not own calculator arithmetic or Three.js
 * rendering. Those responsibilities belong to calculator.js and three-scene.js.
 */

export class UIController {
  constructor({
    root = document.querySelector("#app"),
    calculator,
    threeScene = null,
    animationController = null,
    onSceneToggle = () => {},
    onFPSToggle = () => {},
  } = {}) {
    if (!root) {
      throw new Error("Root UI #app tidak ditemukan.");
    }

    if (!calculator || typeof calculator.press !== "function") {
      throw new TypeError("UIController membutuhkan CalculatorEngine.");
    }

    this.root = root;
    this.calculator = calculator;
    this.threeScene = threeScene;
    this.animationController = animationController;
    this.onSceneToggle = onSceneToggle;
    this.onFPSToggle = onFPSToggle;

    this.elements = {};
    this.unsubscribeCalculator = null;
    this.bound = false;
    this.destroyed = false;
  }

  /**
   * Locate the static HTML elements required by the UI controller.
   */
  cacheElements() {
    const required = {
      app: this.root.querySelector(".app"),
      menuButton: this.root.querySelector("#menu-button"),
      menu: this.root.querySelector("#app-menu"),
      sceneToggleButton: this.root.querySelector("#scene-toggle-button"),
      sceneToggle: this.root.querySelector("#scene-toggle"),
      fpsToggle: this.root.querySelector("#fps-toggle"),
      fps: this.root.querySelector("#fps-counter"),
      sceneContainer: this.root.querySelector("#three-container"),
      keypad: this.root.querySelector("#calculator-keypad"),
      expression: this.root.querySelector("#calculator-expression"),
      result: this.root.querySelector("#calculator-result"),
      message: this.root.querySelector("#calculator-message"),
      historyList: this.root.querySelector("#history-list"),
      historyClear: this.root.querySelector("#history-clear"),
      status: this.root.querySelector("#app-status"),
    };

    const missing = Object.entries(required)
      .filter(([, element]) => !element)
      .map(([name]) => name);

    if (missing.length) {
      throw new Error(
        `Elemen UI berikut tidak ditemukan: ${missing.join(", ")}.`,
      );
    }

    this.elements = required;

    return this;
  }

  /**
   * Connect UI events and calculator state updates.
   */
  bind() {
    if (this.bound) {
      return this;
    }

    this.cacheElements();

    const {
      keypad,
      historyList,
      historyClear,
      menuButton,
      menu,
      sceneToggleButton,
      sceneToggle,
      fpsToggle,
    } = this.elements;

    keypad.addEventListener("click", this.handleKeypadClick);
    historyList.addEventListener("click", this.handleHistoryClick);
    historyClear.addEventListener("click", this.handleHistoryClear);

    menuButton.addEventListener("click", this.handleMenuButton);
    sceneToggleButton.addEventListener(
      "click",
      this.handleSceneButton,
    );

    sceneToggle.addEventListener(
      "change",
      this.handleSceneInput,
    );

    fpsToggle.addEventListener(
      "change",
      this.handleFPSInput,
    );

    document.addEventListener("keydown", this.handleKeyboard);
    document.addEventListener("click", this.handleOutsideClick);
    document.addEventListener("keydown", this.handleMenuKeyboard);

    this.unsubscribeCalculator = this.calculator.subscribe(
      this.handleCalculatorState,
    );

    this.bound = true;

    return this;
  }

  /**
   * Render the current calculator state.
   */
  sync() {
    this.handleCalculatorState(this.calculator.getState());
    this.syncSettings({
      sceneEnabled: this.elements.sceneToggle.checked,
      fpsEnabled: this.elements.fpsToggle.checked,
    });

    return this;
  }

  handleCalculatorState = (state) => {
    if (this.destroyed) {
      return;
    }

    const {
      expression,
      result,
      error,
    } = this.elements;

    if (expression) {
      expression.textContent = state.expression || "Ready";
    }

    if (result) {
      const nextResult = String(state.result ?? "0");
      const changed = result.textContent !== nextResult;

      result.textContent = nextResult;
      result.title = state.error || "";

      if (
        changed &&
        this.animationController &&
        !this.animationController.reducedMotion
      ) {
        this.animationController.flash(result, {
          duration: 160,
        });
      }
    }

    if (this.elements.message) {
      this.elements.message.textContent = state.error || "";
    }

    this.renderHistory(state.history);
    this.renderStatus(Boolean(state.error));

    this.threeScene?.updateDisplay(
      state.expression || "",
      state.result || "0",
    );
  };

  handleKeypadClick = (event) => {
    const button = event.target.closest(
      "button[data-action], button[data-value]",
    );

    if (
      !button ||
      !this.elements.keypad.contains(button)
    ) {
      return;
    }

    const action = button.dataset.action || undefined;
    const value = button.dataset.value || undefined;

    this.calculator.press({
      label: button.textContent.trim(),
      action,
      value,
      type: action
        ? "action"
        : inferButtonType(value),
    });

    this.animateButtonPress(button);
  };

  animateButtonPress(button) {
    if (!this.animationController) {
      return;
    }

    this.animationController.press(
      button,
      "is-pressed",
    );
  }

  handleKeyboard = (event) => {
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.isComposing ||
      isTextEditingTarget(event.target)
    ) {
      return;
    }

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

    if (
      !/^[0-9]$/.test(event.key) &&
      !supportedKeys.has(event.key)
    ) {
      return;
    }

    if (
      ["Enter", "=", "Backspace", "Escape"].includes(
        event.key,
      )
    ) {
      event.preventDefault();
    }

    this.calculator.handleKeyboardKey(event.key);
  };

  handleHistoryClick = (event) => {
    const item = event.target.closest(
      "button[data-index]",
    );

    if (
      !item ||
      !this.elements.historyList.contains(item)
    ) {
      return;
    }

    const index = Number(item.dataset.index);

    if (!Number.isInteger(index) || index < 0) {
      return;
    }

    this.calculator.recallHistory(index);

    this.animationController?.playClass(
      item,
      "is-selected",
    );
  };

  handleHistoryClear = () => {
    this.calculator.clearHistory();
  };

  renderHistory(history = []) {
    const list = this.elements.historyList;

    if (!list) {
      return;
    }

    list.replaceChildren();

    if (!history.length) {
      list.append(createHistoryEmptyState());
      return;
    }

    const fragment = document.createDocumentFragment();

    history.forEach((item, index) => {
      const entry = document.createElement("button");

      entry.type = "button";
      entry.className = "history-item";
      entry.dataset.index = String(index);
      entry.dataset.historyId = item.id || "";
      entry.title = `Gunakan hasil ${item.result}`;

      const expression = document.createElement("span");
      expression.className = "history-item__expression";
      expression.textContent = item.expression;

      const result = document.createElement("strong");
      result.className = "history-item__result";
      result.textContent = item.result;

      entry.append(expression, result);
      fragment.append(entry);
    });

    list.append(fragment);

    if (this.animationController) {
      this.animationController.stagger(
        list.querySelectorAll(".history-item"),
        {
          baseDelay: 0,
          step: 25,
          animationClass: "animate-rise-in",
        },
      );
    }
  }

  renderStatus(hasError) {
    const status = this.elements.status;

    if (!status) {
      return;
    }

    status.classList.remove(
      "badge--status",
      "badge--danger",
    );

    if (hasError) {
      status.classList.add("badge--danger");
      status.setAttribute("role", "status");
      status.textContent = "Error";
      return;
    }

    status.classList.add("badge--status");
    status.setAttribute("role", "status");
    status.textContent = "Ready";
  }

  syncSettings({
    sceneEnabled,
    fpsEnabled,
  }) {
    const normalizedScene = Boolean(sceneEnabled);
    const normalizedFPS = Boolean(fpsEnabled);

    this.elements.sceneToggle.checked =
      normalizedScene;

    this.elements.fpsToggle.checked =
      normalizedFPS;

    this.elements.fps.hidden =
      !normalizedFPS;

    this.elements.sceneToggleButton.setAttribute(
      "aria-pressed",
      String(normalizedScene),
    );

    this.elements.app.classList.toggle(
      "scene-disabled",
      !normalizedScene,
    );
  }

  handleMenuButton = () => {
    this.toggleMenu();
  };

  handleMenuKeyboard = (event) => {
    if (event.key === "Escape" && !this.elements.menu.hidden) {
      this.closeMenu();
      this.elements.menuButton.focus();
    }
  };

  handleOutsideClick = (event) => {
    const {
      menu,
      menuButton,
    } = this.elements;

    if (
      menu.hidden ||
      menu.contains(event.target) ||
      menuButton.contains(event.target)
    ) {
      return;
    }

    this.closeMenu();
  };

  toggleMenu(force) {
    const { menu, menuButton } = this.elements;

    const shouldOpen =
      typeof force === "boolean"
        ? force
        : menu.hidden;

    menu.hidden = !shouldOpen;

    menuButton.setAttribute(
      "aria-expanded",
      String(shouldOpen),
    );

    menuButton.setAttribute(
      "aria-label",
      shouldOpen
        ? "Tutup menu pengaturan"
        : "Buka menu pengaturan",
    );
  }

  closeMenu() {
    this.toggleMenu(false);
  }

  handleSceneButton = () => {
    const next = !this.elements.sceneToggle.checked;

    this.elements.sceneToggle.checked = next;
    this.setSceneState(next);
  };

  handleSceneInput = (event) => {
    this.setSceneState(
      event.currentTarget.checked,
    );
  };

  setSceneState(enabled) {
    const normalized = Boolean(enabled);

    this.elements.sceneToggle.checked =
      normalized;

    this.elements.sceneToggleButton.setAttribute(
      "aria-pressed",
      String(normalized),
    );

    this.elements.app.classList.toggle(
      "scene-disabled",
      !normalized,
    );

    this.onSceneToggle(normalized);
  }

  handleFPSInput = (event) => {
    const enabled = Boolean(
      event.currentTarget.checked,
    );

    this.elements.fps.hidden = !enabled;
    this.onFPSToggle(enabled);
  };

  /**
   * Replace the scene controller after UI initialization.
   */
  attachThreeScene(threeScene) {
    this.threeScene = threeScene;

    const state = this.calculator.getState();

    this.threeScene?.updateDisplay(
      state.expression || "",
      state.result || "0",
    );

    return this;
  }

  /**
   * Expose a simple public message API for future toast/status systems.
   */
  announce(message) {
    if (!this.elements.message) {
      return;
    }

    this.elements.message.textContent =
      typeof message === "string"
        ? message
        : "";
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.unsubscribeCalculator?.();

    const {
      keypad,
      historyList,
      historyClear,
      menuButton,
      sceneToggleButton,
      sceneToggle,
      fpsToggle,
    } = this.elements;

    keypad?.removeEventListener(
      "click",
      this.handleKeypadClick,
    );
    historyList?.removeEventListener(
      "click",
      this.handleHistoryClick,
    );
    historyClear?.removeEventListener(
      "click",
      this.handleHistoryClear,
    );
    menuButton?.removeEventListener(
      "click",
      this.handleMenuButton,
    );
    sceneToggleButton?.removeEventListener(
      "click",
      this.handleSceneButton,
    );
    sceneToggle?.removeEventListener(
      "change",
      this.handleSceneInput,
    );
    fpsToggle?.removeEventListener(
      "change",
      this.handleFPSInput,
    );

    document.removeEventListener(
      "keydown",
      this.handleKeyboard,
    );
    document.removeEventListener(
      "click",
      this.handleOutsideClick,
    );
    document.removeEventListener(
      "keydown",
      this.handleMenuKeyboard,
    );

    this.unsubscribeCalculator = null;
    this.bound = false;
    this.destroyed = true;
  }
}

export function inferButtonType(value) {
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

export function isTextEditingTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      "input:not([type='checkbox']):not([type='radio']), textarea, select, [contenteditable='true']",
    ),
  );
}

function createHistoryEmptyState() {
  const empty = document.createElement("div");
  empty.className = "empty-state";

  const text = document.createElement("span");
  text.textContent = "Belum ada perhitungan.";

  empty.append(text);

  return empty;
}
