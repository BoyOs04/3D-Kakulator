/*
 * 3D Kakulator — Calculator Engine
 * Purpose:
 * - Own calculator state and arithmetic evaluation.
 * - Provide a framework-agnostic API for UI and 3D controls.
 * - Avoid eval()/Function() by using a tokenizer + expression parser.
 * - Support decimals, parentheses, percentage and unary sign.
 *
 * UI rendering, DOM events and Three.js interactions stay outside this file.
 */

const DEFAULT_MAX_HISTORY = 50;
const NUMBER_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

const OPERATOR_PRECEDENCE = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
};

const OPERATOR_SET = new Set(Object.keys(OPERATOR_PRECEDENCE));

export const CalculatorAction = Object.freeze({
  CLEAR: "clear",
  DELETE: "delete",
  PERCENT: "percent",
  SIGN: "sign",
  EQUALS: "equals",
});

export class CalculatorEngine {
  constructor(options = {}) {
    this.maxHistory = clampHistorySize(options.maxHistory);
    this.listeners = new Set();

    this.state = {
      expression: "",
      result: "0",
      numericResult: 0,
      justEvaluated: false,
      error: null,
      history: [],
    };
  }

  /**
   * Subscribe to state changes.
   * Returns an unsubscribe function.
   */
  subscribe(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Calculator listener harus berupa function.");
    }

    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  getState() {
    return {
      expression: this.state.expression,
      result: this.state.result,
      numericResult: this.state.numericResult,
      justEvaluated: this.state.justEvaluated,
      error: this.state.error,
      history: this.state.history.map((item) => ({ ...item })),
    };
  }

  press(key) {
    if (!key || typeof key !== "object") {
      return this.getState();
    }

    if (key.action) {
      switch (key.action) {
        case CalculatorAction.CLEAR:
          return this.clear();

        case CalculatorAction.DELETE:
          return this.delete();

        case CalculatorAction.PERCENT:
          return this.percent();

        case CalculatorAction.SIGN:
          return this.toggleSign();

        case CalculatorAction.EQUALS:
          return this.calculate();

        default:
          return this.getState();
      }
    }

    if (typeof key.value === "string") {
      return this.input(key.value, key.type);
    }

    return this.getState();
  }

  input(value, type = inferInputType(value)) {
    if (typeof value !== "string" || !value) {
      return this.getState();
    }

    this.clearError();

    if (this.state.justEvaluated) {
      if (type === "number" || value === ".") {
        this.state.expression = "";
      }

      this.state.justEvaluated = false;
    }

    if (type === "operator") {
      this.inputOperator(value);
      this.emit();
      return this.getState();
    }

    if (value === ".") {
      this.inputDecimal();
      this.emit();
      return this.getState();
    }

    if (type === "number" || /^[0-9]$/.test(value)) {
      this.inputNumber(value);
      this.emit();
      return this.getState();
    }

    if (value === "(") {
      this.inputOpenParenthesis();
      this.emit();
      return this.getState();
    }

    if (value === ")") {
      this.inputCloseParenthesis();
      this.emit();
      return this.getState();
    }

    return this.getState();
  }

  clear() {
    this.state.expression = "";
    this.state.result = "0";
    this.state.numericResult = 0;
    this.state.justEvaluated = false;
    this.state.error = null;
    this.emit();
    return this.getState();
  }

  delete() {
    this.clearError();

    if (this.state.justEvaluated) {
      this.state.expression = "";
      this.state.result = "0";
      this.state.numericResult = 0;
      this.state.justEvaluated = false;
      this.emit();
      return this.getState();
    }

    this.state.expression = removeLastToken(this.state.expression);
    this.emit();
    return this.getState();
  }

  percent() {
    this.clearError();

    if (!this.state.expression) {
      return this.getState();
    }

    const expression = this.state.expression;

    if (expression.endsWith("%")) {
      return this.getState();
    }

    if (!/[0-9)]$/.test(expression)) {
      return this.getState();
    }

    this.state.expression += "%";
    this.state.justEvaluated = false;
    this.emit();

