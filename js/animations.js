/*
 * 3D Kakulator — Animation Controller
 *
 * Responsibilities:
 * - Coordinate JavaScript-driven UI animations.
 * - Respect prefers-reduced-motion.
 * - Provide lifecycle-safe helpers for temporary animation classes.
 * - Provide staggered entrance helpers for dynamic UI.
 * - Provide Web Animations API helpers for effects that need runtime control.
 *
 * CSS keyframes remain in css/animations.css.
 * Three.js object animation remains in three-scene.js until the scene
 * controller is refactored to consume this module.
 */

const DEFAULT_DURATION = 220;
const DEFAULT_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

export class AnimationController {
  constructor(options = {}) {
    this.root = options.root ?? document;
    this.reducedMotion =
      options.reducedMotion ??
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.activeAnimations = new Set();
    this.cleanupCallbacks = new Set();
  }

  /**
   * Refresh the reduced-motion preference.
   * Returns the current preference.
   */
  refreshMotionPreference() {
    this.reducedMotion = window
      .matchMedia("(prefers-reduced-motion: reduce)")
      .matches;

    return this.reducedMotion;
  }

  /**
   * Run a CSS animation class once and automatically remove it.
   */
  playClass(element, className, options = {}) {
    if (!(element instanceof Element) || !className) {
      return Promise.resolve(false);
    }

    const {
      force = false,
      removeOnFinish = true,
    } = options;

    if (this.reducedMotion && !force) {
      if (removeOnFinish) {
        element.classList.remove(className);
      }

      return Promise.resolve(false);
    }

    if (removeOnFinish) {
      element.classList.remove(className);
      void element.offsetWidth;
    }

    element.classList.add(className);

    return new Promise((resolve) => {
      const finish = () => {
        element.removeEventListener("animationend", finish);
        element.removeEventListener("animationcancel", finish);

        if (removeOnFinish) {
          element.classList.remove(className);
        }

        resolve(true);
      };

      element.addEventListener("animationend", finish, {
        once: true,
      });

      element.addEventListener("animationcancel", finish, {
        once: true,
      });

      this.cleanupCallbacks.add(() => {
        element.removeEventListener("animationend", finish);
        element.removeEventListener("animationcancel", finish);

        if (removeOnFinish) {
          element.classList.remove(className);
        }
      });
    });
  }

  /**
   * Apply temporary pressed feedback to a control.
   */
  press(element, className = "is-pressed") {
    return this.playClass(element, className);
  }

  /**
   * Animate a collection with a CSS stagger variable.
   *
   * Example:
   *   animation.stagger(items, { baseDelay: 40, step: 35 });
   */
  stagger(elements, options = {}) {
    const items = Array.from(elements ?? []).filter(
      (element) => element instanceof Element,
    );

    if (!items.length) {
      return;
    }

    const {
      baseDelay = 0,
      step = 35,
      animationClass = "animate-rise-in",
    } = options;

    items.forEach((element, index) => {
      element.style.animationDelay =
        `${Math.max(0, baseDelay + index * step)}ms`;

      if (this.reducedMotion) {
        element.classList.remove(animationClass);
        return;
      }

      element.classList.remove(animationClass);
      void element.offsetWidth;
      element.classList.add(animationClass);
    });
  }

  /**
   * Add a runtime transition using the Web Animations API.
   * Useful when the animation values are generated dynamically.
   */
  animate(
    element,
    keyframes,
    options = {},
  ) {
    if (!(element instanceof Element)) {
      return Promise.resolve(null);
    }

    if (this.reducedMotion && !options.force) {
      return Promise.resolve(null);
    }

    const animation = element.animate(keyframes, {
      duration: options.duration ?? DEFAULT_DURATION,
      easing: options.easing ?? DEFAULT_EASING,
      fill: options.fill ?? "both",
      iterations: options.iterations ?? 1,
      direction: options.direction ?? "normal",
      delay: options.delay ?? 0,
    });

    this.activeAnimations.add(animation);

    const cleanup = () => {
      this.activeAnimations.delete(animation);
    };

    animation.addEventListener("finish", cleanup, {
      once: true,
    });

    animation.addEventListener("cancel", cleanup, {
      once: true,
    });

    return animation.finished
      .then(() => animation)
      .catch(() => null);
  }

