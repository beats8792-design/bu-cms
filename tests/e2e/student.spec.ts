import { expect, test } from "@playwright/test";

/**
 * Student happy path (seeded demo account): sign in → dashboard → course
 * → published marks & results.
 */
const EMAIL = "amin@demo.versity.edu";
const PASSWORD = "Jazbah#2026";

test("student: login → dashboard → CSE-101 → results", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Dashboard greets the student.
  await expect(page.getByRole("heading", { name: /Welcome, Aminul Islam/ })).toBeVisible();

  // Courses list shows the seeded course; open it.
  await page.getByRole("link", { name: "Courses", exact: true }).click();
  await page.getByRole("link", { name: /CSE-101/ }).first().click();
  await expect(page.getByRole("heading", { name: /Introduction to Programming/ })).toBeVisible();

  // Published results (assessment schema seeded + published).
  await page.getByRole("link", { name: "View my marks & results" }).click();
  await expect(page.getByRole("heading", { name: /Marks & results/i })).toBeVisible();
  await expect(page.getByText("Class Test 1")).toBeVisible();
});
