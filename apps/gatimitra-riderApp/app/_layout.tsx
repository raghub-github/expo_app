// IMPORTANT: Setup must run FIRST - installs error suppression before any other imports
import '@/src/utils/setup';

import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import 'react-native-reanimated';
// CSS imports are not supported in React Native - only for web
// import '../global.css';

import { useColorScheme } from '@/components/useColorScheme';
import { AppProviders } from '@/src/providers/AppProviders';
import { usePermissionStore } from '@/src/stores/permissionStore';
import { useSessionStore } from '@/src/stores/sessionStore';
import { colors } from '@/src/theme';
import { Platform } from 'react-native';

// Initialize Mapbox early for faster map loading
if (Platform.OS !== 'web') {
  try {
    // Use dynamic import to ensure proper module resolution
    import('@/src/services/maps/mapbox').then((mapboxModule) => {
      mapboxModule.initializeMapbox();
      console.log('[RootLayout] Mapbox initialized early');
    }).catch((error) => {
      console.warn('[RootLayout] Failed to initialize Mapbox early:', error);
    });
  } catch (error) {
    console.warn('[RootLayout] Failed to load Mapbox module:', error);
  }
}

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_layout.tsx:29',message:'RootLayout component rendering',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion

  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_layout.tsx:35',message:'Font loading state',data:{loaded,hasError:!!error,errorMessage:error?.message,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion

  useEffect(() => {
    if (error) {
      console.warn('[RootLayout] Font loading error:', error);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_layout.tsx:40',message:'Font loading error detected',data:{error:String(error),timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      // Don't throw - continue anyway
    }
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(() => {
        // Ignore splash screen errors
      });
    }
  }, [loaded]);

  // Always show something, even if fonts aren't loaded
  if (!loaded) {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_layout.tsx:52',message:'Showing font loading screen',data:{loaded,hasError:!!error,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
        <Text style={{ marginTop: 16, color: '#000000' }}>Loading fonts...</Text>
      </View>
    );
  }

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_layout.tsx:61',message:'Fonts loaded, rendering RootLayoutNav',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion

  try {
    return <RootLayoutNav />;
  } catch (renderError) {
    console.warn('[RootLayout] Error rendering RootLayoutNav:', renderError);
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <Text style={{ color: '#000000', fontSize: 16 }}>Render Error</Text>
        <Text style={{ color: '#666666', marginTop: 8 }}>{String(renderError)}</Text>
      </View>
    );
  }
}

function RootLayoutNav() {
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_layout.tsx:65',message:'RootLayoutNav component rendering',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion

  const colorScheme = useColorScheme();
  const permissionHydrated = usePermissionStore((s) => s.hydrated);
  const hydratePermissions = usePermissionStore((s) => s.hydrate);
  const hydrateSession = useSessionStore((s) => s.hydrate);
  const [isInitializing, setIsInitializing] = useState(true);

  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_layout.tsx:72',message:'RootLayoutNav initial state',data:{permissionHydrated,isInitializing,colorScheme,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion

  // Hydrate stores immediately on mount
  useEffect(() => {
    console.log('[RootLayoutNav] Starting hydration...');
    void hydratePermissions();
    void hydrateSession();
  }, [hydratePermissions, hydrateSession]);

  // Initialize - set to false immediately if already hydrated, otherwise wait
  useEffect(() => {
    if (permissionHydrated) {
      console.log('[RootLayoutNav] Already hydrated, setting isInitializing to false');
      setIsInitializing(false);
      return;
    }

    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    // Set a timeout to force initialization after 500ms max
    timeoutId = setTimeout(() => {
      console.warn('[RootLayoutNav] Initialization timeout - proceeding anyway');
      if (mounted) {
        setIsInitializing(false);
      }
    }, 500);

    // Also check periodically if hydration completed
    const checkInterval = setInterval(() => {
      if (permissionHydrated && mounted) {
        console.log('[RootLayoutNav] Hydration detected, setting isInitializing to false');
        setIsInitializing(false);
        clearInterval(checkInterval);
        clearTimeout(timeoutId);
      }
    }, 50);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
      clearInterval(checkInterval);
    };
  }, [permissionHydrated]);

  // Show loading screen while initializing - but with very short timeout
  if (!permissionHydrated || isInitializing) {
    console.log('[RootLayoutNav] Showing loading screen', { permissionHydrated, isInitializing });
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_layout.tsx:130',message:'Showing initialization loading screen',data:{permissionHydrated,isInitializing,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color={colors.primary[500]} />
        <Text style={{ marginTop: 16, color: '#000000' }}>Initializing...</Text>
      </View>
    );
  }

  console.log('[RootLayoutNav] Rendering app providers and navigation');
  
  // #region agent log
  fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_layout.tsx:141',message:'About to render AppProviders',data:{permissionHydrated,isInitializing,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion

  // Always render something - even if providers fail
  try {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_layout.tsx:145',message:'Rendering AppProviders and navigation',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    return (
      <AppProviders>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack 
            screenOptions={{ 
              headerShown: false,
              contentStyle: { backgroundColor: colorScheme === 'dark' ? '#0f172a' : '#ffffff' }
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(permissions)" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(onboarding)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          </Stack>
        </ThemeProvider>
      </AppProviders>
    );
  } catch (error) {
    console.warn('[RootLayoutNav] Error rendering navigation:', error);
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'_layout.tsx:158',message:'Error rendering navigation',data:{error:String(error),errorStack:error instanceof Error ? error.stack : undefined,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    // Fallback UI if navigation fails
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.light }}>
        <Text style={{ color: colors.error[500], fontSize: 16 }}>Navigation Error</Text>
        <Text style={{ color: colors.text.primary.light, marginTop: 8 }}>Please restart the app</Text>
      </View>
    );
  }
}
