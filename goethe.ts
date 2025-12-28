import { chromium } from "playwright";
import * as fs from "fs";
import type { Page } from "playwright";

const username = "nicemonkozhi@gmail.com";
const password = "Nicemon@12345";

const examURL =
    "https://www.goethe.de/ins/in/en/spr/prf/gzb2.cfm?examId=0B5CCAD2D0DFF8858C8957CA2FCD5F022FD68975EB90A8E35DF505FF8F9598AA8498BACBDA15781FD8BBA8DE05D04983BCF2DACB558D04C6A228841F9ED4CAE6";

const MODULE_PREFERENCES = {
    listening: true,
    reading: true,
    writing: false,
    speaking: false,
};

type ModuleName =
    | "listening"
    | "reading"
    | "writing"
    | "speaking";

type ModuleAvailability =
    | "available"
    | "few_places_left"
    | "fully_booked";



async function main() {
    const browser = await chromium.launch({
        headless: false,
        args: ["--start-maximized"], 
    });
    const context = await browser.newContext({
        viewport: null,
    });
    const page = await context.newPage();

    // === OPEN EXAM PAGE ===
    await page.goto(examURL);
    console.log("Opened exam page");

    await page.waitForSelector(
        'div:has-text("cookies"), div:has-text("privacy")',
        { state: 'visible', timeout: 15000 }
    );

    console.log("Cookie banner visible");

    await page.getByText(/Accept All/i).click();

    await page.waitForLoadState("load");
    await page.waitForTimeout(500);

    // === CLICK: Select modules ===
    console.log("About to click module_selection");

    const selectModules = await waitForSelectModulesWithReload(page);
    await selectModules.click();

    console.log("clicked module_selection");

    // === Fetch popup HTML ===
    console.log("About to find module_selection popup");

    // === Customize module selection ===
    await selectAvailableModules(page, MODULE_PREFERENCES);

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

async function waitForSelectModulesWithReload(
    page: Page,
    maxRetries = 15
) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`Checking for Select modules (attempt ${attempt}/${maxRetries})`);

        const selectModules = page.getByText(/Select modules/i);

        if (await selectModules.isVisible().catch(() => false)) {
            console.log("Select modules is visible");
            return selectModules;
        }

        console.log("Select modules not visible, reloading page…");

        await page.reload({ waitUntil: "load" });
        await page.waitForTimeout(1000 + Math.random() * 1000); // human-ish pause
    }

    throw new Error("Select modules did not appear after retries");
}

async function selectAvailableModules(
    page: Page,
    preferences: Record<string, boolean>
) {

    for (const [moduleName, enabled] of Object.entries(preferences)) {
        if (enabled) continue;

        const loc = page.getByRole('link', { name: `${moduleName} ${moduleName.toUpperCase()} Details` })

        const lisbox = await loc.boundingBox();

        if (!lisbox) throw new Error("Row not visible");


        await clickWithHighlight(page, lisbox.x - 21, lisbox.y + 5);


        console.log("Clicked checkbox region & tried deselecting for :", moduleName.toUpperCase());

    }



}

async function clickWithHighlight(
    page: Page,
    x: number,
    y: number,
    color = "green"
) {
    // Draw highlight
    await page.evaluate(({ x, y, color }) => {
        const marker = document.createElement("div");
        marker.style.position = "fixed";
        marker.style.left = `${x - 6}px`;
        marker.style.top = `${y - 6}px`;
        marker.style.width = "12px";
        marker.style.height = "12px";
        marker.style.borderRadius = "50%";
        marker.style.backgroundColor = color;
        marker.style.zIndex = "999999";
        marker.style.pointerEvents = "none";
        marker.style.boxShadow = "0 0 10px rgba(72, 215, 0, 1)";
        document.body.appendChild(marker);

        setTimeout(() => marker.remove(), 2000);
    }, { x, y, color });

    // Actual click
    await page.mouse.click(x, y);
}


async function getModuleAvailability(
    page: Page,
    moduleName: ModuleName
): Promise<ModuleAvailability> {

    const row = page
        .getByRole("link", {
            name: new RegExp(`${moduleName}\\s+.*details`, "i"),
        })
        .locator("..");

    await row.waitFor({ state: "visible", timeout: 15000 });

    const text = (await row.innerText()).toLowerCase();

    if (text.includes("fully booked")) {
        return "fully_booked";
    }

    if (text.includes("only a few")) {
        return "few_places_left";
    }

    return "available";
}



main();


