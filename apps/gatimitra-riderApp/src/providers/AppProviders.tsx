import React, { useEffect, useMemo } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { View, Text, ActivityIndicator } from "react-native";
import { initI18n } from "../i18n";
import { useSessionStore } from "../stores/sessionStore";
import { usePermissionStore } from "../stores/permissionStore";
import { useDutyStore } from "../stores/dutyStore";
import { useOnboardingStore } from "../stores/onboardingStore";
import { useLanguageStore } from "../stores/languageStore";
import { colors } from "../theme";

export function AppProviders({ children }: { children: React.ReactNode }) {
  console.log('[AppProviders] Rendering');
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppProviders.tsx:12',message:'AppProviders component rendering',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion

  let i18n;
  let queryClient;
  
  try {
    i18n = useMemo(() => {
      console.log('[AppProviders] Initializing i18n');
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppProviders.tsx:20',message:'About to initialize i18n',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      try {
        const result = initI18n();
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppProviders.tsx:24',message:'i18n initialized successfully',data:{isInitialized:result?.isInitialized,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        return result;
      } catch (i18nError) {
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppProviders.tsx:28',message:'i18n initialization failed',data:{error:String(i18nError),errorStack:i18nError?.stack,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        throw i18nError;
      }
    }, []);
    
    queryClient = useMemo(
      () => {
        console.log('[AppProviders] Creating QueryClient');
        // #region agent log
        fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppProviders.tsx:36',message:'About to create QueryClient',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        try {
          const client = new QueryClient({
            defaultOptions: {
              queries: {
                retry: 2,
                staleTime: 15_000,
                refetchOnWindowFocus: false,
                refetchOnReconnect: true,
              },
              mutations: {
                retry: 1,
              },
            },
          });
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppProviders.tsx:50',message:'QueryClient created successfully',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          return client;
        } catch (queryError) {
          // #region agent log
          fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppProviders.tsx:54',message:'QueryClient creation failed',data:{error:String(queryError),errorStack:queryError?.stack,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
          // #endregion
          throw queryError;
        }
      },
      [],
    );
  } catch (error) {
    console.error('[AppProviders] Error initializing providers:', error);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppProviders.tsx:62',message:'Provider initialization error caught',data:{error:String(error),errorStack:error?.stack,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.light }}>
        <Text style={{ color: colors.error[500] }}>Provider Error</Text>
        <Text style={{ color: colors.text.primary.light, marginTop: 8 }}>Please restart the app</Text>
      </View>
    );
  }

      const hydrateSession = useSessionStore((s) => s.hydrate);
      const hydratePermissions = usePermissionStore((s) => s.hydrate);
      const hydrateDuty = useDutyStore((s) => s.hydrate);
      const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
      const hydrateLanguage = useLanguageStore((s) => s.hydrate);

      useEffect(() => {
        console.log('[AppProviders] Starting store hydration');
        // Hydrate all stores in parallel with error handling
        Promise.allSettled([
          hydrateSession().catch((err) => {
            console.warn('[AppProviders] Session hydration failed:', err);
          }),
          hydratePermissions().catch((err) => {
            console.warn('[AppProviders] Permission hydration failed:', err);
          }),
          hydrateDuty().catch((err) => {
            console.warn('[AppProviders] Duty hydration failed:', err);
          }),
          hydrateOnboarding().catch((err) => {
            console.warn('[AppProviders] Onboarding hydration failed:', err);
          }),
          hydrateLanguage().catch((err) => {
            console.warn('[AppProviders] Language hydration failed:', err);
          }),
        ]).then((results) => {
          console.log('[AppProviders] Store hydration complete', results.map(r => r.status));
        }).catch((err) => {
          console.error('[AppProviders] Store hydration error:', err);
        });
      }, [hydrateSession, hydratePermissions, hydrateDuty, hydrateOnboarding, hydrateLanguage]);

  console.log('[AppProviders] Rendering providers');
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppProviders.tsx:80',message:'About to render provider JSX',data:{hasI18n:!!i18n,hasQueryClient:!!queryClient,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion

  try {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppProviders.tsx:84',message:'Rendering provider JSX',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    return (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </I18nextProvider>
    );
  } catch (error) {
    console.error('[AppProviders] Error rendering providers:', error);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'AppProviders.tsx:92',message:'Error rendering provider JSX',data:{error:String(error),errorStack:error?.stack,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.light }}>
        <Text style={{ color: colors.error[500] }}>Render Error</Text>
        <Text style={{ color: colors.text.primary.light, marginTop: 8 }}>Please restart the app</Text>
      </View>
    );
  }
}
