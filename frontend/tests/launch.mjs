import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";

export function launchBrowser() {
  const brave =
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
  const executablePath =
    process.env.BROWSER_EXECUTABLE || (existsSync(brave) ? brave : undefined);
  return chromium.launch({ headless: true, executablePath });
}
