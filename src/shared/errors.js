// An error that can be shown in the user's language: `code` is a key in
// src/i18n/*.json, `params` fills in its {placeholders}. `message` stays
// English for logs and tests.
export class CodedError extends Error {
  constructor(code, params, message) {
    super(message);
    this.code = code;
    this.params = params || {};
  }
}

// → { error, errorCode, errorParams } for messages/state.
export function describeError(error) {
  if (error && error.code) return { error: error.message, errorCode: error.code, errorParams: error.params };
  if (error instanceof TypeError) {
    // fetch() network failure ("Failed to fetch", "NetworkError when …")
    return { error: error.message, errorCode: "errNetwork", errorParams: {} };
  }
  return { error: error && error.message ? error.message : String(error), errorCode: null, errorParams: {} };
}
