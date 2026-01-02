import { Redirect } from "expo-router";
import { usePermissionStore } from "@/src/stores/permissionStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useLanguageStore } from "@/src/stores/languageStore";
import { View, ActivityIndicator, Text } from "react-native";
import { colors } from "@/src/theme";
import { useEffect } from "react";

export default function Index() {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.tsx:9',message:'Index component rendering',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  const hydrated = usePermissionStore((s) => s.hydrated);
  const hasRequestedPermissions = usePermissionStore((s) => s.hasRequestedPermissions);
  const session = useSessionStore((s) => s.session);
  const languageSelected = useLanguageStore((s) => s.languageSelected);

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.tsx:15',message:'Index component state',data:{hydrated,hasRequestedPermissions,hasSession:!!session,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  useEffect(() => {
    console.log('[Index] State:', { hydrated, hasRequestedPermissions, hasSession: !!session });
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.tsx:20',message:'Index useEffect triggered',data:{hydrated,hasRequestedPermissions,hasSession:!!session,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
  }, [hydrated, hasRequestedPermissions, session]);

  // Show loading while permission store hydrates
  if (!hydrated) {
    console.log('[Index] Showing loading screen');
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.tsx:24',message:'Index showing loading screen',data:{hydrated,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background.light }}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
        <Text style={{ marginTop: 16, color: colors.text.primary.light }}>Loading...</Text>
      </View>
    );
  }

  // If user is already logged in, go to orders
  if (session) {
    console.log('[Index] User logged in, redirecting to orders');
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.tsx:34',message:'Index redirecting to orders',data:{hasSession:!!session,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    return <Redirect href="/(tabs)/orders" />;
  }

  // NEW FLOW: Language selection first
  if (!languageSelected) {
    console.log('[Index] Language not selected, redirecting to language selection');
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.tsx:40',message:'Index redirecting to language',data:{languageSelected,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    return <Redirect href="/(onboarding)/language" />;
  }

  // Then permissions flow
  if (!hasRequestedPermissions) {
    console.log('[Index] Permissions not requested, redirecting to permissions');
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.tsx:47',message:'Index redirecting to permissions',data:{hasRequestedPermissions,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    return <Redirect href="/(permissions)/request" />;
  }

  // Otherwise, go to auth/login
  console.log('[Index] Redirecting to login');
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'index.tsx:54',message:'Index redirecting to login',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
  // #endregion
  return <Redirect href="/(auth)/login" />;
}
