/**
 * NeuroBridge Middleware: Input Validator & Sanitizer
 */
const { maxTextLength } = require('../config');

function requiredText(value, maxLength = maxTextLength) {
  if (typeof value !== 'string' || !value.trim()) {
    const error = new Error('Text input is required.');
    error.status = 400;
    throw error;
  }
  return value.replace(/\u0000/g, '').trim().slice(0, maxLength);
}

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function validateInputMiddleware(field, maxLen) {
  return (req, _res, next) => {
    try {
      if (req.body[field]) {
        req.body[field] = requiredText(req.body[field], maxLen);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  requiredText,
  clampInteger,
  validateInputMiddleware
};
