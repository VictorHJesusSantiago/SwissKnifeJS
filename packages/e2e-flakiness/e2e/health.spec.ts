import { expect, test } from "@playwright/test";

test("serviço responde ao health check", async ({ request }) => {
  const response = await request.get("/health");
  expect(response.ok()).toBeTruthy();
  await expect(response.json()).resolves.toMatchObject({ status: "ok" });
});
