/*
 * 3D Kakulator — Settings Manager
 *
 * Responsibilities:
 * - Own persistent application preferences.
 * - Normalize and validate setting values.
 * - Provide reactive updates to UI / 3D services.
 * - Detect reduced-motion and coarse-pointer environments.
 * - Derive sensible 3D quality defaults from the current device.
 *
 * Persistence:
 * localStorage is treated as optional. Private browsing, blocked storage,
 * or browser policies must not prevent the application from running.
 */

const STORAGE_KEY = "3d-kakulator:settings:v1";

export const SETTINGS_DEFAULTS = Object.freeze({
  sceneEnabled: true,
  fpsEnabled: true,

  quality: "auto",
  pixelRatio: "auto",
  shadows: "auto",
  particles: "auto",

  reducedMotion: "auto",
  autoPauseWhenHidden: true,

  cameraDamping: true,
  cameraZoom: true,

  persistSettings: true,
});

const QUALITY_PRESETS = Object.freeze({
  low: Object.freeze({
    pixelRatio: 1,
    shadows: false,
    particles: 35,
  }),

  medium: Object.freeze({
    pixelRatio: 1.5,
    shadows: true,
    particles: 70,
  }),

  high: Object.freeze({
    pixelRatio: 2,
    shadows: true,
    particles: 120,
  }),
});

export const SettingsKey = Object.freeze({
  SCENE_ENABLED: "sceneEnabled",
  FPS_ENABLED: "fpsEnabled",
  QUALITY: "quality",
  PIXEL_RATIO: "pixelRatio",
  SHADOWS: "shadows",
  PARTICLES: "particles",
  REDUCED_MOTION: "reducedMotion",
  AUTO_PAUSE_HIDDEN: "autoPauseWhenHidden",
  CAMERA_DAMPING: "cameraDamping",
  CAMERA_ZOOM: "cameraZoom",
  PERSIST_SETTINGS: "persistSettings",
});

export class SettingsManager {
  constructor(options = {}) {
    this.storageKey = options.storageKey ?? STORAGE_KEY;
    this.listeners = new Set();

    this.environment = {
      reducedMotionMedia: null,
      coarsePointer: false,
      touchCapable: false,
      hardwareConcurrency: getHardwareConcurrency(),
      deviceMemory: getDeviceMemory(),
    };

    this.state = {
      ...SETTINGS_DEFAULTS,
      ...this.load(),
    };

    this.refreshEnvironment();
  }

  /**
   * Return a defensive copy of the current settings.
   */
  get() {
    return {
      ...this.state,
    };
  }

  /**
   * Return a resolved rendering profile. "auto" values are converted to
   * concrete runtime values using device capabilities and user preferences.
   */
  getRuntimeProfile() {
    const quality = resolveQuality(
      this.state.quality,
      this.environment,
    );

    const preset = QUALITY_PRESETS[quality];

    return {
      quality,

      sceneEnabled: Boolean(this.state.sceneEnabled),
      fpsEnabled: Boolean(this.state.fpsEnabled),

      pixelRatio: resolvePixelRatio(
        this.state.pixelRatio,
        preset,
        this.environment,
      ),

      shadows: resolveBooleanSetting(
        this.state.shadows,
        preset.shadows,
      ),

      particles: resolveParticles(
        this.state.particles,
        preset,
      ),

      reducedMotion: resolveReducedMotion(
        this.state.reducedMotion,
        this.environment,
      ),

      autoPauseWhenHidden:
        Boolean(this.state.autoPauseWhenHidden),

      cameraDamping:
        Boolean(this.state.cameraDamping) &&
        !resolveReducedMotion(
          this.state.reducedMotion,
          this.environment,
        ),

      cameraZoom:
        Boolean(this.state.cameraZoom),

      coarsePointer:
        Boolean(this.environment.coarsePointer),

      hardwareConcurrency:
        this.environment.hardwareConcurrency,

      deviceMemory:
        this.environment.deviceMemory,
    };
  }

  /**
   * Subscribe to settings changes.
   */
  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Settings listener harus berupa function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Update one setting and notify subscribers.
   */
  set(key, value, options = {}) {
    if (!isKnownSetting(key)) {
      throw new Error(`Setting tidak dikenal: ${key}`);
    }

    const normalized = normalizeSetting(
      key,
      value,
      this.state[key],
    );

    if (Object.is(this.state[key], normalized)) {
      return this.get();
    }

    this.state[key] = normalized;

    if (
      options.persist !== false &&
      this.state.persistSettings
    ) {
      this.save();
    }

    this.emit({
      key,
      value: normalized,
      settings: this.get(),
      runtime: this.getRuntimeProfile(),
    });

    return this.get();
  }

