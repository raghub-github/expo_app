// IMPORTANT: Setup must run FIRST - installs error suppression before any other imports

import '@/src/utils/setup';



import FontAwesome from '@expo/vector-icons/FontAwesome';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';

import { useFonts } from 'expo-font';
import { Lora_600SemiBold, Lora_700Bold } from '@expo-google-fonts/lora';

import { Stack } from 'expo-router';

import * as SplashScreen from 'expo-splash-screen';

import { useEffect, useState } from 'react';

import { View, ActivityIndicator, Text, Image, StyleSheet } from 'react-native';

import { StatusBar } from 'expo-status-bar';

import { Asset } from 'expo-asset';

import 'react-native-reanimated';



import { useColorScheme } from '@/components/useColorScheme';

import { AppProviders } from '@/src/providers/AppProviders';

import { usePermissionStore } from '@/src/stores/permissionStore';

import { useSessionStore } from '@/src/stores/sessionStore';

import { colors } from '@/src/theme';

import { Platform } from 'react-native';

import { RiderPushSetup } from '@/src/components/RiderPushSetup';
import { RiderDispatchRealtime } from '@/src/components/RiderDispatchRealtime';
import { RiderDispatchKeepAlive } from '@/src/components/RiderDispatchKeepAlive';
import { RiderDutyLocationPing } from '@/src/components/RiderDutyLocationPing';
import { isRiderWsEnabled } from '@/src/config/env';
import { IncomingRideOrderHost } from '@/src/components/orders/IncomingRideOrderHost';
import { RiderToastHost } from '@/src/components/RiderToastHost';

import { initializeMapbox } from '@/src/services/maps/mapbox';



if (Platform.OS !== 'web') {

  try {

    initializeMapbox();

    console.log('[RootLayout] Mapbox initialized early');

  } catch (error) {

    console.warn('[RootLayout] Failed to initialize Mapbox early:', error);

  }

}



export {

  ErrorBoundary,

} from 'expo-router';



SplashScreen.preventAutoHideAsync();



