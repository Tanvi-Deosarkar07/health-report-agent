import { spawn } from "child_process";
import path from "path";
import type { ClassifiedTest } from "./types";

const PROJECT_ROOT = process.cwd();
const CLASSIFY_CLI_PATH = path.join(PROJECT_ROOT, "classify_cli.py");

export interface ClassifyInput {
  test_name: string;
  value: string;
}

export async function classifyValues(
  items: ClassifyInput[],
  age: number | null,
  sex: "M" | "F" | null
): Promise<ClassifiedTest[]> {
  if (items.length === 0) return [];

  return new Promise((resolve, reject) => {
    const child = spawn("python3", [CLASSIFY_CLI_PATH], { cwd: PROJECT_ROOT });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start classifier process: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Classifier process exited with code ${code}: ${stderr || "no stderr output"}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout) as ClassifiedTest[]);
      } catch {
        reject(new Error(`Classifier process returned non-JSON output: ${stdout.slice(0, 500)}`));
      }
    });

    child.stdin.write(JSON.stringify({ age, sex, items }));
    child.stdin.end();
  });
}