  /**
   * Update several settings atomically.
   */
  setMany(values = {}, options = {}) {
    if (!values || typeof values !== "object") {
      return this.get();
    }

    const changes = [];

    for (const [key, value] of Object.entries(values)) {
      if (!isKnownSetting(key)) {
        continue;
      }

      const normalized = normalizeSetting(
        key,
        value,
        this.state[key],
      );

      if (!Object.is(this.state[key], normalized)) {
        this.state[key] = normalized;
        changes.push({
          key,
          value: normalized,
        });
      }
    }

    if (!changes.length) {
      return this.get();
    }

    if (
      options.persist !== false &&
      this.state.persistSettings
    ) {
      this.save();
    }

    this.emit({
      type: "batch",
      changes,
      settings: this.get(),
      runtime: this.getRuntimeProfile(),
    });

    return this.get();
  }

  /**
   * Restore all preferences to defaults.
   */
  reset(options = {}) {
    this.state = {
      ...SETTINGS_DEFAULTS,
    };

    if (options.persist !== false) {
      this.save();
    }

    this.emit({
      type: "reset",
      settings: this.get(),
      runtime: this.getRuntimeProfile(),
    });

    return this.get();
  }

  /**
   * Re-check media/device capabilities after orientation or browser changes.
   */
  refreshEnvironment() {
    const reducedMotionMedia = getReducedMotionMediaQuery();

    this.environment.reducedMotionMedia =
      reducedMotionMedia;

    this.environment.coarsePointer =
      window.matchMedia("(pointer: coarse)").matches;

    this.environment.touchCapable =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0;

    if (reducedMotionMedia) {
      const update = () => {
        this.refreshEnvironment();
        this.emit({
          type: "environment",
          settings: this.get(),
          runtime: this.getRuntimeProfile(),
        });
      };

      if (!this._reducedMotionListenerAttached) {
        if ("addEventListener" in reducedMotionMedia) {
          reducedMotionMedia.addEventListener(
            "change",
            update,
          );
        } else {
          reducedMotionMedia.addListener(update);
        }

        this._reducedMotionListenerAttached = true;
        this._reducedMotionListener = update;
      }
    }

    return this.getRuntimeProfile();
  }

  /**
   * Store current preferences. Storage failures are intentionally ignored.
   */
  save() {
    if (!storageAvailable()) {
      return false;
    }

    try {
      localStorage.setItem(
        this.storageKey,
        JSON.stringify(this.state),
      );

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Load saved preferences and validate every value.
   */
  load() {
    if (!storageAvailable()) {
      return {};
    }

    try {
      const raw = localStorage.getItem(
        this.storageKey,
      );

      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);

      if (!parsed || typeof parsed !== "object") {
        return {};
      }

      const result = {};

      for (const key of Object.keys(SETTINGS_DEFAULTS)) {
        if (Object.prototype.hasOwnProperty.call(parsed, key)) {
          result[key] = normalizeSetting(
            key,
            parsed[key],
            SETTINGS_DEFAULTS[key],
          );
        }
      }

      return result;
    } catch {
      return {};
    }
  }

  /**
   * Remove persisted settings without changing current in-memory values.
   */
  clearStorage() {
    if (!storageAvailable()) {
      return false;
    }

    try {
      localStorage.removeItem(this.storageKey);
      return true;
    } catch {
      return false;
    }
  }

  destroy() {
    const media = this.environment.reducedMotionMedia;

    if (
      media &&
      this._reducedMotionListenerAttached &&
      this._reducedMotionListener
    ) {
      if ("removeEventListener" in media) {
        media.removeEventListener(
          "change",
          this._reducedMotionListener,
        );
      } else {
        media.removeListener(
          this._reducedMotionListener,
        );
      }
    }

    this.listeners.clear();
    this._reducedMotionListenerAttached = false;
    this._reducedMotionListener = null;
  }

  emit(detail = {}) {
    const payload = {
      type: detail.type ?? "change",
      settings: detail.settings ?? this.get(),
      runtime: detail.runtime ?? this.getRuntimeProfile(),
      ...detail,
    };

    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch (error) {
        console.error(
          "Settings listener error:",
          error,
        );
      }
    }
  }
}

export function createSettingsManager(options = {}) {
  return new SettingsManager(options);
}

