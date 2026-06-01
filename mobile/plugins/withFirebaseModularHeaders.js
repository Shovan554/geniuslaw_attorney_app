/**
 * Firebase iOS SDK v11+ ships `FirebaseCoreInternal` as a Swift pod that
 * depends on `GoogleUtilities`. With `useFrameworks: "static"` (which the
 * Firebase iOS pods require), CocoaPods refuses to integrate a Swift pod
 * whose dependencies don't expose modular headers:
 *
 *   The Swift pod `FirebaseCoreInternal` depends upon `GoogleUtilities`,
 *   which does not define modules.
 *
 * The fix is to call `use_modular_headers!` inside the target block. Because
 * Expo regenerates the Podfile on every prebuild, we inject the line here.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# >>> withFirebaseModularHeaders';
const SNIPPET = `
  ${MARKER}
  use_modular_headers!
  # <<< withFirebaseModularHeaders
`;

module.exports = function withFirebaseModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes(MARKER)) {
        return cfg;
      }

      const anchor = 'use_expo_modules!';
      const anchorIdx = contents.indexOf(anchor);
      if (anchorIdx === -1) {
        throw new Error(
          'withFirebaseModularHeaders: could not find use_expo_modules! in Podfile'
        );
      }

      const insertAt = anchorIdx + anchor.length;
      contents = contents.slice(0, insertAt) + '\n' + SNIPPET + contents.slice(insertAt);

      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
};
