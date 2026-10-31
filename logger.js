import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import util from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logDirectory = path.join(__dirname, "logs");
const logFile = path.join(logDirectory, "bot-error.log");

fs.mkdirSync(logDirectory, { recursive: true });

const originalConsoleError = console.error.bind(console);
let writingLog = false;

function writeErrorLog(label, ...args) {
  const timestamp = new Date().toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
  });

  const details = args
    .map((arg) => {
      if (arg instanceof Error) return arg.stack || arg.message;
      if (typeof arg === "string") return arg;
      return util.inspect(arg, { depth: 6, breakLength: 120 });
    })
    .join(" ");

  const entry = `[${timestamp}] [${label}]\n${details}\n${"-".repeat(80)}\n`;

  try {
    fs.appendFileSync(logFile, entry, "utf8");
  } catch (writeError) {
    originalConsoleError("[LOGGER] Log-Datei konnte nicht geschrieben werden:", writeError);
  }
}

// Alle bestehenden console.error-Aufrufe zusätzlich protokollieren.
console.error = (...args) => {
  originalConsoleError(...args);
  if (writingLog) return;
  writingLog = true;
  try {
    writeErrorLog("ERROR", ...args);
  } finally {
    writingLog = false;
  }
};

// Fehler, die sonst möglicherweise außerhalb normaler try/catch-Blöcke landen.
process.on("uncaughtException", (error) => {
  console.error("[GLOBAL] Nicht abgefangene Exception:", error);
  process.exitCode = 1;
  // Kurze synchrone Protokollierung ist bereits erfolgt; Prozess danach beenden.
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[GLOBAL] Nicht abgefangene Promise-Rejection:", reason);
});

process.on("warning", (warning) => {
  writeErrorLog("NODE WARNING", warning);
});

console.log(`[LOGGER] Fehlerprotokollierung aktiv: ${logFile}`);
