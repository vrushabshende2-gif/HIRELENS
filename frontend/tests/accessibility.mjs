import { launchBrowser } from "./launch.mjs";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
import path from "node:path";
const base = process.env.HIRELENS_TEST_URL || "http://127.0.0.1:8000";
const access = JSON.parse(
  await fs.readFile("../.runtime/demo-access.json", "utf8"),
);
const browser = await launchBrowser();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const findings = [];
async function check(name) {
  await page.waitForLoadState("networkidle");
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  findings.push({
    page: name,
    violations: result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
        html: n.html,
      })),
    })),
  });
  console.log(
    name +
      ": " +
      result.violations.map((v) => `${v.id} (${v.nodes.length})`).join(", "),
  );
}
try {
  await page.goto(base + "/login");
  await check("login");
  await page.getByPlaceholder("you@company.com").fill(access.recruiter.email);
  await page.locator("input[type=password]").fill(access.recruiter.password);
  await page.getByRole("button", { name: "Sign in to HireLens" }).click();
  await page.waitForURL(base + "/");
  await page.getByRole("heading", { name: "Good to see you, Mira." }).waitFor();
  await check("overview");
  for (const route of [
    "positions",
    "questions",
    "drives",
    "candidates",
    "analytics",
  ]) {
    await page.goto(base + "/" + route);
    await page.locator("h1").waitFor();
    await check(route);
  }
  await page.goto(base + "/candidates");
  await page.getByRole("link", { name: "View Alex Morgan's report" }).click();
  await page
    .getByRole("heading", { name: "A closer look at the evidence." })
    .waitFor();
  await check("report");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/");
  await page.getByRole("heading", { name: "Good to see you, Mira." }).waitFor();
  await check("overview-mobile");
  await fs.writeFile(
    "../artifacts/accessibility.json",
    JSON.stringify(findings, null, 2),
  );
  console.log(
    "Violations:",
    findings.reduce((n, p) => n + p.violations.length, 0),
  );
  if (findings.some((p) => p.violations.length)) process.exitCode = 1;
} finally {
  await browser.close();
}
