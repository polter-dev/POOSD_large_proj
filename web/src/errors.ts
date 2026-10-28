import { ApiError } from './api';

// The API's error messages are written for users, so show them as-is (design spec, Error banner).
// Only a failed fetch (status 0) gets its own wording.
export function errorMessage(err: unknown) {
  if (err instanceof ApiError && err.status !== 0) return err.message;
  return "Can't reach the server. Check your connection and try again.";
}