  /**
   * Convenience helper for a small numeric/display update.
   * The DOM value itself should be updated by the caller; this only
   * supplies visual feedback.
   */
  flash(element, options = {}) {
    if (!(element instanceof Element) || this.reducedMotion) {
      return Promise.resolve(false);
    }

    return this.animate(
      element,
      [
        {
          transform: "scale(1)",
          filter: "brightness(1)",
        },
        {
          transform: "scale(1.018)",
          filter: "brightness(1.1)",
        },
        {
          transform: "scale(1)",
          filter: "brightness(1)",
        },
      ],
      {
        duration: options.duration ?? 180,
        easing: options.easing ?? DEFAULT_EASING,
      },
    ).then(Boolean);
  }

  /**
   * Fade an element in without forcing layout changes.
   */
  enter(element, options = {}) {
    if (!(element instanceof Element)) {
      return Promise.resolve(null);
    }

    if (this.reducedMotion && !options.force) {
      element.style.opacity = "";
      element.style.transform = "";
      return Promise.resolve(null);
    }

    const distance = options.distance ?? 12;

    return this.animate(
      element,
      [
        {
          opacity: 0,
          transform: `translate3d(0, ${distance}px, 0)`,
        },
        {
          opacity: 1,
          transform: "translate3d(0, 0, 0)",
        },
      ],
      {
        duration: options.duration ?? 360,
        easing: options.easing ?? DEFAULT_EASING,
      },
    );
  }

  /**
   * Fade an element out. The caller decides whether to hide/remove it.
   */
  exit(element, options = {}) {
    if (!(element instanceof Element)) {
      return Promise.resolve(null);
    }

    if (this.reducedMotion && !options.force) {
      return Promise.resolve(null);
    }

    const distance = options.distance ?? 8;

    return this.animate(
      element,
      [
        {
          opacity: 1,
          transform: "translate3d(0, 0, 0)",
        },
        {
          opacity: 0,
          transform: `translate3d(0, ${distance}px, 0)`,
        },
      ],
      {
        duration: options.duration ?? 180,
        easing: "cubic-bezier(0.4, 0, 1, 1)",
      },
    );
  }

  /**
   * Cancel runtime animations created by this controller.
   */
  cancelAll() {
    for (const animation of this.activeAnimations) {
      try {
        animation.cancel();
      } catch {
        // The animation may already be finished/cancelled.
      }
    }

    this.activeAnimations.clear();

    for (const cleanup of this.cleanupCallbacks) {
      try {
        cleanup();
      } catch {
        // Cleanup should never break application shutdown.
      }
    }

    this.cleanupCallbacks.clear();
  }

  destroy() {
    this.cancelAll();
  }
}

/**
 * Create a controller using the application document.
 */
export function createAnimationController(options = {}) {
  return new AnimationController(options);
}

/**
 * Check whether meaningful motion is currently allowed.
 */
export function motionAllowed() {
  return !window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
}

/**
 * Force a CSS animation to restart reliably.
 */
export function restartAnimation(element, className) {
  if (!(element instanceof Element) || !className) {
    return false;
  }

  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);

  return true;
}

/**
 * Mark an element as a stagger participant without coupling it
 * to a specific component implementation.
 */
export function setStaggerIndex(element, index) {
  if (!(element instanceof Element)) {
    return;
  }

  const normalizedIndex = Math.max(
    0,
    Math.trunc(Number(index) || 0),
  );

  element.dataset.staggerItem = String(normalizedIndex);
}
