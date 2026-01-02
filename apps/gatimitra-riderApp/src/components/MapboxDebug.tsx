/**
 * Debug component to check Mapbox initialization status
 * Use this temporarily to debug map loading issues
 */
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Platform } from "react-native";
import { getRiderAppConfig } from "@/src/config/env";
import { initializeMapbox, isMapboxAvailable, getMapboxModule } from "@/src/services/maps/mapbox";
import { colors } from "@/src/theme";

export function MapboxDebug() {
  const [debugInfo, setDebugInfo] = useState<any>({});

  useEffect(() => {
    const checkStatus = () => {
      const config = getRiderAppConfig();
      const token = config.mapboxToken;
      const tokenPresent = !!token;
      const tokenLength = token?.length || 0;
      const tokenPrefix = token?.substring(0, 10) || "N/A";
      
      const initResult = initializeMapbox();
      const isAvailable = isMapboxAvailable();
      const mapboxModule = getMapboxModule();
      const modulePresent = !!mapboxModule;

      setDebugInfo({
        platform: Platform.OS,
        tokenPresent,
        tokenLength,
        tokenPrefix: tokenPrefix + "...",
        tokenFull: token || "NOT SET",
        initResult,
        isAvailable,
        modulePresent,
        hasMapView: !!mapboxModule?.MapView,
        hasCamera: !!mapboxModule?.Camera,
        hasPointAnnotation: !!mapboxModule?.PointAnnotation,
        timestamp: new Date().toISOString(),
      });
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <Text style={styles.title}>Mapbox Debug Info</Text>
        {Object.entries(debugInfo).map(([key, value]) => (
          <View key={key} style={styles.row}>
            <Text style={styles.key}>{key}:</Text>
            <Text style={styles.value}>
              {typeof value === "boolean" ? (value ? "✅" : "❌") : String(value)}
            </Text>
          </View>
        ))}
        {!debugInfo.tokenPresent && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              ⚠️ Token not found! Make sure EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN is set in .env file
            </Text>
          </View>
        )}
        {debugInfo.tokenPresent && !debugInfo.isAvailable && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              ⚠️ Token found but Mapbox not available. Check console for errors.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 100,
    left: 10,
    right: 10,
    maxHeight: 400,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 12,
    padding: 16,
    zIndex: 9999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  scrollView: {
    maxHeight: 350,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    color: colors.gray[900],
  },
  row: {
    flexDirection: "row",
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[200],
  },
  key: {
    fontWeight: "600",
    color: colors.gray[700],
    width: 150,
  },
  value: {
    flex: 1,
    color: colors.gray[900],
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 12,
  },
  errorBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: colors.error[50],
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.error[200],
  },
  errorText: {
    color: colors.error[700],
    fontSize: 14,
    fontWeight: "600",
  },
});
