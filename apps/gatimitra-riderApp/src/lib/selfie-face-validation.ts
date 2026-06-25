import { UnavailabilityError } from "expo-modules-core";

type FaceDetectorModule = typeof import("expo-face-detector");
type DetectedFace = import("expo-face-detector").FaceFeature;

const EYE_OPEN_THRESHOLD = 0.55;
const EYE_CLOSED_THRESHOLD = 0.28;

/** Lazy-loaded so Expo Go can open pan-selfie without crashing at import time. */
let cachedFaceDetector: FaceDetectorModule | null | undefined;

function getFaceDetector(): FaceDetectorModule | null {
  if (cachedFaceDetector !== undefined) return cachedFaceDetector;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedFaceDetector = require("expo-face-detector") as FaceDetectorModule;
    return cachedFaceDetector;
  } catch {
    cachedFaceDetector = null;
    return null;
  }
}

export function isSelfieFaceDetectorAvailable(): boolean {
  return getFaceDetector() !== null;
}

export type EyeProbeState =
  | "no_detector"
  | "no_face"
  | "multiple_faces"
  | "eyes_open"
  | "eyes_closed"
  | "eyes_unknown";

export function probeIndicatesFacePresent(probe: EyeProbeState): boolean {
  return (
    probe === "eyes_open" ||
    probe === "eyes_closed" ||
    probe === "eyes_unknown"
  );
}

async function detectFacesFromUri(uri: string): Promise<{
  faces: DetectedFace[];
  detectorAvailable: boolean;
}> {
  const FaceDetector = getFaceDetector();
  if (!FaceDetector) {
    return { faces: [], detectorAvailable: false };
  }

  try {
    const result = await FaceDetector.detectFacesAsync(uri, {
      mode: FaceDetector.FaceDetectorMode.fast,
      detectLandmarks: FaceDetector.FaceDetectorLandmarks.all,
      runClassifications: FaceDetector.FaceDetectorClassifications.all,
      minDetectionInterval: 0,
    });
    return { faces: result.faces ?? [], detectorAvailable: true };
  } catch (error) {
    if (error instanceof UnavailabilityError) {
      return { faces: [], detectorAvailable: false };
    }
    return { faces: [], detectorAvailable: true };
  }
}

export async function probeSelfieBlink(uri: string): Promise<EyeProbeState> {
  const { faces, detectorAvailable } = await detectFacesFromUri(uri);
  if (!detectorAvailable) return "no_detector";
  if (faces.length === 0) return "no_face";
  if (faces.length > 1) return "multiple_faces";

  const face = faces[0]!;
  const leftEye = face.leftEyeOpenProbability;
  const rightEye = face.rightEyeOpenProbability;
  if (leftEye === undefined || rightEye === undefined) return "eyes_unknown";

  if (leftEye >= EYE_OPEN_THRESHOLD && rightEye >= EYE_OPEN_THRESHOLD) {
    return "eyes_open";
  }
  if (leftEye <= EYE_CLOSED_THRESHOLD && rightEye <= EYE_CLOSED_THRESHOLD) {
    return "eyes_closed";
  }
  return "eyes_unknown";
}

/** Waits for open eyes, then triggers capture on the first blink (eyes close). */
export class BlinkCaptureTracker {
  private phase: "align" | "blink" = "align";

  reset() {
    this.phase = "align";
  }

  getPhase(): "align" | "blink" {
    return this.phase;
  }

  consume(probe: EyeProbeState): "capture" | "none" {
    if (probe === "no_detector") return "none";

    if (probe === "no_face" || probe === "multiple_faces") {
      this.phase = "align";
      return "none";
    }

    if (probe === "eyes_open" || probe === "eyes_unknown") {
      if (this.phase === "align") {
        this.phase = "blink";
      }
      return "none";
    }

    if (probe === "eyes_closed" && this.phase === "blink") {
      return "capture";
    }

    return "none";
  }
}

export type SelfieValidationResult =
  | { ok: true; detectorAvailable: boolean }
  | { ok: false; message: string; detectorAvailable: boolean };

function checkFaceObstructions(face: DetectedFace): SelfieValidationResult {
  const leftEye = face.leftEyeOpenProbability;
  const rightEye = face.rightEyeOpenProbability;

  const eyesClassified = leftEye !== undefined && rightEye !== undefined;
  if (eyesClassified && leftEye < 0.2 && rightEye < 0.2) {
    return {
      ok: false,
      detectorAvailable: true,
      message:
        "Sunglasses detected. Please remove your sunglasses and capture again.",
    };
  }

  const hasEyeLandmarks = Boolean(face.leftEyePosition && face.rightEyePosition);
  const hasNose = Boolean(face.noseBasePosition);
  const hasMouthLandmarks = Boolean(
    face.mouthPosition &&
      face.bottomMouthPosition &&
      face.leftMouthPosition &&
      face.rightMouthPosition
  );

  if (hasNose && !hasMouthLandmarks) {
    return {
      ok: false,
      detectorAvailable: true,
      message: "Face mask detected. Please remove your mask and capture again.",
    };
  }

  if (!hasEyeLandmarks && hasNose && eyesClassified && leftEye < 0.35 && rightEye < 0.35) {
    return {
      ok: false,
      detectorAvailable: true,
      message:
        "Your eyes are not clearly visible. Remove sunglasses or mask and try again.",
    };
  }

  return { ok: true, detectorAvailable: true };
}

export async function validateSelfieFace(
  uri: string,
  options?: { allowWithoutDetector?: boolean }
): Promise<SelfieValidationResult> {
  try {
    const { faces, detectorAvailable } = await detectFacesFromUri(uri);
    if (!detectorAvailable) {
      if (options?.allowWithoutDetector) {
        return { ok: true, detectorAvailable: false };
      }
      return {
        ok: false,
        detectorAvailable: false,
        message:
          "Face detection is not available in Expo Go. Install the rider dev build to capture selfie.",
      };
    }

    if (faces.length === 0) {
      return {
        ok: false,
        detectorAvailable: true,
        message: "No face found. Center your face in the circle and try again.",
      };
    }

    if (faces.length > 1) {
      return {
        ok: false,
        detectorAvailable: true,
        message: "Multiple faces detected. Only you should be in the selfie.",
      };
    }

    return checkFaceObstructions(faces[0]!);
  } catch {
    return {
      ok: false,
      detectorAvailable: false,
      message: "Could not verify your face. Please try again.",
    };
  }
}
