/**
 * 3D Kakulator — Shared Utility Functions
 *
 * Small, dependency-free helpers shared by application modules.
 * Keep this module focused on pure utilities and browser-safe primitives;
 * feature-specific logic belongs in its owning controller/module.
 */

/* -------------------------------------------------------------------------- */
/* Type guards                                                                */
/* -------------------------------------------------------------------------- */

export function isObject(value) {
  return value !== null && typeof value === "object";
}

export function isPlainObject(value) {
  if (!isObject(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

export function isNumber(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );
}

export function isString(value) {
  return typeof value === "string";
}

export function isFunction(value) {
  return typeof value === "function";
}

export function isHTMLElement(value) {
  return (
    typeof HTMLElement !== "undefined" &&
    value instanceof HTMLElement
  );
}

/* -------------------------------------------------------------------------- */
/* Numeric helpers                                                            */
/* -------------------------------------------------------------------------- */

export function clamp(value, minimum, maximum) {
  if (minimum > maximum) {
    [minimum, maximum] = [maximum, minimum];
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return minimum;
  }

  return Math.min(
    maximum,
    Math.max(minimum, number),
  );
}

export function clamp01(value) {
  return clamp(value, 0, 1);
}

export function lerp(start, end, amount) {
  return (
    Number(start) +
    (Number(end) - Number(start)) *
      clamp01(amount)
  );
}

export function inverseLerp(start, end, value) {
  const denominator = Number(end) - Number(start);

  if (denominator === 0) {
    return 0;
  }

  return clamp01(
    (Number(value) - Number(start)) / denominator,
  );
}

export function mapRange(
  value,
  inputMinimum,
  inputMaximum,
  outputMinimum,
  outputMaximum,
) {
  return lerp(
    outputMinimum,
    outputMaximum,
    inverseLerp(
      inputMinimum,
      inputMaximum,
      value,
    ),
  );
}

export function roundTo(
  value,
  decimals = 0,
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  const places = clamp(
    Math.trunc(Number(decimals)),
    0,
    20,
  );

  const factor = 10 ** places;

  return Math.round(
    (number + Number.EPSILON) * factor,
  ) / factor;
}

export function nearlyEqual(
  first,
  second,
  epsilon = Number.EPSILON * 10,
) {
  return Math.abs(
    Number(first) - Number(second),
  ) <= Math.max(0, Number(epsilon));
}

export function randomBetween(
  minimum,
  maximum,
) {
  const min = Number(minimum);
  const max = Number(maximum);

  if (
    !Number.isFinite(min) ||
    !Number.isFinite(max)
  ) {
    return 0;
  }

  return min + Math.random() * (max - min);
}

export function randomInteger(
  minimum,
  maximum,
) {
  const min = Math.ceil(Number(minimum));
  const max = Math.floor(Number(maximum));

  if (min > max) {
    return min;
  }

  return Math.floor(
    Math.random() * (max - min + 1),
  ) + min;
}

/* -------------------------------------------------------------------------- */
/* String helpers                                                             */
/* -------------------------------------------------------------------------- */

export function escapeHTML(value) {
  const string = String(value ?? "");

  if (
    typeof document === "undefined"
  ) {
    return string
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  const element = document.createElement("div");
  element.textContent = string;

  return element.innerHTML;
}

export function truncate(
  value,
  maxLength,
  suffix = "…",
) {
  const string = String(value ?? "");
  const limit = Math.max(0, Math.trunc(maxLength));

  if (string.length <= limit) {
    return string;
  }

  const safeSuffix =
    String(suffix).length >= limit
      ? ""
      : String(suffix);

  return (
    string.slice(
      0,
      limit - safeSuffix.length,
    ) + safeSuffix
  );
}

export function capitalize(value) {
  const string = String(value ?? "");

  if (!string) {
    return "";
  }

  return (
    string.charAt(0).toUpperCase() +
    string.slice(1)
  );
}

export function kebabCase(value) {
  return String(value ?? "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* Number / display helpers                                                   */
/* -------------------------------------------------------------------------- */

export function formatNumber(
  value,
  options = {},
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return options.fallback ?? "—";
  }

  const {
    locale = "id-ID",
    maximumFractionDigits = 12,
    minimumFractionDigits = 0,
    useGrouping = true,
  } = options;

  try {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits,
      minimumFractionDigits,
      useGrouping,
    }).format(number);
  } catch {
    return String(number);
  }
}

export function formatBytes(
  bytes,
  decimals = 1,
) {
  const value = Number(bytes);

  if (!Number.isFinite(value) || value < 0) {
    return "0 B";
  }

  if (value === 0) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB",
  ];

  const exponent = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );

  const amount = value / 1024 ** exponent;
  const precision =
    exponent === 0
      ? 0
      : Math.max(0, Math.trunc(decimals));

  return (
    amount.toFixed(precision) +
    " " +
    units[exponent]
  );
}

