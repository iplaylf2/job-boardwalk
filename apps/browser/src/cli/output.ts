import process from "node:process";

export function writeJsonLine(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function writeLine(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function writeError(message: string): void {
  process.stderr.write(`${message}\n`);
}
