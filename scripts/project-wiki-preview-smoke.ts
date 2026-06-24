import { mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const url = process.env.PROJECT_WIKI_SMOKE_URL ?? "http://localhost:3000/preview/materials?view=wiki";

mkdirSync("test-results", { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  try {
    await page.goto(url, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "프로젝트 WIKI" }).click();
    await page.getByPlaceholder("키워드 검색").fill("방화");
    await page.getByLabel("비활성 포함").check();

    await page.getByRole("heading", { name: "방화 구획 검토 기준" }).waitFor();
    await page.getByText("source temporary review record").waitFor();
    await page.getByText("approved work record link").waitFor();
    await page.getByText("common WIKI candidate link/status").waitFor();
    await page.getByLabel("프로젝트 WIKI action log").getByText("상태 변경 기록이 없습니다.").waitFor();

    await page.getByPlaceholder("선택 입력").fill("smoke 상태 변경 확인");
    await page.getByRole("button", { name: "비활성화" }).click();
    await page.getByLabel("프로젝트 WIKI action log").getByText("Preview User").waitFor();
    await page.getByLabel("프로젝트 WIKI action log").getByText("smoke 상태 변경 확인").waitFor();

    assert.equal(errors.length, 0, errors.join("\n\n"));
    await page.screenshot({ path: "test-results/project-wiki-preview-smoke.png", fullPage: true });
  } finally {
    await browser.close();
  }

  console.log("project-wiki-preview-smoke: ok");
}

void main();
