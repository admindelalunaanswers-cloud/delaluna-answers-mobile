const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# fmt-consteval-fix';

// fmt 11.0.2 does not compile under Xcode 26's clang: FMT_STRING wraps the
// format string in a type whose consteval constructor the newer frontend
// rejects, so format-inl.h fails with "call to consteval function ... is not a
// constant expression". Upstream fixed it in fmt 11.1, which we cannot take —
// RCT-Folly pins `fmt "11.0.2"` exactly.
//
// Rewrite the FMT_STRING call sites to plain literals. That is the path the
// rest of fmt already uses and it is still compile-time checked, since
// format_to's own format_string parameter is consteval.
//
// Runs in post_install so it lands after CocoaPods has downloaded fmt, and is
// re-applied on every pod install because Pods/ is not checked in. CocoaPods
// leaves downloaded sources read-only (444), so the chmod is required — without
// it File.write raises EACCES and fails the install.
const SNIPPET = `    ${MARKER}
    fmt_inl = File.join(__dir__, 'Pods', 'fmt', 'include', 'fmt', 'format-inl.h')
    if File.exist?(fmt_inl)
      fmt_src = File.read(fmt_inl)
      fmt_patched = fmt_src.gsub(/FMT_STRING\\((".*?")\\)/) { $1 }
      if fmt_patched != fmt_src
        File.chmod(0644, fmt_inl)
        File.write(fmt_inl, fmt_patched)
      end
    end
`;

const ANCHOR = 'post_install do |installer|\n';

function patchPodfile(contents) {
  if (contents.includes(MARKER)) return contents;

  const index = contents.indexOf(ANCHOR);
  if (index === -1) {
    throw new Error(
      'with-fmt-consteval-fix: no post_install block found in the Podfile. ' +
        'The Expo template changed — re-check the fmt patch against the new Podfile.'
    );
  }

  const insertAt = index + ANCHOR.length;
  return contents.slice(0, insertAt) + SNIPPET + contents.slice(insertAt);
}

module.exports = function withFmtConstevalFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      fs.writeFileSync(podfile, patchPodfile(fs.readFileSync(podfile, 'utf8')));
      return cfg;
    },
  ]);
};

module.exports.patchPodfile = patchPodfile;
