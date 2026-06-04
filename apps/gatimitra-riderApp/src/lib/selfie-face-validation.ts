import { requireOptionalNativeModule } from "expo-modules-core";

type FacePoint = { x: number; y: number };

type DetectedFace = {
  bounds: {
    origin: FacePoint;
    size: { width: number; height: number };
  };
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
  leftEyePosition?: FacePoint;
  rightEyePosition?: FacePoint;
  noseBasePosition?: FacePoint;
  mouthPosition?: FacePoint;
  leftMouthPosition?: FacePoint;
  rightMouthPosition?: FacePoint;
  bottomMouthPosition?: FacePoint;
};

type FaceDetectorNative = {
  detectFacesAsync: (
    uri: string,
    settings: {
      mode?: number;
      detectLandmarks?: number;
      runClassifications?: number;
      minDetectionInterval?: number;
      tracking?: boolean;
    }
  ) => Promise<{ faces: DetectedFace[]; image: { width: number; height: number } }>;
};

const FaceDetectorMode = { fast: 1, accurate: 2 } as const;
const FaceDetectorLandmarks = { none: 1, all: 2 } as const;
const FaceDetectorClassifications = { none: 1, all: 2 } as const;

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

export async function validateSelfieFace(uri: string): Promise<SelfieValidationResult> {
  const native = requireOptionalNativeModule<FaceDetectorNative>("ExpoFaceDetector");

  if (!native?.detectFacesAsync) {
    return { ok: true, detectorAvailable: false };
  }

  try {
    const result = await native.detectFacesAsync(uri, {
      mode: FaceDetectorMode.accurate,
      detectLandmarks: FaceDetectorLandmarks.all,
      runClassifications: FaceDetectorClassifications.all,
    });

    const faces = result.faces ?? [];
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
    return { ok: true, detectorAvailable: false };
  }
}
