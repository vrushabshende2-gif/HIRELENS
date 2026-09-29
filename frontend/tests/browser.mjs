import { launchBrowser } from "./launch.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

const base = process.env.HIRELENS_TEST_URL || "http://127.0.0.1:8000";
const access = JSON.parse(
  await fs.readFile(
    process.env.HIRELENS_ACCESS_FILE || "../.runtime/demo-access.json",
    "utf8",
  ),
);
const out = process.env.HIRELENS_ARTIFACT_DIR || "../artifacts";
await fs.mkdir(out, { recursive: true });
const browser = await launchBrowser();
const recruiter = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await recruiter.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
async function login(page, account) {
  await page.goto(base + "/login");
  await page.getByPlaceholder("you@company.com").fill(account.email);
  await page.locator("input[type=password]").fill(account.password);
  await page.getByRole("button", { name: "Sign in to HireLens" }).click();
  await page.waitForURL(
    account === access.recruiter ? base + "/" : base + "/my-interviews",
  );
}
async function save(name) {
  await page.screenshot({
    path: path.join(out, name + ".png"),
    fullPage: true,
  });
}
async function noOverflow(page) {
  await page.waitForFunction(
    () => document.documentElement.scrollWidth <= innerWidth + 1,
    null,
    { timeout: 5000 },
  );
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
    "Unexpected horizontal page overflow",
  );
}
try {
  await login(page, access.recruiter);
  await page.getByRole("heading", { name: "Good to see you, Mira." }).waitFor();
  await save("dashboard");
  for (const [route, title] of [
    ["positions", "Define what great looks like."],
    ["questions", "Better questions. Clearer signals."],
    ["drives", "Great conversations start here."],
    ["candidates", "Your next great hire is here."],
    ["analytics", "Patterns worth paying attention to."],
  ]) {
    await page.goto(base + "/" + route);
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
    await noOverflow(page);
  }
  await page.goto(base + "/candidates");
  await page.getByRole("link", { name: "View Alex Morgan's report" }).click();
  await page
    .getByRole("heading", { name: "A closer look at the evidence." })
    .waitFor();
  await page.getByRole("button", { name: "Expand all", exact: true }).click();
  await page.getByText("Candidate’s answer", { exact: true }).first().waitFor();
  await save("report");
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download PDF" }).click(),
  ]);
  await pdf.saveAs(path.join(out, "scorecard.pdf"));
  assert(
    (await fs.readFile(path.join(out, "scorecard.pdf")))
      .subarray(0, 4)
      .toString() === "%PDF",
  );
  await page.getByRole("button", { name: "Record your review" }).click();
  await page
    .getByLabel("Supporting notes")
    .fill("Browser verification: reviewed the cited evidence.");
  await page.getByRole("button", { name: "Save review", exact: true }).click();
  await page
    .getByText("Browser verification: reviewed the cited evidence.")
    .waitFor();
  await page.goto(base + "/candidates");
  await page.getByRole("button", { name: "Compare candidates" }).click();
  const compare = page.getByRole("dialog");
  await compare.getByRole("checkbox").nth(0).check();
  await compare.getByRole("checkbox").nth(1).check();
  await compare
    .getByRole("button", { name: "Compare selected candidates" })
    .click();
  await compare
    .getByRole("link", { name: "Read full evidence" })
    .first()
    .waitFor();
  assert.equal(
    await compare.getByRole("link", { name: "Read full evidence" }).count(),
    2,
  );
  await compare.getByRole("button", { name: "Close dialog" }).click();
  // Exercise recruiter mutations through their real forms.
  await page.goto(base + "/positions");
  await page.getByRole("button", { name: "New position" }).click();
  await page.getByLabel("Position title").fill("Browser verification role");
  await page.getByLabel("Skill 1", { exact: true }).fill("JavaScript");
  await page
    .getByRole("button", { name: "Create position", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Browser verification role" })
    .waitFor();
  await page.goto(base + "/drives?create=1");
  await page
    .getByLabel("Drive name", { exact: true })
    .fill("Browser verification drive");
  await page
    .getByLabel("Position", { exact: true })
    .selectOption({ label: "Browser verification role" });
  await page.getByLabel("Question count", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Create draft drive" }).click();
  await page
    .getByRole("heading", { name: "Browser verification drive" })
    .click();
  await page.getByRole("button", { name: "Publish drive" }).click();
  await page
    .getByRole("button", { name: "Invite candidate", exact: true })
    .first()
    .click();
  await page.getByLabel("Candidate name").fill("Fictional UI Candidate");
  await page.getByLabel("Candidate email").fill("ui.check@example.com");
  await page.getByRole("button", { name: "Create invitation" }).click();
  await page.getByLabel("Unique interview link").waitFor();
  assert(
    (await page.getByLabel("Unique interview link").inputValue()).includes(
      "/invite#token=",
    ),
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.goto(base + "/");
  await page.getByRole("heading", { name: "Good to see you, Mira." }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await save("dashboard-mobile");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Question bank", exact: true }).click();
  await page
    .getByRole("heading", { name: "Better questions. Clearer signals." })
    .waitFor();
  await noOverflow(page);
  await save("questions-mobile");
  // Independent candidate browser; the test server mocks only Google's HTTP boundary.
  const candidateContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const candidate = await candidateContext.newPage();
  candidate.on("pageerror", (e) => errors.push(e.message));
  await login(candidate, access.candidate);
  await candidate.goto(access.invite_url);
  await candidate
    .getByRole("heading", { name: "Backend Engineer — Node.js" })
    .waitFor();
  await candidate.getByRole("checkbox").nth(0).check();
  await candidate.getByRole("checkbox").nth(1).check();
  await candidate.getByRole("button", { name: "I’m ready to begin" }).click();
  await candidate.waitForURL(/\/interview\//);
  for (let i = 1; i <= 12; i++) {
    await candidate
      .getByText(new RegExp(`QUESTION ${i}|Question ${i} of 12`, "i"))
      .first()
      .waitFor({ timeout: 45000 });
    const text =
      "I would first define the invariant, validate inputs, and handle failure atomically. A bounded worker pool prevents resource exhaustion; retries need an idempotency key. I would verify the approach with measured outcomes and edge cases.";
    const preflight = candidate.getByRole("button", {
      name: "Check camera & microphone",
    });
    const area = candidate.locator("#candidate-answer");
    const isLiveQuestion = (await preflight.count()) > 0;
    let submitLiveResponse = false;
    if (isLiveQuestion) {
      await preflight.click();
      await candidate
        .getByRole("button", {
          name: "Continue with typed accessibility response",
          exact: true,
        })
        .waitFor({ timeout: 15000 });
      await candidate
        .getByRole("button", {
          name: "Continue with typed accessibility response",
          exact: true,
        })
        .click();
      const outcome = await Promise.race([
        candidate
          .getByText("Typed accessibility response", { exact: true })
          .waitFor({ timeout: 15000 })
          .then(() => "typed"),
        candidate
          .getByRole("button", { name: "Open coding workspace", exact: true })
          .waitFor({ timeout: 15000 })
          .then(() => "code"),
      ]);
      if (outcome === "typed") {
        submitLiveResponse = true;
        await candidate.locator(".live-typed-fallback textarea").fill(text);
      } else {
        await candidate
          .getByRole("button", { name: "Open coding workspace", exact: true })
          .click();
        const editor = candidate.locator(".cm-content");
        await editor.waitFor({ state: "visible", timeout: 15000 });
        await editor.click();
        await editor.press("Control+A");
        await editor.pressSequentially(
          "function solution(input) {\n  // " +
            text +
            "\n  if (!input) return [];\n  return input;\n}",
        );
      }
    } else if (await area.count()) await area.fill(text);
    else {
      const editor = candidate.locator(".cm-content");
      await editor.waitFor({ state: "visible", timeout: 15000 });
      await editor.click();
      await editor.press("Control+A");
      await editor.pressSequentially(
        "function solution(input) {\n  // " +
          text +
          "\n  if (!input) return [];\n  return input;\n}",
      );
    }
    if (i === 1) {
      await candidate.screenshot({
        path: path.join(out, "candidate-interview.png"),
        fullPage: true,
      });
      await candidate.setViewportSize({ width: 390, height: 844 });
      await noOverflow(candidate);
      await candidate.screenshot({
        path: path.join(out, "candidate-mobile.png"),
        fullPage: true,
      });
      await candidate.setViewportSize({ width: 1280, height: 900 });
    }
    if (submitLiveResponse) {
      await candidate
        .getByRole("button", {
          name: "Continue with this response",
          exact: true,
        })
        .click();
    } else {
      await candidate
        .getByRole("button", {
          name: i === 12 ? "Submit final answer" : "Submit answer",
          exact: true,
        })
        .click();
    }
  }
  await candidate
    .getByRole("heading", {
      name: "Your part is done. Thank you for showing up.",
    })
    .waitFor({ timeout: 45000 });
  await candidate.screenshot({
    path: path.join(out, "candidate-complete.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/candidates");
  await page
    .getByRole("link", { name: "View Demo Candidate's report" })
    .waitFor({ timeout: 45000 })
    .catch(async () => {
      await page.reload();
      await page
        .getByRole("link", { name: "View Demo Candidate's report" })
        .waitFor();
    });
  await page
    .getByRole("link", { name: "View Demo Candidate's report" })
    .click();
  await page
    .getByText(
      "A complete interview traversed the API, database, adaptive engine, and validated report pipeline using a mocked external provider.",
    )
    .waitFor({ timeout: 45000 })
    .catch(async () => {
      await page.reload();
      await page
        .getByText(
          "A complete interview traversed the API, database, adaptive engine, and validated report pipeline using a mocked external provider.",
        )
        .waitFor();
    });
  await save("completed-live-flow-report");
  assert.deepEqual(errors, [], "Unexpected browser errors");
  console.log(
    "PASS: recruiter pages, review, comparison, position/drive/invitation creation, mobile layouts, candidate flow, evidence report, PDF, and browser error checks.",
  );
} catch (error) {
  await page
    .screenshot({ path: path.join(out, "failure.png"), fullPage: true })
    .catch(() => {});
  await fs
    .writeFile(
      path.join(out, "failure.txt"),
      error instanceof Error ? error.stack || error.message : String(error),
    )
    .catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
