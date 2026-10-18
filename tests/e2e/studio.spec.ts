import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, code = "admin") {
  await page.route("**/api/v1/auth/login", async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    const state = new URL(response.headers().location!).searchParams.get(
      "state",
    );
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        location: `http://127.0.0.1:19080/api/v1/auth/callback?code=${code}&state=${state}`,
      },
    });
  });
  await page.goto("/login");
  await page.getByRole("link", { name: "Continuar con Discord" }).click();
  await expect(
    page.getByRole("heading", { name: "Vista general." }),
  ).toBeVisible();
}
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:19081/__test/reset", {
    headers: { origin: "http://127.0.0.1:19080" },
  });
});
test("OAuth state, overview, session cookies and logout", async ({
  page,
  context,
}) => {
  await login(page);
  await expect(page.getByText("Conectado", { exact: true })).toBeVisible();
  const spec = await context.request.get("/api/v1/openapi.json");
  expect(spec.status()).toBe(200);
  expect((await spec.json()).info.version).toBe("0.4.0");
  const session = (await context.cookies()).find(
    (c) => c.name === "tfl_studio_session",
  );
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");
  await page.screenshot({
    path: "test-results/studio-overview.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /Administrador/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/reports");
  await expect(page).toHaveURL(/\/login$/);
});
test("create guide, edit version, archive and inspect history through real Core", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Guías", exact: true }).click();
  await page.getByRole("button", { name: "Nueva guía" }).click();
  const title = "Guía E2E " + Date.now();
  await page
    .getByRole("dialog")
    .getByLabel("Título", { exact: true })
    .fill(title);
  await page
    .getByRole("dialog")
    .getByLabel("Categoría", { exact: true })
    .fill("Testing");
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Contenido", exact: true })
    .fill("Una guía de prueba sin publicaciones en Discord.");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.getByLabel("Acciones de " + title).click();
  await row.getByRole("button", { name: "Editar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Contenido", exact: true })
    .fill("Contenido actualizado.");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(row.locator("td").nth(5)).toHaveText("2");
  await row.getByLabel("Acciones de " + title).click();
  await row.getByRole("button", { name: "Versiones", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Una guía de prueba sin publicaciones en Discord.",
  );
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await row.getByLabel("Acciones de " + title).click();
  await row.getByRole("button", { name: "Archivar", exact: true }).click();
  await page.getByLabel("He revisado esta operación").check();
  await page.getByRole("button", { name: "Confirmar operación" }).click();
  await expect(row.getByText("archived", { exact: true })).toBeVisible();
});
test("announcement embed draft and explicit scheduling cancellation", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Anuncios", exact: true }).click();
  await page.getByRole("button", { name: "Nuevo anuncio" }).click();
  const title = "Anuncio E2E " + Date.now();
  await page
    .getByRole("dialog")
    .getByLabel("Título", { exact: true })
    .fill(title);
  await page
    .getByRole("dialog")
    .getByLabel("Mensaje", { exact: true })
    .fill("Prueba de borrador.");
  await page.getByRole("button", { name: "Añadir embed" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Título del embed")
    .fill("Un avance del equipo");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.getByLabel("Acciones de " + title).click();
  await row.getByRole("button", { name: "Programar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Fecha y hora")
    .fill("2030-10-18T12:30");
  await expect(
    page.getByRole("button", { name: "Confirmar operación" }),
  ).toBeDisabled();
  await page.getByLabel("He revisado esta operación").check();
  await page.getByRole("button", { name: "Confirmar operación" }).click();
  await expect(row.getByText("scheduled", { exact: true })).toBeVisible();
  await row.getByLabel("Acciones de " + title).click();
  await row.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Motivo")
    .fill("Cancelar publicación de prueba.");
  await page.getByLabel("He revisado esta operación").check();
  await page.getByRole("button", { name: "Confirmar operación" }).click();
  await expect(row.getByText("cancelled", { exact: true })).toBeVisible();
});
test("financial minor units, subscription form and scoped access", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Finanzas", exact: true }).click();
  await page.getByRole("button", { name: "Nuevo registro" }).click();
  const title = "Finanzas E2E " + Date.now();
  await page
    .getByRole("dialog")
    .getByLabel("Concepto", { exact: true })
    .fill(title);
  await page
    .getByRole("dialog")
    .getByLabel("Cantidad en unidades menores")
    .fill("100099");
  await page
    .getByRole("dialog")
    .getByLabel("Categoría", { exact: true })
    .fill("E2E");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: title })).toContainText(
    "100099",
  );
  const financeRow = page.getByRole("row").filter({ hasText: title });
  await financeRow.getByLabel("Acciones de " + title).click();
  await financeRow.getByRole("button", { name: "Editar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Motivo", exact: true })
    .fill("Verificar precisión al editar sin cambiar el importe.");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(financeRow.locator("td").nth(7)).toHaveText("2");
  await expect(financeRow).toContainText("100099");
  await page.getByRole("tab", { name: "Suscripciones", exact: true }).click();
  await page.getByRole("button", { name: "Nueva suscripción" }).click();
  await expect(
    page.getByRole("dialog").getByLabel("Meses por renovación"),
  ).toHaveValue("1");
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: /Administrador/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, "department");
  await expect(
    page.getByRole("link", { name: "Finanzas", exact: true }),
  ).toHaveCount(0);
  await page.goto("/billing");
  await expect(
    page.getByRole("heading", { name: "Acceso restringido" }),
  ).toBeVisible();
});
test("report filtering, idempotent create, preferences and mobile layout", async ({
  page,
}) => {
  await login(page);
  await page.getByRole("link", { name: "Reportes", exact: true }).click();
  await page.getByRole("button", { name: "Crear reporte" }).click();
  const title = "Reporte E2E " + Date.now();
  await page
    .getByRole("dialog")
    .getByLabel("Título", { exact: true })
    .fill(title);
  await page
    .getByRole("dialog")
    .getByLabel("Descripción", { exact: true })
    .fill("Avance de integración sin worker externo.");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.getByRole("row").filter({ hasText: title })).toContainText(
    "queued",
  );
  await page.getByLabel("Buscar", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("link", { name: "Configuración", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Tema", exact: true })
    .selectOption("dark");
  await page
    .getByRole("combobox", { name: "Acento", exact: true })
    .selectOption("violet");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "violet");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Abrir menú", exact: true }).click();
  await page.getByRole("link", { name: "Reportes", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reportes." })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/studio-mobile.png",
    fullPage: true,
  });
});
test("revoked ADMIN, CSRF, invalid origin and BFF path restrictions fail closed", async ({
  page,
  request,
}) => {
  await login(page);
  const noCsrf = await page.evaluate(async () => {
    const res = await fetch("/api/v1/billing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    return res.status;
  });
  expect(noCsrf).toBe(403);
  const foreign = await request.post("/api/v1/billing", {
    headers: { origin: "https://evil.example" },
    data: {},
  });
  expect(foreign.status()).toBe(403);
  expect(
    (await request.get("/api/v1/integrations/github/webhook")).status(),
  ).toBe(400);
  await request.post("http://127.0.0.1:19081/__test/revoke", {
    headers: { origin: "http://127.0.0.1:19080" },
  });
  const revoked = await page.evaluate(async () => {
    const res = await fetch("/api/v1/billing");
    return res.status;
  });
  expect(revoked).toBe(403);
});
