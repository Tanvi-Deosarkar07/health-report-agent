import { classify } from "./classifier";
import type { ClassifiedTest } from "./types";

export interface ClassifyInput {
  test_name: string;
  value: string;
}

// Pure TypeScript port of classifier.py (see src/lib/classifier.ts) -- no subprocess,
// so this runs in a standard Vercel Node.js serverless function. Kept async to preserve
// the existing call signature used by /api/pipeline/analyze, even though the work is sync.
export async function classifyValues(
  items: ClassifyInput[],
  age: number | null,
  sex: "M" | "F" | null
): Promise<ClassifiedTest[]> {
  return items.map((item) => classify(item.test_name, item.value, age, sex));
}
