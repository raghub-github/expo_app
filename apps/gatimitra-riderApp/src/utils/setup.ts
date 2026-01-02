/**
 * App setup - runs before everything else
 * This file must be imported FIRST in the app entry point
 */

// #region agent log
fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'setup.ts:8',message:'Setup file loading started',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion

// Install global error suppression immediately
import { installErrorSuppression } from './errorSuppression';

// #region agent log
fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'setup.ts:15',message:'About to install error suppression',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion

try {
  installErrorSuppression();
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'setup.ts:20',message:'Error suppression installed successfully',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
} catch (error) {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'setup.ts:23',message:'Error suppression installation failed',data:{error:String(error),timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  throw error;
}

// Export a flag to indicate setup is complete
export const appSetupComplete = true;

// #region agent log
fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'setup.ts:31',message:'Setup file loaded successfully',data:{appSetupComplete,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion


