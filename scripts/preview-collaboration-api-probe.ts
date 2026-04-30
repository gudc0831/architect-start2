import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

type CookieJar = Map<string, string>;

type ProbeUser = {
  email: string;
  jar: CookieJar;
};

type ProbeResponse = {
  status: number;
  body: unknown;
};

type ProbeResult = {
  label: string;
  ok: boolean;
  status?: number;
  code?: string | null;
  detail?: string;
};

const projectBId = process.env.PREVIEW_PROJECT_B_ID?.trim() || "2150d595-0570-4309-9198-031e90668af4";
const previewBaseUrl = requireEnv("PREVIEW_BASE_URL").replace(/\/$/, "");
const vercelShareUrl = process.env.VERCEL_SHARE_URL?.trim() || null;
const previewOrigin = new URL(previewBaseUrl).origin;
const previewHost = new URL(previewBaseUrl).hostname;
const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseAnonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const supabaseServiceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabaseProjectRef = new URL(supabaseUrl).hostname.split(".")[0];
const supabaseAuthCookieName = `sb-${supabaseProjectRef}-auth-token`;

const accounts = {
  admin: process.env.PREVIEW_ADMIN_EMAIL?.trim() || "gudc083111@gmail.com",
  manager: process.env.PREVIEW_MANAGER_EMAIL?.trim() || "gudc08311@gmail.com",
  viewer: process.env.PREVIEW_VIEWER_EMAIL?.trim() || "preview-step11-viewer@architect-start.test",
  editor: process.env.PREVIEW_EDITOR_EMAIL?.trim() || "preview-step11-editor@architect-start.test",
  pending: process.env.PREVIEW_PENDING_EMAIL?.trim() || "preview-step11-pending@architect-start.test",
  noAccess: process.env.PREVIEW_NO_ACCESS_EMAIL?.trim() || "gudc0831111@gmail.com",
};

const results: ProbeResult[] = [];
const createdTaskIds: string[] = [];

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function setCookieFromHeader(jar: CookieJar, setCookieHeader: string) {
  const [pair] = setCookieHeader.split(";");
  const separatorIndex = pair.indexOf("=");
  if (separatorIndex <= 0) {
    return;
  }

  const name = pair.slice(0, separatorIndex).trim();
  const value = pair.slice(separatorIndex + 1).trim();
  if (name) {
    jar.set(name, value);
  }
}

function getSetCookieHeaders(headers: Headers) {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") {
    return getSetCookie.call(headers);
  }

  const value = headers.get("set-cookie");
  return value ? [value] : [];
}

function storeResponseCookies(jar: CookieJar, response: Response) {
  for (const setCookie of getSetCookieHeaders(response.headers)) {
    setCookieFromHeader(jar, setCookie);
  }
}

function cookieHeader(jar: CookieJar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function createCookieChunks(key: string, value: string, chunkSize = 3180) {
  let encodedValue = encodeURIComponent(value);
  if (encodedValue.length <= chunkSize) {
    return [{ name: key, value }];
  }

  const chunks: string[] = [];
  while (encodedValue.length > 0) {
    let encodedChunkHead = encodedValue.slice(0, chunkSize);
    const lastEscapePos = encodedChunkHead.lastIndexOf("%");
    if (lastEscapePos > chunkSize - 3) {
      encodedChunkHead = encodedChunkHead.slice(0, lastEscapePos);
    }

    let valueHead = "";
    while (encodedChunkHead.length > 0) {
      try {
        valueHead = decodeURIComponent(encodedChunkHead);
        break;
      } catch (error) {
        if (error instanceof URIError && encodedChunkHead.at(-3) === "%" && encodedChunkHead.length > 3) {
          encodedChunkHead = encodedChunkHead.slice(0, encodedChunkHead.length - 3);
          continue;
        }

        throw error;
      }
    }

    chunks.push(valueHead);
    encodedValue = encodedValue.slice(encodedChunkHead.length);
  }

  return chunks.map((chunk, index) => ({ name: `${key}.${index}`, value: chunk }));
}

function samePreviewHost(url: URL) {
  return url.hostname === previewHost;
}

async function applyVercelPreviewBypass(jar: CookieJar) {
  if (!vercelShareUrl) {
    return;
  }

  let currentUrl = new URL(vercelShareUrl);
  for (let index = 0; index < 5; index += 1) {
    const response = await fetch(currentUrl, {
      headers: cookieHeader(jar) ? { cookie: cookieHeader(jar) } : undefined,
      redirect: "manual",
    });
    storeResponseCookies(jar, response);

    const location = response.headers.get("location");
    if (!location || response.status < 300 || response.status >= 400) {
      return;
    }

    const nextUrl = new URL(location, currentUrl);
    if (!samePreviewHost(nextUrl)) {
      return;
    }

    currentUrl = nextUrl;
  }
}

async function addSupabaseSession(jar: CookieJar, email: string) {
  const admin = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const linkResult = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkResult.error) {
    throw linkResult.error;
  }

  const tokenHash = linkResult.data.properties?.hashed_token;
  if (!tokenHash) {
    throw new Error(`Missing token hash for ${email}`);
  }

  const verifyResult = await anon.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (verifyResult.error) {
    throw verifyResult.error;
  }

  const session = verifyResult.data.session;
  if (!session) {
    throw new Error(`Missing Supabase session for ${email}`);
  }

  const value = JSON.stringify(session);
  for (const key of [supabaseAuthCookieName, `${supabaseAuthCookieName}.0`, `${supabaseAuthCookieName}.1`, `${supabaseAuthCookieName}.2`]) {
    jar.delete(key);
  }

  for (const chunk of createCookieChunks(supabaseAuthCookieName, value)) {
    jar.set(chunk.name, encodeURIComponent(chunk.value));
  }
}

