import { expect, test } from "@playwright/test";

test("página inicial permanece estável", async ({ page }) => {
  await page.goto("/");
  await page.addStyleTag({ content: "*,*::before,*::after{caret-color:transparent!important}" });
  await expect(page).toHaveScreenshot("home.png", { fullPage: true });
});
