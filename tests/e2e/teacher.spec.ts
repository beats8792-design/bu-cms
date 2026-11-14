import { expect, test } from "@playwright/test";

/**
 * Teacher happy path (seeded demo account): sign in → own course → marks
 * grid with the roster → attendance digest.
 */
const EMAIL = "teacher@demo.versity.edu";
const PASSWORD = "Jazbah#2026";

test("teacher: login → CSE-101 → marks grid → attendance digest", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: /Welcome, Jahid Hasan/ })).toBeVisible();

  await page.getByRole("link", { name: "Courses", exact: true }).click();
  await page.getByRole("link", { name: /CSE-101/ }).first().click();

  // Teacher manages marks: the marks grid lists the seeded students (names can
  // appear in both the grid and audit table — match cells with .first()).
  await page.getByRole("link", { name: "Marks & results — enter marks, publish" }).click();
  await expect(page.getByRole("cell", { name: /Aminul Islam/ }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: /Fahima Akter/ }).first()).toBeVisible();

  // Back on the course page, the attendance digest is teacher-only.
  await page.goto("/courses");
  await page.getByRole("link", { name: /CSE-101/ }).first().click();
  await expect(page.getByText("Attendance digest (low first)")).toBeVisible();
});
