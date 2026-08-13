import { getConfig } from "@/config/env";

export type LearningCentreVideo = {
  id: number;
  sectionTitle: string;
  videoTitle: string;
  youtubeUrl: string;
  youtubeId: string;
  thumbnailUrl: string | null;
  durationLabel: string | null;
  sortOrder: number;
};

export type LearningCentreSection = {
  title: string;
  sectionNumber?: number;
  videos: LearningCentreVideo[];
};

export type LearningCentreResponse = {
  app: "merchant";
  revision?: string;
  sections: LearningCentreSection[];
};

export async function fetchMerchantLearningCentre(
  signal?: AbortSignal
): Promise<LearningCentreResponse> {
  const base = getConfig().apiBaseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/v1/learning-centre/merchant?_=${Date.now()}`, {
    headers: {
      "X-Silent-Error": "1",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    cache: "no-store",
    signal,
  });
  if (!res.ok) {
    throw new Error(`learning-centre/merchant HTTP ${res.status}`);
  }
  try {
    return (await res.json()) as LearningCentreResponse;
  } catch {
    throw new Error("learning-centre/merchant invalid JSON");
  }
}
