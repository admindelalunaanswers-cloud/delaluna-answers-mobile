#!/usr/bin/env node

/**
 * Finds AI documents whose generation failed because the model never finished,
 * and asks the backend to generate them again.
 *
 * Why this exists
 * ---------------
 * gemini-3.8-flash intermittently falls into a repetition loop and writes until
 * `max_output_tokens` stops it. `generateJson` (functions/src/interactions.ts)
 * refuses to store that output and the document ends in
 *
 *   status: { state: "ERROR", error: "...Generation did not complete (status: incomplete, …" }
 *
 * The user sees an error and nothing retries it. Since 2026-10-25 the natal
 * breakdown retries once by itself (`retryIncomplete`), but documents that
 * failed before that — and any other feature that hits it — stay failed. This
 * script finds them across every user and re-requests them.
 *
 * What it matches
 * ---------------
 * Documents in these five places whose `status.error` contains "did not
 * complete". That phrase is in both wordings the error has had (`Error: …` and,
 * from 2026-10-25, `IncompleteGenerationError: …`). Every other ERROR — daily
 * limit, moderation block, API failures — is left alone on purpose.
 *
 *   users/{uid}/natalChart/{id}                              generateNatalBreakdown
 *   users/{uid}/horoscope/{date}                             generateHoroscope
 *   users/{uid}/transits/{date}                              generateTransitReading
 *   users/{uid}/connections/{id}/report/{id}                 generateConnectionReport
 *   users/{uid}/connections/{id}/synastryReading/{id}        generateSynastryReading
 *
 * Chat is deliberately not covered. A failed chat turn is refunded by
 * `refundFailedChat` and the app offers Retry, which supersedes it properly; a
 * script re-request would add a turn to a thread whose history is replayed into
 * every later answer.
 *
 * How regeneration is triggered
 * -----------------------------
 * Each function claims work by `sha256(requestedAt_millis + "\n" + prompt)`
 * (`runAnchoredGeneration`). The stored prompt is left exactly as it is;
 * `requestedAt` is re-stamped and `status` cleared. A new stamp is a new hash,
 * so the trigger claims the document and generates. Nothing else on the
 * document is touched, so for a compatibility report the usual
 * `parseConnectionCompatibility` path completes the connection when the new
 * `response` lands.
 *
 * Each regeneration counts against that user's daily limit for the feature
 * (`GENERATION_DAILY_LIMITS`, 10–30 per day). A user with more failures than
 * that in one run gets "Daily limit reached" on the rest — run again tomorrow,
 * or use --limit.
 *
 * Deploy the functions first. Against the old breakdown function, a re-request
 * is one more attempt at the same 32k cap with no retry.
 *
 * Safety
 * ------
 *   - Dry run by default. Nothing is written without `--commit`.
 *   - `--project` is required and has no default.
 *   - The credential's `project_id` is checked against `--project` (same rules
 *     as regenerate-user.js; `credentials.json` at the repo root is PRODUCTION).
 *   - The scan reads only `status`. Prompts carry birth data and are never
 *     read in bulk, never printed.
 *   - Before writing, the fields it changes (`requestedAt`, `status`) are
 *     backed up per document and the backup is read back.
 *
 * Usage
 * -----
 *   node scripts/regenerate-incomplete.js --project test
 *       Dry run: lists every matching document.
 *
 *   node scripts/regenerate-incomplete.js --project test --commit --wait
 *       Re-requests them, then polls until each one completes or fails.
 *
 *   --only natal,horoscope,transits,report,synastry   subset (default: all)
 *   --uid <uid>                                       one user only
 *   --limit <n>                                       re-request at most n
 *   --wait-timeout <seconds>                          default 600
 *   --backup-dir <path>                               default ./.regen-backups
 *   --credentials <path> | --adc                      see regenerate-user.js
 */

const fs = require("fs");
const path = require("path");

const admin = require("firebase-admin");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");

const REPO_ROOT = path.resolve(__dirname, "..");

const PROJECTS = {
  test: "delaluna-answers-test",
  prod: "delaluna-answers",
};

/** The phrase both wordings of the incomplete-generation error contain. */
const INCOMPLETE = /did not complete/;

/**
 * Collection-group name → the path shape it must have. The group alone is not
 * enough: a collection called `report` anywhere else would be picked up too.
 */
const TARGETS = {
  natal: { group: "natalChart", shape: /^users\/[^/]+\/natalChart\/[^/]+$/ },
  horoscope: { group: "horoscope", shape: /^users\/[^/]+\/horoscope\/[^/]+$/ },
  transits: { group: "transits", shape: /^users\/[^/]+\/transits\/[^/]+$/ },
  report: { group: "report", shape: /^users\/[^/]+\/connections\/[^/]+\/report\/[^/]+$/ },
  synastry: {
    group: "synastryReading",
    shape: /^users\/[^/]+\/connections\/[^/]+\/synastryReading\/[^/]+$/,
  },
};

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      args._.push(a);
      continue;
    }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

