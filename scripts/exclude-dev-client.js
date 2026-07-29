#!/usr/bin/env node
/**
 * Keeps expo-dev-client out of store builds.
 *
 * `expoAutolinking.useExpoModules()` in android/settings.gradle links every Expo
 * module into *all* build variants, and expo-dev-launcher's classes live in its
 * `main` source set — so the dev launcher ends up inside the production AAB.
 * Google Play's bytecode scan then reports it as a caller of the deprecated
 * edge-to-edge window APIs.
 *
 * Expo autolinking honours `expo.autolinking.exclude` in package.json, matched
 * by package name. This runs as EAS Build's `eas-build-pre-install` hook, before
 * dependencies are installed and before prebuild, and only writes the exclusion
 * on non-development profiles. Only the `expo` field is touched, so package.json
 * stays in sync with package-lock.json and `npm ci` still works.
 *
 * Local `expo run:android` / `expo start` are unaffected — this never runs there.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEV_CLIENT_MODULES = ['expo-dev-client', 'expo-dev-launcher', 'expo-dev-menu'];

const profile = process.env.EAS_BUILD_PROFILE ?? '';
const isDevelopmentBuild = profile.startsWith('development');

if (isDevelopmentBuild) {
  console.log(`[exclude-dev-client] profile "${profile}" is a development build — keeping expo-dev-client.`);
  process.exit(0);
}

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

pkg.expo ??= {};
pkg.expo.autolinking ??= {};

const exclude = new Set(pkg.expo.autolinking.exclude ?? []);
for (const moduleName of DEV_CLIENT_MODULES) {
  exclude.add(moduleName);
}
pkg.expo.autolinking.exclude = [...exclude];

fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(
  `[exclude-dev-client] profile "${profile || '(none)'}" — excluded from autolinking: ${DEV_CLIENT_MODULES.join(', ')}`,
);