export function formatFPS(
  fps,
) {
  const value = Number(fps);

  if (!Number.isFinite(value)) {
    return "0 FPS";
  }

  return (
    Math.max(0, Math.round(value)) +
    " FPS"
  );
}

/* -------------------------------------------------------------------------- */
/* DOM helpers                                                                */
/* -------------------------------------------------------------------------- */

export function query(
  selector,
  root = document,
) {
  return root?.querySelector(selector) ?? null;
}

export function queryAll(
  selector,
  root = document,
) {
  return Array.from(
    root?.querySelectorAll(selector) ?? [],
  );
}

export function createElement(
  tagName,
  options = {},
) {
  if (
    typeof document === "undefined"
  ) {
    throw new Error(
      "createElement() membutuhkan document.",
    );
  }

  const element = document.createElement(
    tagName,
  );

  const {
    className,
    id,
    text,
    html,
    attributes = {},
    dataset = {},
  } = options;

  if (className) {
    element.className = className;
  }

  if (id) {
    element.id = id;
  }

  if (text !== undefined) {
    element.textContent = String(text);
  }

  if (html !== undefined) {
    element.innerHTML = String(html);
  }

  for (const [name, value] of Object.entries(
    attributes,
  )) {
    if (value === null || value === undefined) {
      continue;
    }

    element.setAttribute(
      name,
      String(value),
    );
  }

  for (const [name, value] of Object.entries(
    dataset,
  )) {
    element.dataset[name] = String(value);
  }

  return element;
}

export function toggleHidden(
  element,
  hidden,
) {
  if (!element) {
    return;
  }

  element.hidden = Boolean(hidden);
}

export function setDisabled(
  element,
  disabled,
) {
  if (!element) {
    return;
  }

  element.disabled = Boolean(disabled);
}

export function setPressed(
  element,
  pressed,
) {
  if (!element) {
    return;
  }

  element.setAttribute(
    "aria-pressed",
    String(Boolean(pressed)),
  );
}

export function dispatch(
  target,
  eventName,
  detail,
) {
  if (!target || typeof target.dispatchEvent !== "function") {
    return false;
  }

  target.dispatchEvent(
    new CustomEvent(eventName, {
      bubbles: false,
      detail,
    }),
  );

  return true;
}

/* -------------------------------------------------------------------------- */
/* Browser capability helpers                                                 */
/* -------------------------------------------------------------------------- */

export function prefersReducedMotion() {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }

  return window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
}

export function isTouchDevice() {
  if (
    typeof navigator === "undefined"
  ) {
    return false;
  }

  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0
  );
}

export function isCoarsePointer() {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }

  return window.matchMedia(
    "(pointer: coarse)",
  ).matches;
}

export function getViewportSize() {
  if (
    typeof window === "undefined"
  ) {
    return {
      width: 0,
      height: 0,
      dpr: 1,
    };
  }

  return {
    width: Math.max(
      0,
      window.innerWidth,
    ),
    height: Math.max(
      0,
      window.innerHeight,
    ),
    dpr: clamp(
      window.devicePixelRatio || 1,
      1,
      4,
    ),
  };
}