// ─── Credentials (same rules as regenerate-user.js) ──────────────────────────

function resolveCredential(args, expectedProjectId) {
  if (args.adc) {
    console.log("  credential : application default (project not verifiable from key)");
    return admin.credential.applicationDefault();
  }

  const candidates = [
    [args.credentials, "--credentials"],
    [process.env.REGEN_CREDENTIALS, "$REGEN_CREDENTIALS"],
    [process.env.GOOGLE_APPLICATION_CREDENTIALS, "$GOOGLE_APPLICATION_CREDENTIALS"],
    [path.join(REPO_ROOT, "credentials.json"), "./credentials.json"],
  ].filter(([p]) => typeof p === "string" && p.length > 0);

  for (const [file, label] of candidates) {
    if (!fs.existsSync(file)) continue;

    let key;
    try {
      key = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      fail(`${label} is not readable JSON: ${file}`);
    }

    if (key.type === "authorized_user") {
      fail(
        `${label} holds user credentials, not a service account key.\n` +
          `    Re-run with --adc to use application default credentials.`,
      );
    }

    if (key.project_id !== expectedProjectId) {
      if (label === "./credentials.json") {
        console.log(
          `  skipped    : ./credentials.json belongs to ${key.project_id}, not ${expectedProjectId}`,
        );
        continue;
      }
      fail(
        `${label} belongs to project "${key.project_id}" but --project resolves to ` +
          `"${expectedProjectId}".\n    Refusing to run against the wrong project.`,
      );
    }

    console.log(`  credential : ${label} (${key.project_id})`);
    return admin.credential.cert(key);
  }

  fail(
    `No service account key for "${expectedProjectId}" found.\n` +
      `    Pass --credentials <path>, set $REGEN_CREDENTIALS, or use --adc.`,
  );
}

// ─── Scan ────────────────────────────────────────────────────────────────────

/** A path with the uid cut down, so a listing does not print whole uids. */
function shortPath(p) {
  return p.replace(/^users\/([^/]{6})[^/]*/, "users/$1…");
}

/**
 * Every document in the group whose error is the incomplete one. Reads only
 * `status` — an unfiltered collection-group read needs no index, and a
 * projection keeps prompts and responses off the wire.
 */
async function scanTarget(db, name, uidFilter) {
  const { group, shape } = TARGETS[name];
  const snap = await db.collectionGroup(group).select("status").get();
  return snap.docs.filter((d) => {
    if (!shape.test(d.ref.path)) return false;
    if (uidFilter && d.ref.path.split("/")[1] !== uidFilter) return false;
    const status = d.get("status");
    return status?.state === "ERROR" && INCOMPLETE.test(String(status.error ?? ""));
  });
}

// ─── Backup ──────────────────────────────────────────────────────────────────

function encode(value) {
  if (value instanceof Timestamp) return { __ts__: value.toMillis() };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object" && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  }
  return value;
}

// ─── Verification ────────────────────────────────────────────────────────────

