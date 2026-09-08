import { Link, Stack, router, usePathname } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { useEffect } from 'react';

import { Text, View } from '@/components/Themed';

export default function NotFoundScreen() {
  const pathname = usePathname();

  // Razorpay / DigiLocker deep links sometimes miss +native-intent — bounce home.
  useEffect(() => {
    const p = String(pathname || '');
    if (/pay-success|pay-cancel|digilocker-return/i.test(p)) {
      router.replace('/(onboarding)/payment');
    }
  }, [pathname]);

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn't exist.</Text>

        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/');
          }}
          style={styles.link}
          accessibilityRole="button"
        >
          <Text style={styles.linkText}>Go back</Text>
        </Pressable>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go to home screen</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: '#2e78b7',
  },
});
