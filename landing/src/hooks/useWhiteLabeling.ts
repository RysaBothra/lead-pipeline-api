import { useWhiteLabelingContext } from "../context/WhiteLabelingContext";
import type { WhiteLabelingData } from "../context/WhiteLabelingContext";

export function useWhiteLabeling(): WhiteLabelingData {
  return useWhiteLabelingContext();
}