export function getQualityPresets() {
  return Object.fromEntries(
    Object.entries(QUALITY_PRESETS).map(
      ([name, preset]) => [name, { ...preset }],
    ),
  );
}

export function resolveQuality(
  requestedQuality,
  environment = {},
) {
  if (
    requestedQuality === "low" ||
    requestedQuality === "medium" ||
    requestedQuality === "high"
  ) {
    return requestedQuality;
  }

  const memory = Number(environment.deviceMemory);
  const cores = Number(environment.hardwareConcurrency);
  const coarse = Boolean(environment.coarsePointer);

  if (coarse) {
    return "medium";
  }

  if (
    Number.isFinite(memory) &&
    memory > 0 &&
    memory <= 2
  ) {
    return "low";
  }

  if (
    Number.isFinite(cores) &&
    cores > 0 &&
    cores <= 4
  ) {
    return "medium";
  }

  return "high";
}

export function resolvePixelRatio(
  requested,
  preset,
  environment = {},
) {
  if (requested !== "auto") {
    return clampNumber(
      requested,
      1,
      2.5,
      preset.pixelRatio,
    );
  }

  const devicePixelRatio = Number(
    globalThis.devicePixelRatio,
  );

  if (
    Boolean(environment.coarsePointer) ||
    resolveReducedMotion("auto", environment)
  ) {
    return Math.min(
      preset.pixelRatio,
      1.5,
    );
  }

  if (!Number.isFinite(devicePixelRatio)) {
    return preset.pixelRatio;
  }

  return Math.min(
    Math.max(1, devicePixelRatio),
    preset.pixelRatio,
  );
}

export function resolveBooleanSetting(
  requested,
  fallback,
) {
  if (typeof requested === "boolean") {
    return requested;
  }

  return Boolean(fallback);
}

export function resolveParticles(
  requested,
  preset,
) {
  if (requested === "auto") {
    return preset.particles;
  }

  return clampNumber(
    requested,
    0,
    500,
    preset.particles,
  );
}

export function resolveReducedMotion(
  requested,
  environment = {},
) {
  if (requested === true || requested === false) {
    return requested;
  }

  return Boolean(
    environment.reducedMotionMedia?.matches,
  );
}

function normalizeSetting(key, value, fallback) {
  switch (key) {
    case SettingsKey.SCENE_ENABLED:
    case SettingsKey.FPS_ENABLED:
    case SettingsKey.AUTO_PAUSE_HIDDEN:
    case SettingsKey.CAMERA_DAMPING:
    case SettingsKey.CAMERA_ZOOM:
    case SettingsKey.PERSIST_SETTINGS:
      return Boolean(value);

    case SettingsKey.QUALITY:
      return normalizeChoice(
        value,
        ["auto", "low", "medium", "high"],
        fallback,
      );

    case SettingsKey.PIXEL_RATIO:
      if (value === "auto") {
        return "auto";
      }

      return clampNumber(
        value,
        1,
        2.5,
        typeof fallback === "number"
          ? fallback
          : 1.5,
      );

    case SettingsKey.SHADOWS:
      if (
        value === "auto" ||
        typeof value === "boolean"
      ) {
        return value;
      }

      return fallback;

    case SettingsKey.PARTICLES:
      if (value === "auto") {
        return "auto";
      }

      return clampNumber(
        value,
        0,
        500,
        typeof fallback === "number"
          ? fallback
          : 70,
      );

    case SettingsKey.REDUCED_MOTION:
      if (
        value === "auto" ||
        typeof value === "boolean"
      ) {
        return value;
      }

      return fallback;

    default:
      return fallback;
  }
}

function normalizeChoice(
  value,
  choices,
  fallback,
) {
  return choices.includes(value)
    ? value
    : fallback;
}

function clampNumber(
  value,
  minimum,
  maximum,
  fallback,
) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(minimum, number),
  );
}

function isKnownSetting(key) {
  return Object.prototype.hasOwnProperty.call(
    SETTINGS_DEFAULTS,
    key,
  );
}

function getReducedMotionMediaQuery() {
  if (
    typeof window.matchMedia !== "function"
  ) {
    return null;
  }

  return window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );
}

function getHardwareConcurrency() {
  const value = Number(
    navigator.hardwareConcurrency,
  );

  return Number.isFinite(value) && value > 0
    ? value
    : null;
}

function getDeviceMemory() {
  const value = Number(
    navigator.deviceMemory,
  );

  return Number.isFinite(value) && value > 0
    ? value
    : null;
}

function storageAvailable() {
  try {
    const key = "__3d_kakulator_storage_test__";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