    return this.getState();
  }

  toggleSign() {
    this.clearError();

    if (!this.state.expression) {
      this.state.expression = "-";
      this.emit();
      return this.getState();
    }

    const range = findLastNumberRange(this.state.expression);

    if (!range) {
      if (this.state.expression.endsWith("(")) {
        this.state.expression += "-";
        this.emit();
      }
      return this.getState();
    }

    const before = this.state.expression.slice(0, range.start);
    const token = this.state.expression.slice(range.start, range.end);

    if (before.endsWith("-") && isUnaryMinus(before)) {
      this.state.expression =
        before.slice(0, -1) + token + this.state.expression.slice(range.end);
    } else {
      this.state.expression =
        before + "-" + token + this.state.expression.slice(range.end);
    }

    this.state.justEvaluated = false;
    this.emit();

    return this.getState();
  }

  calculate() {
    this.clearError();

    const expression = normalizeExpression(this.state.expression);

    if (!expression) {
      return this.getState();
    }

    try {
      const value = evaluate(expression);

      this.state.numericResult = value;
      this.state.result = formatNumber(value);
      this.state.justEvaluated = true;

      this.state.history.unshift({
        id: createHistoryId(),
        expression: this.state.expression,
        result: this.state.result,
        value,
        timestamp: new Date().toISOString(),
      });

      if (this.state.history.length > this.maxHistory) {
        this.state.history.length = this.maxHistory;
      }
    } catch (error) {
      this.state.error =
        error instanceof CalculatorError
          ? error.message
          : "Perhitungan tidak valid.";

      this.state.result = "Error";
      this.state.justEvaluated = true;
    }

    this.emit();

    return this.getState();
  }

  clearHistory() {
    this.state.history = [];
    this.emit();
    return this.getState();
  }

  recallHistory(index) {
    const item = this.state.history[index];

    if (!item) {
      return this.getState();
    }

    this.state.expression = String(item.value);
    this.state.result = item.result;
    this.state.numericResult = item.value;
    this.state.justEvaluated = true;
    this.clearError();
    this.emit();

    return this.getState();
  }

  handleKeyboardKey(key) {
    if (typeof key !== "string") {
      return this.getState();
    }

    if (/^[0-9]$/.test(key)) {
      return this.input(key, "number");
    }

    if (key === ".") {
      return this.input(key, "number");
    }

    if (OPERATOR_SET.has(key)) {
      return this.input(key, "operator");
    }

    switch (key) {
      case "Enter":
      case "=":
        return this.calculate();

      case "Backspace":
        return this.delete();

      case "Escape":
        return this.clear();

      case "%":
        return this.percent();

      default:
        return this.getState();
    }
  }

  destroy() {
    this.listeners.clear();
  }

  emit() {
    const snapshot = this.getState();

    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("Calculator listener error:", error);
      }
    }
  }

  clearError() {
    this.state.error = null;

    if (this.state.result === "Error") {
      this.state.result = "0";
    }
  }

  inputNumber(value) {
    const expression = this.state.expression;
    const last = expression.slice(-1);

    if (last === ")") {
      this.state.expression += "*" + value;
      return;
    }

    const range = findCurrentNumberRange(expression);

    if (range) {
      const current = expression.slice(range.start, range.end);

      if (current === "0") {
        const replacement =
          value === "0" ? "0" : value;

        this.state.expression =
          expression.slice(0, range.start) +
          replacement +
          expression.slice(range.end);

        return;
      }
    }

    this.state.expression += value;
  }

  inputDecimal() {
    const expression = this.state.expression;
    const last = expression.slice(-1);

    if (last === ")") {
      this.state.expression += "*0.";
      return;
    }

    if (!expression || /[+\-*/(]$/.test(expression)) {
      this.state.expression += "0.";
      return;
    }

    const range = findCurrentNumberRange(expression);

    if (range) {
      const current = expression.slice(range.start, range.end);

      if (current.includes(".")) {
        return;
      }

      this.state.expression += ".";
      return;
    }

    this.state.expression += "0.";
  }

  inputOperator(operator) {
    if (!OPERATOR_SET.has(operator)) {
      return;
    }

    let expression = this.state.expression;
    const last = expression.slice(-1);

    if (!expression) {
      if (operator === "-") {
        this.state.expression = "-";
      }
      return;
    }

    if (last === ".") {
      expression += "0";
    }

    if (/[+*/]$/.test(expression)) {
      expression = expression.slice(0, -1) + operator;
    } else if (expression.endsWith("-") && isUnaryMinus(expression)) {
      if (operator !== "-") {
        expression = expression.slice(0, -1) + operator;
      }
    } else if (last !== "(") {
      expression += operator;
    } else if (operator === "-") {
      expression += "-";
    } else {
      return;
    }

    this.state.expression = expression;
  }

  inputOpenParenthesis() {
    const expression = this.state.expression;
    const last = expression.slice(-1);

    if (!expression || /[+\-*/(]$/.test(last)) {
      this.state.expression += "(";
      return;
    }

    if (/[0-9)]$/.test(last)) {
      this.state.expression += "*(";
    }
  }

  inputCloseParenthesis() {
    const expression = this.state.expression;
    const last = expression.slice(-1);

    if (!expression || /[+\-*/(]$/.test(last)) {
      return;
    }

    if (countCharacter(expression, "(") <= countCharacter(expression, ")")) {
      return;
    }

    this.state.expression += ")";
  }
}

export class CalculatorError extends Error {
  constructor(message) {
    super(message);
    this.name = "CalculatorError";
  }
}

export function evaluate(expression) {
  const tokens = tokenize(expression);
  const parser = new ExpressionParser(tokens);

  const value = parser.parse();

  if (!Number.isFinite(value)) {
    throw new CalculatorError("Hasil berada di luar rentang angka yang valid.");
  }

  return cleanFloatingPoint(value);
}

export function normalizeExpression(expression) {
  if (typeof expression !== "string") {
    return "";
  }

  return expression
    .replace(/[×]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/,/g, ".")
    .replace(/\s+/g, "")
    .replace(/[^0-9+\-*/().%]/g, "");
}

export function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "Error";
  }

  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 12,
  }).format(cleanFloatingPoint(value));
}

