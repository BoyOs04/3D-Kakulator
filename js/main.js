import { CalculatorEngine } from "./calculator.js";
import { ThreeSceneController } from "./three-scene.js";

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
  state,
  elements: {},
  threeScene: null,
  destroy() {
    this.threeScene?.destroy();
    calculator.destroy();
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
  appContext.threeScene?.updateDisplay(
    state.expression,
    state.result,
  );
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
  state.sceneEnabled =
    event?.target?.checked ?? !state.sceneEnabled;

  appContext.threeScene?.setEnabled(state.sceneEnabled);
  updateSceneVisibility();

  const button = appContext.elements.header?.querySelector(
    '[title="Toggle efek 3D"]',
  );

  button?.setAttribute(
    "aria-pressed",
    String(state.sceneEnabled),
  );
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

    appContext.threeScene = new ThreeSceneController({
      container: appContext.elements.sceneContainer,
      fpsElement: appContext.elements.fps,
      state,
      onCalculatorKey: handleKey,
    });

    appContext.threeScene.init();

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
