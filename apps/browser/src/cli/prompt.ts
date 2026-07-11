import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

export async function waitForTerminalConfirmation(message: string): Promise<void> {
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    await prompt.question(message);
  } finally {
    prompt.close();
  }
}