export function getHardwareProfile() {
  if (
    typeof navigator === "undefined"
  ) {
    return {
      hardwareConcurrency: null,
      deviceMemory: null,
      touchCapable: false,
      coarsePointer: false,
    };
  }

  const cores = Number(
    navigator.hardwareConcurrency,
  );

  const memory = Number(
    navigator.deviceMemory,
  );

  return {
    hardwareConcurrency:
      Number.isFinite(cores) && cores > 0
        ? cores
        : null,

    deviceMemory:
      Number.isFinite(memory) && memory > 0
        ? memory
        : null,

    touchCapable: isTouchDevice(),
    coarsePointer: isCoarsePointer(),
  };
}

/* -------------------------------------------------------------------------- */
/* Event timing                                                               */
/* -------------------------------------------------------------------------- */

export function debounce(
  callback,
  delay = 100,
) {
  if (!isFunction(callback)) {
    throw new TypeError(
      "debounce() membutuhkan callback function.",
    );
  }

  let timeoutId = null;

  const debounced = (...args) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      callback(...args);
    }, Math.max(0, Number(delay) || 0));
  };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  debounced.flush = () => {
    if (timeoutId === null) {
      return;
    }

    clearTimeout(timeoutId);
    timeoutId = null;
    callback();
  };

  return debounced;
}

export function throttle(
  callback,
  interval = 100,
) {
  if (!isFunction(callback)) {
    throw new TypeError(
      "throttle() membutuhkan callback function.",
    );
  }

  let lastExecution = 0;
  let timeoutId = null;
  let lastArgs = null;

  const run = (...args) => {
    const now = performance.now();
    const wait = Math.max(
      0,
      Number(interval) || 0,
    );

    lastArgs = args;

    if (now - lastExecution >= wait) {
      lastExecution = now;
      callback(...args);
      lastArgs = null;
      return;
    }

    if (timeoutId !== null) {
      return;
    }

    timeoutId = setTimeout(() => {
      timeoutId = null;
      lastExecution = performance.now();

      const pendingArgs = lastArgs;
      lastArgs = null;

      callback(...pendingArgs);
    }, wait - (now - lastExecution));
  };

  run.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    lastArgs = null;
  };

  return run;
}

/* -------------------------------------------------------------------------- */
/* Async helpers                                                              */
/* -------------------------------------------------------------------------- */

export function nextFrame() {
  return new Promise((resolve) => {
    if (
      typeof requestAnimationFrame ===
      "function"
    ) {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

export function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(
      resolve,
      Math.max(
        0,
        Number(milliseconds) || 0,
      ),
    );
  });
}

/* -------------------------------------------------------------------------- */
/* Data helpers                                                               */
/* -------------------------------------------------------------------------- */

export function shallowEqual(
  first,
  second,
) {
  if (Object.is(first, second)) {
    return true;
  }

  if (
    !isObject(first) ||
    !isObject(second)
  ) {
    return false;
  }

  const firstKeys = Object.keys(first);
  const secondKeys = Object.keys(second);

  if (firstKeys.length !== secondKeys.length) {
    return false;
  }

  return firstKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(
      second,
      key,
    ) &&
    Object.is(first[key], second[key]),
  );
}

export function deepClone(value) {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Fall through to the JSON-safe clone below.
    }
  }

  if (!isObject(value)) {
    return value;
  }

  try {
    return JSON.parse(
      JSON.stringify(value),
    );
  } catch {
    return value;
  }
}

export function omit(
  object,
  keys = [],
) {
  if (!isObject(object)) {
    return {};
  }

  const excluded = new Set(
    Array.isArray(keys) ? keys : [keys],
  );

  return Object.fromEntries(
    Object.entries(object).filter(
      ([key]) => !excluded.has(key),
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Error helpers                                                              */
/* -------------------------------------------------------------------------- */

export function toError(
  value,
  fallbackMessage = "Terjadi kesalahan.",
) {
  if (value instanceof Error) {
    return value;
  }

  if (
    value &&
    typeof value.message === "string"
  ) {
    return new Error(value.message);
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    return new Error(value);
  }

  return new Error(fallbackMessage);
}

export function safeCall(
  callback,
  fallback = undefined,
  ...args
) {
  if (!isFunction(callback)) {
    return fallback;
  }

  try {
    return callback(...args);
  } catch (error) {
    console.error(error);
    return fallback;
  }
}
