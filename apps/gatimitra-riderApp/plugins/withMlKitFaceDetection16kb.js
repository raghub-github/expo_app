const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * 16 KB page-size fix — force a 16 KB-aligned ML Kit face-detection.
 *
 * expo-face-detector@13.0.2 pins `com.google.mlkit:face-detection:16.1.5`, whose
 * prebuilt native libs (e.g. libface_detector_v2_jni.so) are 4 KB ELF-aligned. Google
 * Play then rejects the AAB with "Your app does not support 16 KB memory page sizes".
 * ML Kit face-detection 16.1.7 ships the arm64-v8a + x86_64 (64-bit) .so aligned to
 * 16 KB — the ABIs Play's 16 KB requirement covers. 16.1.5 → 16.1.7 is a patch bump
 * with the same public API, so selfie/KYC face detection is unaffected.
 *
 * We can't change expo-face-detector's own build.gradle from a managed (CNG) project,
 * so we force the transitive version via a Gradle resolutionStrategy on the app module.
 * This overrides only that one Maven artifact — nothing else is touched.
 */
const MLKIT_FACE_DETECTION_16KB = "com.google.mlkit:face-detection:16.1.7";
const MARKER = "// gm-16kb: force 16 KB-aligned ML Kit face-detection";

const FORCE_BLOCK = `
${MARKER}
configurations.all {
    resolutionStrategy {
        force '${MLKIT_FACE_DETECTION_16KB}'
    }
}
`;

module.exports = function withMlKitFaceDetection16kb(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") {
      throw new Error(
        "withMlKitFaceDetection16kb: expected android/app/build.gradle to be Groovy"
      );
    }
    if (cfg.modResults.contents.includes(MARKER)) {
      return cfg; // idempotent
    }
    // Append at the end of the file — top-level `configurations.all` is valid there
    // and applies to the app module's dependency resolution.
    cfg.modResults.contents = `${cfg.modResults.contents.trimEnd()}\n${FORCE_BLOCK}`;
    return cfg;
  });
};