function tokenize(expression) {
  const tokens = [];
  let index = 0;

  while (index < expression.length) {
    const character = expression[index];

    if (/\d|\./.test(character)) {
      const start = index;
      let decimalFound = false;

      while (index < expression.length) {
        const current = expression[index];

        if (/\d/.test(current)) {
          index += 1;
          continue;
        }

        if (current === ".") {
          if (decimalFound) {
            throw new CalculatorError("Angka memiliki lebih dari satu desimal.");
          }

          decimalFound = true;
          index += 1;
          continue;
        }

        break;
      }

      const value = expression.slice(start, index);

      if (!NUMBER_PATTERN.test(value)) {
        throw new CalculatorError("Format angka tidak valid.");
      }

      tokens.push({
        type: "number",
        value: Number(value),
      });

      continue;
    }

    if (OPERATOR_SET.has(character)) {
      tokens.push({
        type: "operator",
        value: character,
      });
      index += 1;
      continue;
    }

    if (character === "(" || character === ")") {
      tokens.push({
        type: character === "(" ? "open" : "close",
        value: character,
      });
      index += 1;
      continue;
    }

    if (character === "%") {
      tokens.push({
        type: "percent",
        value: character,
      });
      index += 1;
      continue;
    }

    throw new CalculatorError("Karakter ekspresi tidak didukung.");
  }

  return tokens;
}

class ExpressionParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.position = 0;
  }

  parse() {
    if (!this.tokens.length) {
      throw new CalculatorError("Ekspresi masih kosong.");
    }

    const result = this.parseExpression();

    if (this.position < this.tokens.length) {
      throw new CalculatorError("Ekspresi tidak lengkap.");
    }

    return result;
  }

  parseExpression() {
    let value = this.parseTerm();

    while (this.peekOperator("+") || this.peekOperator("-")) {
      const operator = this.consume().value;
      const right = this.parseTerm();

      value =
        operator === "+"
          ? value + right
          : value - right;
    }

    return value;
  }

  parseTerm() {
    let value = this.parseUnary();

    while (this.peekOperator("*") || this.peekOperator("/")) {
      const operator = this.consume().value;
      const right = this.parseUnary();

      if (operator === "/" && right === 0) {
        throw new CalculatorError("Tidak dapat membagi dengan nol.");
      }

      value =
        operator === "*"
          ? value * right
          : value / right;
    }

    return value;
  }

  parseUnary() {
    if (this.peekOperator("+")) {
      this.consume();
      return this.parseUnary();
    }

    if (this.peekOperator("-")) {
      this.consume();
      return -this.parseUnary();
    }

    let value = this.parsePrimary();

    while (this.peekType("percent")) {
      this.consume();
      value /= 100;
    }

    return value;
  }

  parsePrimary() {
    const token = this.peek();

    if (!token) {
      throw new CalculatorError("Operand belum lengkap.");
    }

    if (token.type === "number") {
      this.consume();
      return token.value;
    }

    if (token.type === "open") {
      this.consume();

      const value = this.parseExpression();

      if (!this.peekType("close")) {
        throw new CalculatorError("Kurung penutup belum lengkap.");
      }

      this.consume();
      return value;
    }

    throw new CalculatorError("Operand tidak valid.");
  }

  peek() {
    return this.tokens[this.position];
  }

  consume() {
    return this.tokens[this.position++];
  }

  peekType(type) {
    return this.peek()?.type === type;
  }

  peekOperator(operator) {
    return (
      this.peek()?.type === "operator" &&
      this.peek()?.value === operator
    );
  }
}

function inferInputType(value) {
  if (OPERATOR_SET.has(value)) {
    return "operator";
  }

  if (/^[0-9.]$/.test(value)) {
    return "number";
  }

  return "unknown";
}

function removeLastToken(expression) {
  if (!expression) {
    return "";
  }

  if (expression.endsWith("%")) {
    return expression.slice(0, -1);
  }

  if (expression.endsWith(")")) {
    return expression.slice(0, -1);
  }

  if (/[+\-*/]$/.test(expression)) {
    return expression.slice(0, -1);
  }

  const range = findLastNumberRange(expression);

  if (range) {
    return expression.slice(0, range.end - 1) +
      expression.slice(range.end);
  }

  return expression.slice(0, -1);
}

function findCurrentNumberRange(expression) {
  let end = expression.length;

  if (end === 0 || !/[0-9.]$/.test(expression[end - 1])) {
    return null;
  }

  let start = end;

  while (start > 0 && /[0-9.]/.test(expression[start - 1])) {
    start -= 1;
  }

  return {
    start,
    end,
  };
}

function findLastNumberRange(expression) {
  let end = expression.length;

  while (end > 0 && !/[0-9.]$/.test(expression[end - 1])) {
    end -= 1;
  }

  if (end === 0) {
    return null;
  }

  let start = end;

  while (start > 0 && /[0-9.]/.test(expression[start - 1])) {
    start -= 1;
  }

  if (start > 0 && expression[start - 1] === "-" && isUnaryMinus(expression.slice(0, start))) {
    start -= 1;
  }

  return {
    start,
    end,
  };
}

function isUnaryMinus(expression) {
  if (!expression.endsWith("-")) {
    return false;
  }

  if (expression.length === 1) {
    return true;
  }

  return /[+\-*/(]$/.test(expression.slice(0, -1));
}

function countCharacter(text, character) {
  return [...text].filter((item) => item === character).length;
}

function cleanFloatingPoint(value) {
  if (Object.is(value, -0)) {
    return 0;
  }

  return Number.parseFloat(value.toPrecision(15));
}

function createHistoryId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `history-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function clampHistorySize(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_HISTORY;
  }

  return Math.min(
    100,
    Math.max(1, Math.trunc(parsed)),
  );
}
