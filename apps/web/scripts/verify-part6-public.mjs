import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = process.env.BROWSER_MODULE ? await import(process.env.BROWSER_MODULE) : require("playwright");
const base = process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3106";
const output = process.env.VERIFY_OUTPUT_DIR ?? "/tmp/osekola-part6-evidence";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const evidence = [];
const modules = ["o-core", "o-academic", "o-attendance", "o-learning", "o-exam", "o-finance", "o-team", "o-connect"];

async function loadedImages(page, selector) {
  const images = page.locator(selector);
  const count = await images.count();
  assert.ok(count > 0, `Expected images matching ${selector}`);
  for (let index = 0; index < count; index++) {
    // Mobile cards extend below the viewport; trigger native lazy loading first.
    await images.nth(index).scrollIntoViewIfNeeded();
    await page.waitForFunction(({ selector, index }) => {
      const image = document.querySelectorAll(selector)[index];
      return image?.complete && image.naturalWidth > 0;
    }, { selector, index });
  }
  await images.first().scrollIntoViewIfNeeded();
}

try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
    await context.addCookies([{ name: "osekola_locale", value: "en-US", url: base }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const response = await page.goto(base, { waitUntil: "networkidle" });
    assert.equal(response.status(), 200);
    await page.locator(".p6-floating-nav").waitFor();
    assert.equal(await page.locator("header .p6-floating-nav").count(), 0);
    assert.equal(await page.locator(".p6-floating-nav a").count(), 3);
    assert.match(await page.locator(".school-hero-actions a").first().getAttribute("href"), /^https:\/\/wa\.me\/\d+\?text=/);
    assert.equal(await page.locator(".p6-module-story").count(), 8);
    assert.equal(await page.locator(".ose-brand-icon i").count(), 0);
    const video = page.locator(".p6-hero-video video");
    assert.equal(await video.evaluate(video => video.paused), true, "Reduced motion must prevent autoplay");
    await page.getByRole("button", { name: "Play video", exact: true }).click();
    await page.waitForFunction(() => { const v = document.querySelector("video"); return v.currentTime > .15 && v.videoWidth > 0; });
    await page.getByRole("button", { name: "Pause video", exact: true }).click();
    assert.equal(await video.evaluate(video => video.paused), true);
    await page.screenshot({ path: path.join(output, `hero-${width}.png`) });

    await page.locator("#ecosystem").scrollIntoViewIfNeeded();
    await loadedImages(page, ".p6-module-story img");
    const stories = page.locator(".p6-module-story");
    if (width > 760) {
      await stories.first().hover();
      assert.equal(await stories.first().getAttribute("data-active"), "true");
      await stories.first().focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(await stories.nth(1).evaluate(element => element === document.activeElement), true);
    }
    await page.screenshot({ path: path.join(output, `modules-${width}.png`) });
    for (let i = 0; i < modules.length; i++) {
      await stories.nth(i).click();
      await page.locator("dialog[open]").waitFor();
      await loadedImages(page, "dialog img");
      const src = await page.locator("dialog img").getAttribute("src");
      assert.ok(decodeURIComponent(src).includes(`/illustrations/${modules[i]}.webp`));
      if (modules[i] === "o-connect") await page.screenshot({ path: path.join(output, `connect-dialog-${width}.png`) });
      await page.keyboard.press("Escape");
      await page.locator("dialog").waitFor({ state: "detached" });
    }

    await page.locator("#curricula").scrollIntoViewIfNeeded();
    await loadedImages(page, '#curricula a:not([aria-hidden="true"]) img');
    assert.deepEqual(await page.locator('#curricula a:not([aria-hidden="true"]) .p5-curriculum-wordmark').allTextContents(), ["Kurikulum Merdeka", "Cambridge", "Pearson", "IB", "Madrasah"]);
    assert.equal(await page.locator(".ose-floating-connect").count(), 0);
    await page.screenshot({ path: path.join(output, `curricula-${width}.png`) });
    await page.locator("#faq").scrollIntoViewIfNeeded();
    assert.equal(await page.locator("#faq h3 button").count(), 8);
    assert.ok(await page.evaluate(() => {
      const pricing = document.querySelector("#pricing"), faq = document.querySelector("#faq"), people = document.querySelector(".ose-people-close");
      return Boolean(pricing.compareDocumentPosition(faq) & Node.DOCUMENT_POSITION_FOLLOWING) && Boolean(faq.compareDocumentPosition(people) & Node.DOCUMENT_POSITION_FOLLOWING);
    }));
    await page.getByRole("button", { name: "How do we get started?", exact: true }).click();
    assert.equal(await page.locator("#faq-answer-start").isVisible(), true);
    await page.locator(".ose-language").selectOption("id-ID");
    await page.getByRole("button", { name: "Bagaimana cara mulai menggunakan OSEKOLA?", exact: true }).waitFor();
    assert.equal(await page.locator("#faq-answer-start").isVisible(), true);
    await page.getByRole("button", { name: "Bisakah orang tua membayar tagihan sekolah secara online?", exact: true }).click();
    assert.equal(await page.locator("#faq-answer-start").isVisible(), false);
    assert.match(await page.locator("#faq-answer-payments").innerText(), /setelah sekolah mengaktifkan/);
    await page.locator("#faq").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `faq-id-${width}.png`) });
    await page.locator(".ose-theme").click();
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.screenshot({ path: path.join(output, `faq-dark-${width}.png`) });
    await page.locator("#ecosystem").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `modules-dark-${width}.png`) });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "Landing page must not overflow horizontally");

    for (const route of ["/assessment", "/login", "/partners"]) {
      // Live pages may keep background requests open after their content is ready.
      const result = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" });
      assert.equal(result.status(), 200);
      await page.locator(".p6-floating-nav").waitFor();
      assert.equal(await page.locator(".p6-floating-nav a").count(), 3);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} must not overflow horizontally`);
      if (route === "/assessment") {
        await page.locator(".p6-assessment-art img").waitFor();
        await loadedImages(page, ".p6-assessment-art img");
        assert.ok(decodeURIComponent(await page.locator(".p6-assessment-art img").getAttribute("src")).includes("/illustrations/hero.webp"));
        await page.getByRole("button", { name: "Mulai perjalanan", exact: true }).waitFor();
      }
      if (route === "/login") {
        await page.locator('input[type="password"]').waitFor();
        assert.equal(await page.locator(".owner-back-home").count(), 0);
        assert.equal(await page.locator('input[type="password"]').count(), 1);
      }
      if (route === "/partners") {
        await page.getByRole("heading", { name: "Hubungkan sekolah. Bangun dampak bersama.", exact: true }).waitFor();
        assert.equal(await page.locator(".school-partner-steps article").count(), 3);
        assert.match(await page.getByRole("link", { name: "Bicarakan kemitraan", exact: true }).getAttribute("href"), /^https:\/\/wa\.me\/\d+\?text=/);
        assert.equal(await page.getByRole("link", { name: "Login partner →", exact: true }).getAttribute("href"), "/dashboard/partners");
      }
      assert.equal(await page.locator(".ose-floating-connect").count(), 0);
      await page.screenshot({ path: path.join(output, `${route.slice(1)}-${width}.png`) });
    }
    await page.getByRole("link", {name:"Daftar sebagai mitra",exact:true}).click();
    await page.getByRole("dialog", {name:"Daftar sebagai mitra"}).waitFor();
    await page.getByLabel("Nama lengkap", {exact:true}).fill("Uji tampilan tanpa pengiriman");
    assert.ok(await page.getByLabel("NIK", {exact:true}).isVisible());
    assert.equal(await page.locator("input[type=file]").getAttribute("accept"), "application/pdf,.pdf");
    await page.screenshot({path:path.join(output,`partner-registration-${width}.png`)});
    await page.keyboard.press("Escape");
    await page.getByRole("heading", {name:"Hubungkan sekolah. Bangun dampak bersama.",exact:true}).waitFor();
    assert.deepEqual(errors, [], "No browser runtime errors");
    evidence.push({ width, locales: ["en-US", "id-ID"], themes: ["light", "dark"], modules: 8, faq: 8, routes: ["/", "/assessment", "/login", "/partners"], errors });
    await context.close();
  }
  console.log(JSON.stringify({ status: "passed", base, evidence }, null, 2));
  await writeFile(path.join(output, "verification.json"), JSON.stringify({ status: "passed", base, evidence }, null, 2));
} finally {
  await browser.close();
}
