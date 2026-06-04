/**
 * App setup - runs before everything else.
 * This file must be imported FIRST in the app entry point.
 */

import { installErrorSuppression } from './errorSuppression';

try {
  installErrorSuppression();
} catch (error) {
  throw error;
}

export const appSetupComplete = true;
