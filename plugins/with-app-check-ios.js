const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '// app-check: must precede FirebaseApp.configure()';
const INVOCATION = `${MARKER}\nRNFBAppCheckModule.sharedInstance()\n`;
const HEADER_IMPORT = '#import <RNFBAppCheckModule.h>';

// The @react-native-firebase/app plugin's generated block, which holds the one
// FirebaseApp.configure() call. App Check's provider factory has to be installed
// before it, so the invocation goes directly above this line.
const ANCHOR = '// @generated begin @react-native-firebase/app-didFinishLaunchingWithOptions';

// Replaces the plugin @react-native-firebase/app-check ships, which is NOT listed
// in app.config.js on purpose. On a Swift AppDelegate (24.1.1) it inserts
// `RNFBAppCheckModule.sharedInstance()` *and a second* `FirebaseApp.configure()`
// after the existing one, and configuring the default app twice raises an
// exception at launch. It also puts the App Check call after configure, which is
// the wrong order even without the crash.
//
// Must be listed BEFORE "@react-native-firebase/app" in app.config.js: dangerous
// mods run last-registered-first, so listing it earlier makes it run after the
// app plugin has written the anchor. Without the anchor it fails the prebuild
// rather than guess, since a missing or misplaced call fails silently at runtime
// — App Check just never produces a token.
function patchAppDelegate(contents) {
  if (contents.includes(MARKER)) return contents;

  const index = contents.indexOf(ANCHOR);
  if (index === -1) {
    throw new Error(
      'with-app-check-ios: the @react-native-firebase/app block was not found in ' +
        'AppDelegate.swift. List this plugin before "@react-native-firebase/app" in ' +
        'app.config.js, and re-check it if the Expo template changed.'
    );
  }
  return contents.slice(0, index) + INVOCATION + contents.slice(index);
}

// RNFBAppCheck is an Obj-C pod with no Swift module, so Swift reaches the class
// through the bridging header.
function patchBridgingHeader(contents) {
  return contents.includes(HEADER_IMPORT) ? contents : `${contents.trimEnd()}\n${HEADER_IMPORT}\n`;
}

module.exports = function withAppCheckIos(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const root = cfg.modRequest.platformProjectRoot;
      const project = cfg.modRequest.projectName;

      const appDelegate = path.join(root, project, 'AppDelegate.swift');
      fs.writeFileSync(appDelegate, patchAppDelegate(fs.readFileSync(appDelegate, 'utf8')));

      const header = path.join(root, project, `${project}-Bridging-Header.h`);
      fs.writeFileSync(header, patchBridgingHeader(fs.readFileSync(header, 'utf8')));
      return cfg;
    },
  ]);
};

module.exports.patchAppDelegate = patchAppDelegate;
module.exports.patchBridgingHeader = patchBridgingHeader;
