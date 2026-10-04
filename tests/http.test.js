import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SEEDED_IDS = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003"
];

async function launchServer(extraEnv = {}) {
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: "0", DEMO_READ_ONLY: "false", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  let errorOutput = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    errorOutput += chunk;
  });
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server did not start within 8 seconds.")), 8000);
    const inspect = () => {
      const match = output.match(/0\.0\.0\.0:(\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(Number(match[1]));
      }
    };
    child.stdout.on("data", inspect);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error("Server exited before listening with code " + code + ". " + errorOutput));
    });
    inspect();
  });
  return {
    child,
    baseUrl: "http://127.0.0.1:" + port,
    async stop() {
      if (child.exitCode !== null) {
        return;
      }
      const stopped = once(child, "exit");
      let timer;
      child.kill("SIGTERM");
      try {
        await Promise.race([
          stopped,
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("Server did not stop within 5 seconds.")), 5000);
            timer.unref();
          })
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
  };
}

async function jsonRequest(baseUrl, pathname, method, body) {
  const response = await fetch(baseUrl + pathname, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const content = response.status === 204 ? null : await response.json();
  return { response, content };
}

test("HTTP task CRUD validates bounded input and enforces the task limit", async (t) => {
  const server = await launchServer();
  t.after(() => server.stop());

  const ready = await fetch(server.baseUrl + "/ready");
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: "ready", storage: "memory" });

  const config = await fetch(server.baseUrl + "/api/config");
  assert.deepEqual(await config.json(), { readOnly: false, maxTasks: 100, storage: "memory" });

  const initial = await fetch(server.baseUrl + "/api/tasks");
  const initialTasks = await initial.json();
  assert.deepEqual(initialTasks.map((task) => task.id), SEEDED_IDS);
  assert.deepEqual(initialTasks.map((task) => task.status), ["todo", "doing", "done"]);

  const created = await jsonRequest(server.baseUrl, "/api/tasks", "POST", { title: "  Prepare the release  " });
  assert.equal(created.response.status, 201);
  assert.equal(created.content.title, "Prepare the release");
  assert.equal(created.content.status, "todo");

  const updated = await jsonRequest(server.baseUrl, "/api/tasks/" + created.content.id, "PATCH", {
    title: "Prepare the sample release",
    status: "doing"
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.content.title, "Prepare the sample release");
  assert.equal(updated.content.status, "doing");

  for (const body of [
    { title: "" },
    { title: "   " },
    { title: "x".repeat(121) },
    { title: "Valid title", status: "blocked" },
    { title: "Valid title", extra: "field" }
  ]) {
    const invalid = await jsonRequest(server.baseUrl, "/api/tasks", "POST", body);
    assert.equal(invalid.response.status, 400);
  }

  const wrongContentType = await fetch(server.baseUrl + "/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "title"
  });
  assert.equal(wrongContentType.status, 415);

  const tooLarge = await fetch(server.baseUrl + "/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "x".repeat(5000) })
  });
  assert.equal(tooLarge.status, 413);

  const missingUpdate = await jsonRequest(server.baseUrl, "/api/tasks/00000000-0000-4000-8000-000000000099", "PATCH", {
    status: "done"
  });
  assert.equal(missingUpdate.response.status, 404);

  const deleted = await jsonRequest(server.baseUrl, "/api/tasks/" + created.content.id, "DELETE");
  assert.equal(deleted.response.status, 204);
  const missingDelete = await jsonRequest(server.baseUrl, "/api/tasks/" + created.content.id, "DELETE");
  assert.equal(missingDelete.response.status, 404);

  const current = await (await fetch(server.baseUrl + "/api/tasks")).json();
  while (current.length < 100) {
    const next = await jsonRequest(server.baseUrl, "/api/tasks", "POST", { title: "Capacity task " + current.length });
    assert.equal(next.response.status, 201);
    current.push(next.content);
  }
  const atLimit = await jsonRequest(server.baseUrl, "/api/tasks", "POST", { title: "One task too many" });
  assert.equal(atLimit.response.status, 409);
  assert.equal((await (await fetch(server.baseUrl + "/api/tasks")).json()).length, 100);

  const appJs = await (await fetch(server.baseUrl + "/app.js")).text();
  assert.match(appJs, /title\.textContent = task\.title/);
  assert.doesNotMatch(appJs, /\.innerHTML\s*=/);
});

test("read-only mode rejects mutations on known and unknown paths", async (t) => {
  const server = await launchServer({ DEMO_READ_ONLY: "true" });
  t.after(() => server.stop());

  const config = await (await fetch(server.baseUrl + "/api/config")).json();
  assert.equal(config.readOnly, true);

  const readonlyHtml = await (await fetch(server.baseUrl + "/")).text();
  assert.match(readonlyHtml, /id="new-title"[^>]*disabled/);

  const requests = [
    ["POST", "/api/tasks", { title: "Should not be added" }],
    ["PATCH", "/api/tasks/" + SEEDED_IDS[0], { status: "done" }],
    ["DELETE", "/api/tasks/" + SEEDED_IDS[0]],
    ["PUT", "/unmapped/write/path", { value: true }],
    ["OPTIONS", "/ready"]
  ];
  for (const [method, pathname, body] of requests) {
    const { response, content } = await jsonRequest(server.baseUrl, pathname, method, body);
    assert.equal(response.status, 403, method + " " + pathname);
    assert.equal(content.error.code, "demo_read_only");
  }
  assert.equal((await (await fetch(server.baseUrl + "/api/tasks")).json()).length, 3);
});

test("in-memory tasks reset to the sample board after an app restart", async (t) => {
  let server = await launchServer();
  const created = await jsonRequest(server.baseUrl, "/api/tasks", "POST", { title: "Temporary work" });
  assert.equal(created.response.status, 201);
  const temporaryId = created.content.id;
  await server.stop();

  server = await launchServer();
  t.after(() => server.stop());
  const tasks = await (await fetch(server.baseUrl + "/api/tasks")).json();
  assert.deepEqual(tasks.map((task) => task.id), SEEDED_IDS);
  assert.equal(tasks.some((task) => task.id === temporaryId), false);
});
