import { chromium } from "playwright";
import * as fs from "fs";
import type { Page } from "playwright";

const username = "nicemonkozhi@gmail.com";
const password = "Nicemon@12345";

const examURL =
    "https://www.goethe.de/ins/in/en/spr/prf/gzb2.cfm?examId=0B5CCAD2D0DFF8858C8957CA2FCD5F022FD68975EB90A8E35DF505FF8F9598AA8498BACBDA15781FD8BBA8DE05D04983BCF2DACB558D04C6A228841F9ED4CAE6";

async function main() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // === OPEN EXAM PAGE ===
    await page.goto(examURL);
    console.log("Opened exam page");

    // === CLICK: Select modules ===
    console.log("About to click module_selection");
    // await page.locator("text=Select modules").click();
    await page.getByText(/Select modules/i).click();
    console.log("clicked module_selection");

    await page.getByText(/Accept All/i).click();

    // === Fetch popup HTML ===
    console.log("About to find module_selection popup");
    const html = await page.getByText('Booking Selection Selection').innerHTML();
    console.log("Found popup HTML:");
    console.log(html);

    const fullPage = await page.content();
    console.log(fullPage);

    // === Click Next button ===
    await page.getByRole('button', { name: 'continue' }).nth(1).click();
    await page.getByText('Book for myself').click();

    // === LOGIN FORM ===
    await page.waitForSelector('input[type="email"], input[name="email"]', {
        timeout: 15000,
    });

    console.log("Login form visible");

    // Fill email
    await page.locator('input[type="email"], input[name="email"]').fill(username);

    // Fill password
    await page.locator('input[type="password"]').fill(password);

    // Click LOGIN button
    await page.getByRole('button', { name: /log in/i }).click();

    await page.waitForLoadState("networkidle");

    const isDiscardOtherBookingVisible = await page.getByText(/discard other booking/i).isVisible();

    console.log("isDiscardOtherBookingVisible", isDiscardOtherBookingVisible);

    if (isDiscardOtherBookingVisible) {
        await page.getByText(/discard other booking/i).click();
        await page.getByText(/continue/i).nth(1).click();
    }
    await page.waitForLoadState("networkidle");

    await page.getByText(/continue/i).nth(1).click();

    // === Save debug ===
    await saveDebug(page, "module_selection");

    // await browser.close();
}

async function saveDebug(page: Page, name: string) {
    const content = await page.content();
    fs.writeFileSync(`${name}.html`, content, "utf8");
    console.log(`Saved debug page → ${name}.html`);
}

main();