async function createProbeUser(email: string): Promise<ProbeUser> {
  const jar = new Map<string, string>();
  await applyVercelPreviewBypass(jar);
  await addSupabaseSession(jar, email);
  return { email, jar };
}

async function request(user: ProbeUser, method: string, path: string, body?: unknown): Promise<ProbeResponse> {
  const headers: Record<string, string> = {
    accept: "application/json",
    cookie: cookieHeader(user.jar),
  };

  if (method !== "GET" && method !== "HEAD") {
    headers["content-type"] = "application/json";
    headers.origin = previewOrigin;
    headers.referer = `${previewOrigin}/`;
  }

  const response = await fetch(`${previewBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  storeResponseCookies(user.jar, response);

  const text = await response.text();
  let parsed: unknown = text;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text.slice(0, 200);
    }
  }

  return { status: response.status, body: parsed };
}

async function selectProject(user: ProbeUser) {
  return request(user, "POST", "/api/projects/select", { projectId: projectBId });
}

function errorCode(body: unknown) {
  if (!body || typeof body !== "object") {
    return null;
  }

  const error = (body as { error?: { code?: unknown } }).error;
  return typeof error?.code === "string" ? error.code : null;
}

function dataOf<T = unknown>(body: unknown): T | null {
  if (!body || typeof body !== "object" || !("data" in body)) {
    return null;
  }

  return (body as { data: T }).data;
}

function record(label: string, ok: boolean, response?: ProbeResponse, detail?: string) {
  results.push({
    label,
    ok,
    status: response?.status,
    code: response ? errorCode(response.body) : null,
    detail,
  });
}

function expectStatus(label: string, response: ProbeResponse, expectedStatus: number, expectedCode?: string) {
  const code = errorCode(response.body);
  const ok = response.status === expectedStatus && (expectedCode ? code === expectedCode : true);
  record(label, ok, response, expectedCode ? `expected ${expectedStatus}/${expectedCode}` : `expected ${expectedStatus}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function listLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function firstWorkTypeCode(projectPayload: unknown) {
  if (!isObject(projectPayload)) {
    return "coordination";
  }

  const definitions = projectPayload.workTypeDefinitions;
  if (!Array.isArray(definitions)) {
    return "coordination";
  }

  const first = definitions.find((definition) => isObject(definition) && typeof definition.code === "string");
  return isObject(first) && typeof first.code === "string" ? first.code : "coordination";
}

async function createProbeTask(editor: ProbeUser, workType: string) {
  const response = await request(editor, "POST", "/api/tasks", {
    workType,
    issueTitle: `Step 11 API probe ${new Date().toISOString()}`,
    isDaily: true,
    status: "todo",
  });
  expectStatus("editor can create task", response, 201);

  const task = dataOf<{ id?: unknown }>(response.body);
  if (task && typeof task.id === "string") {
    createdTaskIds.push(task.id);
    return task.id;
  }

  return null;
}

async function cleanupTask(editor: ProbeUser, taskId: string) {
  const trashResponse = await request(editor, "POST", `/api/tasks/${encodeURIComponent(taskId)}/trash`);
  const deleteResponse = await request(editor, "DELETE", `/api/tasks/${encodeURIComponent(taskId)}`);
  record(
    "cleanup removes probe task",
    (trashResponse.status === 200 || trashResponse.status === 404 || errorCode(trashResponse.body) === "TASK_NOT_FOUND") &&
      deleteResponse.status === 204,
    deleteResponse,
    "best-effort cleanup through trash",
  );
}

async function cleanupExistingProbeTasks(editor: ProbeUser) {
  let cleaned = 0;
  const activeResponse = await request(editor, "GET", "/api/tasks");
  const activeTasks = dataOf<unknown[]>(activeResponse.body) ?? [];

  for (const task of activeTasks) {
    if (!isObject(task) || typeof task.id !== "string" || typeof task.issueTitle !== "string") {
      continue;
    }

    if (task.issueTitle.startsWith("Step 11 API probe ")) {
      await cleanupTask(editor, task.id);
      cleaned += 1;
    }
  }

  const trashResponse = await request(editor, "GET", "/api/tasks?scope=trash");
  const trashTasks = dataOf<unknown[]>(trashResponse.body) ?? [];
  for (const task of trashTasks) {
    if (!isObject(task) || typeof task.id !== "string" || typeof task.issueTitle !== "string") {
      continue;
    }

    if (task.issueTitle.startsWith("Step 11 API probe ")) {
      const deleteResponse = await request(editor, "DELETE", `/api/tasks/${encodeURIComponent(task.id)}`);
      record("cleanup removes trashed probe task", deleteResponse.status === 204, deleteResponse, "best-effort cleanup");
      cleaned += 1;
    }
  }

  record("pre-existing probe tasks cleaned", true, undefined, `count=${cleaned}`);
}

async function releaseLease(user: ProbeUser, taskId: string, fieldKey: string) {
  await request(user, "DELETE", "/api/edit-leases", {
    targetType: "taskField",
    targetId: taskId,
    fieldKey,
  });
}

async function main() {
  console.log("Preview collaboration API probe");
  console.log(`Target: ${previewBaseUrl}`);
  console.log(`Project: ${projectBId}`);

  const [viewer, editor, manager, pending, noAccess, admin] = await Promise.all([
    createProbeUser(accounts.viewer),
    createProbeUser(accounts.editor),
    createProbeUser(accounts.manager),
    createProbeUser(accounts.pending),
    createProbeUser(accounts.noAccess),
    createProbeUser(accounts.admin),
  ]);

  const viewerMe = await request(viewer, "GET", "/api/auth/me");
  expectStatus("viewer /api/auth/me", viewerMe, 200);
  const viewerMeData = dataOf<{ email?: unknown; accessStatus?: unknown }>(viewerMe.body);
  record(
    "viewer app session identity",
    viewerMeData?.email === accounts.viewer && viewerMeData.accessStatus === "active",
    viewerMe,
    "email active",
  );

  const viewerProjects = await selectProject(viewer);
  expectStatus("viewer can select Project B", viewerProjects, 200);
  const viewerProjectPayload = dataOf(viewerProjects.body);

  const viewerMembers = await request(viewer, "GET", "/api/project/members");
  expectStatus("viewer can read project members", viewerMembers, 200);
  const viewerMemberData = dataOf<{ members?: unknown }>(viewerMembers.body);
  const members = isObject(viewerMemberData) ? viewerMemberData.members : null;
  const hasMemberEmail =
    Array.isArray(members) &&
    members.some((member) => isObject(member) && typeof member.email === "string" && member.email.includes("@"));
  record("viewer sees member emails", hasMemberEmail, viewerMembers, `members=${listLength(members)}`);

  const viewerTasks = await request(viewer, "GET", "/api/tasks");
  expectStatus("viewer can read tasks", viewerTasks, 200);

  const viewerTaskCreate = await request(viewer, "POST", "/api/tasks", {
    workType: firstWorkTypeCode(viewerProjectPayload),
    issueTitle: "Viewer should not create this",
    isDaily: true,
    status: "todo",
  });
  expectStatus("viewer cannot create task", viewerTaskCreate, 403, "PROJECT_EDITOR_REQUIRED");

  const editorSelect = await selectProject(editor);
  expectStatus("editor can select Project B", editorSelect, 200);
  await cleanupExistingProbeTasks(editor);

  const editorAdminMembers = await request(editor, "GET", `/api/admin/projects/${projectBId}/members`);
  expectStatus("editor cannot use manager members route", editorAdminMembers, 403, "PROJECT_MANAGER_REQUIRED");

  const taskId = await createProbeTask(editor, firstWorkTypeCode(dataOf(editorSelect.body)));
  if (taskId) {
    const viewerLease = await request(viewer, "POST", "/api/edit-leases", {
      targetType: "taskField",
      targetId: taskId,
      fieldKey: "issueTitle",
    });
    expectStatus("viewer cannot acquire edit lease", viewerLease, 403, "PROJECT_EDITOR_REQUIRED");

    const editorLease = await request(editor, "POST", "/api/edit-leases", {
      targetType: "taskField",
      targetId: taskId,
      fieldKey: "issueTitle",
    });
    expectStatus("editor can acquire edit lease", editorLease, 200);

    const managerSelect = await selectProject(manager);
    expectStatus("manager can select Project B", managerSelect, 200);

    const managerLeaseConflict = await request(manager, "POST", "/api/edit-leases", {
      targetType: "taskField",
      targetId: taskId,
      fieldKey: "issueTitle",
    });
    expectStatus("manager blocked from same-field edit lease", managerLeaseConflict, 409, "EDIT_LEASE_HELD");

    const managerDifferentLease = await request(manager, "POST", "/api/edit-leases", {
      targetType: "taskField",
      targetId: taskId,
      fieldKey: "decision",
    });
    expectStatus("manager can lease different field", managerDifferentLease, 200);

    await releaseLease(manager, taskId, "decision");
    await releaseLease(editor, taskId, "issueTitle");
    await cleanupTask(editor, taskId);
  }

  const managerMembers = await request(manager, "GET", `/api/admin/projects/${projectBId}/members`);
  expectStatus("manager can use manager members route", managerMembers, 200);

  const managerInviteManager = await request(manager, "POST", "/api/invitations", {
    projectId: projectBId,
    email: `preview-step11-denied-${Date.now()}@architect-start.test`,
    role: "manager",
  });
  expectStatus("manager cannot invite manager", managerInviteManager, 403, "INVITATION_ROLE_FORBIDDEN");

  const managerAccessRequests = await request(manager, "GET", `/api/access-requests?projectId=${encodeURIComponent(projectBId)}`);
  expectStatus("manager can list access requests", managerAccessRequests, 200);
  const managerRequest = (dataOf<unknown[]>(managerAccessRequests.body) ?? []).find(
    (item) => isObject(item) && item.email === "preview-step11-manager-request@architect-start.test" && item.status === "pending",
  );
  if (isObject(managerRequest) && typeof managerRequest.id === "string") {
    const managerApproveManager = await request(manager, "PATCH", `/api/access-requests/${managerRequest.id}`, {
      action: "approve",
      projectId: projectBId,
      role: "manager",
    });
    expectStatus("manager cannot approve manager access request", managerApproveManager, 403, "ACCESS_REQUEST_ROLE_FORBIDDEN");
  } else {
    record("manager-request fixture is available", false, managerAccessRequests, "pending fixture not found");
  }

  const pendingMe = await request(pending, "GET", "/api/auth/me");
  expectStatus("pending /api/auth/me", pendingMe, 200);
  const pendingMeData = dataOf<{ accessStatus?: unknown }>(pendingMe.body);
  record("pending profile remains pending", pendingMeData?.accessStatus === "pending", pendingMe, "accessStatus=pending");

  const pendingProjects = await request(pending, "GET", "/api/projects");
  expectStatus("pending projects endpoint does not fail", pendingProjects, 200);
  const pendingProjectsData = dataOf<{ availableProjects?: unknown; currentProjectId?: unknown }>(pendingProjects.body);
  record(
    "pending user sees no project inventory",
    Array.isArray(pendingProjectsData?.availableProjects) &&
      pendingProjectsData.availableProjects.length === 0 &&
      pendingProjectsData.currentProjectId === null,
    pendingProjects,
    "no project names exposed",
  );

  const pendingManagerRequest = await request(pending, "POST", "/api/access-requests", {
    requestedRole: "manager",
    message: "manager request should be denied",
  });
  expectStatus("pending cannot self-request manager", pendingManagerRequest, 403, "ACCESS_REQUEST_MANAGER_FORBIDDEN");

  const noAccessProjects = await request(noAccess, "GET", "/api/projects");
  expectStatus("no-access projects endpoint does not fail", noAccessProjects, 200);
  const noAccessProjectsData = dataOf<{ availableProjects?: unknown; currentProjectId?: unknown }>(noAccessProjects.body);
  record(
    "no-access user sees no project inventory",
    Array.isArray(noAccessProjectsData?.availableProjects) &&
      noAccessProjectsData.availableProjects.length === 0 &&
      noAccessProjectsData.currentProjectId === null,
    noAccessProjects,
    "no project names exposed",
  );

  const noAccessProject = await request(noAccess, "GET", "/api/project");
  expectStatus("no-access current project denied", noAccessProject, 403, "PROJECT_ACCESS_DENIED");

  const adminAccessRequests = await request(admin, "GET", "/api/access-requests");
  expectStatus("admin can list global access requests", adminAccessRequests, 200);

  const failed = results.filter((result) => !result.ok);
  for (const result of results) {
    const status = result.status === undefined ? "" : ` status=${result.status}`;
    const code = result.code ? ` code=${result.code}` : "";
    const detail = result.detail ? ` (${result.detail})` : "";
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.label}${status}${code}${detail}`);
  }

  if (failed.length > 0) {
    console.error(`Probe failed: ${failed.length} failing check(s).`);
    process.exitCode = 1;
  } else {
    console.log("Probe passed.");
  }
}

main().catch(async (error: unknown) => {
  if (createdTaskIds.length > 0) {
    console.error("Probe aborted after creating task fixture; cleanup may be needed.");
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