export default function RootLayout() {

  const [loaded, error] = useFonts({

    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),

    Lora_600SemiBold,

    Lora_700Bold,

    ...FontAwesome.font,

  });



  const [assetsLoaded, setAssetsLoaded] = useState(false);



  useEffect(() => {

    async function loadAssets() {

      try {

        await Asset.loadAsync([
          require('../assets/images/rideraap.png'),
          require('../assets/images/splash-logo.png'),
          require('../assets/images/logo.png'),
        ]);

        setAssetsLoaded(true);

        console.log('[RootLayout] Critical assets loaded');

      } catch (loadError) {

        console.warn('[RootLayout] Asset loading error (non-critical):', loadError);

        setAssetsLoaded(true);

      }

    }

    loadAssets();

  }, []);



  useEffect(() => {

    if (error) {

      console.warn('[RootLayout] Font loading error:', error);

    }

  }, [error]);



  useEffect(() => {

    if (loaded && assetsLoaded) {

      const timer = setTimeout(() => {

        SplashScreen.hideAsync().catch(() => {});

        console.log('[RootLayout] Splash screen hidden - all assets loaded');

      }, 100);

      return () => clearTimeout(timer);

    }

  }, [loaded, assetsLoaded]);



  if (!loaded || !assetsLoaded) {
    return (
      <View style={bootStyles.root}>
        <StatusBar style="dark" />
        <Image
          source={require('../assets/images/rideraap.png')}
          style={bootStyles.logo}
          resizeMode="contain"
          accessibilityLabel="GatiMitra Rider"
        />
        <Text style={bootStyles.title}>GatiMitra Rider</Text>
        <ActivityIndicator size="small" color={colors.primary[600]} style={bootStyles.spinner} />
      </View>
    );
  }



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

  const colorScheme = useColorScheme();

  const permissionHydrated = usePermissionStore((s) => s.hydrated);

  const hydratePermissions = usePermissionStore((s) => s.hydrate);

  const hydrateSession = useSessionStore((s) => s.hydrate);

  const [isInitializing, setIsInitializing] = useState(true);



  useEffect(() => {

    console.log('[RootLayoutNav] Starting hydration...');

    void hydratePermissions();

    void hydrateSession();

  }, [hydratePermissions, hydrateSession]);



  useEffect(() => {

    if (permissionHydrated) {

      console.log('[RootLayoutNav] Already hydrated, setting isInitializing to false');

      setIsInitializing(false);

      return;

    }



    let mounted = true;

    const timeoutId = setTimeout(() => {

      console.warn('[RootLayoutNav] Initialization timeout - proceeding anyway');

      if (mounted) setIsInitializing(false);

    }, 500);



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



  if (!permissionHydrated || isInitializing) {

    console.log('[RootLayoutNav] Showing loading screen', { permissionHydrated, isInitializing });

    return (

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>

        <ActivityIndicator size="large" color={colors.primary[500]} />

        <Text style={{ marginTop: 16, color: '#000000' }}>Initializing...</Text>

      </View>

    );

  }



  console.log('[RootLayoutNav] Rendering app providers and navigation');



  try {

    return (

      <AppProviders>

        <StatusBar style="dark" />

        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>

          <RiderPushSetup />
          <RiderDutyLocationPing />
          <RiderDispatchKeepAlive />
          {isRiderWsEnabled() ? <RiderDispatchRealtime /> : null}

          <Stack

            screenOptions={{

              headerShown: false,

              contentStyle: { backgroundColor: '#ffffff' },

            }}

          >

            <Stack.Screen name="index" />

            <Stack.Screen name="(permissions)" />

            <Stack.Screen name="(auth)" />

            <Stack.Screen name="(onboarding)" />

            <Stack.Screen name="(tabs)" />

            <Stack.Screen name="view-profile" />

            <Stack.Screen name="view-documents" />

            <Stack.Screen name="view-vehicle" />

            <Stack.Screen name="notification-settings" />

            <Stack.Screen name="notifications" />

            <Stack.Screen name="raise-ticket" />

            <Stack.Screen name="raise-ticket-flow" />

            <Stack.Screen name="raise-ticket-chat" />

            <Stack.Screen name="my-tickets" />

            <Stack.Screen name="my-rides" />

            <Stack.Screen name="order-history/[id]" />

            <Stack.Screen name="ticket-chat/[id]" />

            <Stack.Screen name="team-leader" />

            <Stack.Screen name="your-subscription" />

            <Stack.Screen name="active-ride/[id]" />

            <Stack.Screen name="active-food/[id]" />

            <Stack.Screen
              name="food-delivery-success"
              options={{
                gestureEnabled: false,
                animation: "fade",
                contentStyle: { flex: 1, backgroundColor: "#ffffff" },
              }}
            />

            <Stack.Screen
              name="ride-payment-waiting"
              options={{
                gestureEnabled: false,
                animation: "fade",
                contentStyle: { flex: 1, backgroundColor: "#ffffff" },
              }}
            />

            <Stack.Screen
              name="ride-delivery-success"
              options={{
                gestureEnabled: false,
                animation: "fade",
                contentStyle: { flex: 1, backgroundColor: "#ffffff" },
              }}
            />

            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />

          </Stack>

          <IncomingRideOrderHost />
          <RiderToastHost />

        </ThemeProvider>

      </AppProviders>

    );

  } catch (navError) {

    console.warn('[RootLayoutNav] Error rendering navigation:', navError);

    return (

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.light }}>

        <Text style={{ color: colors.error[500], fontSize: 16 }}>Navigation Error</Text>

        <Text style={{ color: colors.text.primary.light, marginTop: 8 }}>Please restart the app</Text>

      </View>

    );

  }

}

const bootStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 32,
  },
  logo: {
    width: 220,
    height: 220,
  },
  title: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: '700',
    color: '#14532D',
    letterSpacing: 0.2,
  },
  spinner: {
    marginTop: 24,
  },
});

