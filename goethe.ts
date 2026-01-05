import { chromium } from "playwright";
import * as fs from "fs";
import type { Page } from "playwright";

const username = "nicemonkozhi@gmail.com";
const password = "Nicemon@12345";

const examURL =
    "https://www.goethe.de/ins/in/en/spr/prf/gzb2.cfm?examId=5B0E9FD2D0DAF3D08C895E967DC95A012CD68B75BF97FAE00CF554A884C7C2FCDFC3BBCFDD41794AD4E7FD8657D14C80BAF3D896058357C9F629D614CEDECCE9";

const MODULE_PREFERENCES = {
    listening: true,
    reading: true,
    writing: false,
    speaking: false,
};

const MAX_RESTARTS = 200;

// ===== DO NOT EDIT BELOW THIS LINE ===== 

type ModuleName =
    | "listening"
    | "reading"
    | "writing"
    | "speaking";

type ModuleAvailability =
    | "available"
    | "few_places_left"
    | "fully_booked";

let restartCount = 0;



async function main() {
    const browser = await chromium.launch({
        headless: false,
        // args: ["--start-maximized"], 
    });
    const context = await browser.newContext({
        // viewport: null,
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

    await page.waitForTimeout(1000);

    if (
        await isHighDemandErrorPage(page)) {
        await recoverFromHighDemand(page);
    }

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
    maxRetries = 200
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

async function isHighDemandErrorPage(page: Page): Promise<boolean> {
    const errorText = page.getByText(
        /due to very high demand, the product you have chosen cannot be booked/i
    );

    return await errorText.isVisible().catch(() => false);
}

async function recoverFromHighDemand(page: Page) {
    while (true) {
        restartCount++;

        if (restartCount > MAX_RESTARTS) {
            throw new Error("Too many high-demand errors — stopping automation");
        }

        console.warn(
            `⚠️ High demand error (${restartCount}/${MAX_RESTARTS}) — attempting recovery`
        );

        // Reload page
        await page.reload({ waitUntil: "load" });
        await page.waitForTimeout(1000 + Math.random() * 1000);

        // Case 1: still on error page → retry
        if (await isHighDemandErrorPage(page)) {
            continue;
        }

        // Case 2: modules visible → success
        const selectModules = page.getByText(/Available modules/i);
        if (await selectModules.isVisible().catch(() => false)) {
            console.log("✅ Recovery successful — modules are visible");
            return;
        }

        // Otherwise: transient state → retry
    }
}





main();