async function waitForCompletion(db, refs, timeoutSeconds) {
  console.log(`\n  Waiting up to ${timeoutSeconds}s for ${refs.length} generation(s)…`);
  const deadline = Date.now() + timeoutSeconds * 1000;
  const pending = new Map(refs.map((r) => [r.path, r]));
  const results = [];

  while (pending.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10000));

    for (const [key, ref] of [...pending]) {
      const snap = await ref.get();
      const status = snap.get("status");
      // No status yet means the trigger has not claimed it; PROCESSING means
      // it is generating. Either way, keep waiting.
      if (status?.state !== "COMPLETED" && status?.state !== "ERROR") continue;

      pending.delete(key);
      const error = status.state === "ERROR" ? String(status.error ?? "").slice(0, 120) : null;
      results.push({ path: key, state: status.state, error });
      console.log(
        `    ${status.state === "COMPLETED" ? "✓" : "✗"} ${shortPath(key)}` +
          (error ? ` — ${error}` : ""),
      );
    }
  }

  for (const key of pending.keys()) {
    results.push({ path: key, state: "TIMEOUT", error: null });
    console.log(`    … ${shortPath(key)} — still pending at timeout`);
  }
  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const projectKey = args.project;
  if (!projectKey || !PROJECTS[projectKey]) {
    fail(`--project is required and must be one of: ${Object.keys(PROJECTS).join(", ")}`);
  }
  const projectId = PROJECTS[projectKey];

  const targets =
    args.only && args.only !== true
      ? String(args.only).split(",").map((s) => s.trim()).filter(Boolean)
      : Object.keys(TARGETS);
  const unknown = targets.filter((t) => !TARGETS[t]);
  if (unknown.length) fail(`Unknown --only target(s): ${unknown.join(", ")}`);

  const uidFilter = typeof args.uid === "string" ? args.uid : null;
  const limit = Number(args.limit) > 0 ? Math.floor(Number(args.limit)) : Infinity;
  const commit = args.commit === true;
  const waitTimeout = Number(args["wait-timeout"]) > 0 ? Number(args["wait-timeout"]) : 600;
  const backupRoot =
    args["backup-dir"] && args["backup-dir"] !== true
      ? path.resolve(String(args["backup-dir"]))
      : path.join(REPO_ROOT, ".regen-backups");

  console.log("\n  Delaluna — regenerate incomplete generations\n");
  console.log(`  mode       : ${commit ? "COMMIT (writes)" : "DRY RUN (no writes)"}`);
  console.log(`  project    : ${projectId}  [--project ${projectKey}]`);
  console.log(`  targets    : ${targets.join(", ")}`);
  if (uidFilter) console.log(`  uid        : ${uidFilter}`);
  if (limit !== Infinity) console.log(`  limit      : ${limit}`);

  admin.initializeApp({ credential: resolveCredential(args, projectId), projectId });
  const db = getFirestore();

  // ── 1. Scan ──
  console.log("\n  ── Scanning ──");
  let found = [];
  for (const name of targets) {
    const docs = await scanTarget(db, name, uidFilter);
    console.log(`  ${name.padEnd(10)} : ${docs.length} incomplete`);
    found.push(...docs.map((d) => ({ name, ref: d.ref })));
  }

  if (found.length === 0) {
    console.log("\n  Nothing to regenerate.\n");
    return;
  }

  const users = new Set(found.map((f) => f.ref.path.split("/")[1]));
  console.log(`\n  ${found.length} document(s) across ${users.size} user(s):`);
  for (const f of found) console.log(`    ${f.name.padEnd(10)} ${shortPath(f.ref.path)}`);

  if (found.length > limit) {
    console.log(`\n  --limit ${limit}: taking the first ${limit}, leaving ${found.length - limit}.`);
    found = found.slice(0, limit);
  }

  if (!commit) {
    console.log(
      `\n  Dry run complete — ${found.length} document(s) would be re-requested.` +
        `\n  Re-run with --commit to apply, and add --wait to watch them finish.\n`,
    );
    return;
  }

  // ── 2. Back up the fields about to change, and read the backup back ──
  // Re-read each document in full here, one at a time, rather than in the scan:
  // only these few documents' prompts are ever loaded, and they go to disk only.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(backupRoot, "incomplete", stamp);
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, "documents.json");

  const documents = {};
  const ready = [];
  for (const f of found) {
    const snap = await f.ref.get();
    const data = snap.data() ?? {};
    // Re-check: it may have been regenerated or rewritten since the scan.
    if (data.status?.state !== "ERROR" || !INCOMPLETE.test(String(data.status?.error ?? ""))) {
      console.log(`  skipped ${shortPath(f.ref.path)} — no longer in the incomplete state`);
      continue;
    }
    if (typeof data.prompt !== "string" || !data.prompt) {
      console.log(`  skipped ${shortPath(f.ref.path)} — no stored prompt to regenerate from`);
      continue;
    }
    documents[f.ref.path] = encode({ requestedAt: data.requestedAt ?? null, status: data.status });
    ready.push(f);
  }

  fs.writeFileSync(
    file,
    JSON.stringify({ project: projectId, capturedAt: new Date().toISOString(), documents }, null, 2),
  );
  const verify = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Object.keys(verify.documents).length !== ready.length) {
    fail("Backup verification failed. Nothing has been written.");
  }
  console.log(`\n  ✓ backup ${path.relative(REPO_ROOT, file)} (${ready.length} doc(s), verified)`);

  // ── 3. Re-request ──
  console.log("\n  ── Re-requesting ──");
  for (const f of ready) {
    await f.ref.update({
      requestedAt: FieldValue.serverTimestamp(),
      status: FieldValue.delete(),
    });
    console.log(`  → ${f.name.padEnd(10)} ${shortPath(f.ref.path)}`);
  }

  if (!args.wait) {
    console.log("\n  Generation runs asynchronously. Re-run with --wait to watch results.\n");
    return;
  }

  // ── 4. Verify ──
  const results = await waitForCompletion(db, ready.map((f) => f.ref), waitTimeout);
  const done = results.filter((r) => r.state === "COMPLETED").length;
  console.log(`\n  ${done} of ${results.length} completed.`);
  const stillIncomplete = results.filter((r) => r.error && INCOMPLETE.test(r.error)).length;
  if (stillIncomplete) {
    console.log(`  ${stillIncomplete} looped again — safe to re-run this script for them.`);
  }
  console.log("");
}

main().catch((err) => {
  console.error(`\n  ✗ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
