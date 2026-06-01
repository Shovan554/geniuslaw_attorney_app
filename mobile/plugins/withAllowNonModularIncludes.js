/**
 * When `useFrameworks: "static"` is enabled (required for Firebase iOS pods
 * to link correctly), the React Native Firebase pods (`RNFBApp`, `RNFBMessaging`)
 * fail to compile because they `#include` React-Core headers that are not
 * exposed as modular headers. Xcode raises:
 *
 *   include of non-modular header inside framework module 'RNFBApp.*'
 *
 * The official RN Firebase workaround is to set
 * CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES on every Pod
 * target via the Podfile post_install hook. Because Expo regenerates the
 * Podfile on every prebuild, we inject that snippet here.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = '# >>> withAllowNonModularIncludes';
const SNIPPET = `
    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        build_config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      end
      # RNFirebase + useFrameworks:static + prebuilt React-Core XCFramework breaks because
      # React-Core headers get module-imported (which doesn't bring macros like RCT_EXTERN /
      # RCT_EXPORT_MODULE into the TU) and any later textual include is skipped. Also
      # RNFBApp's umbrella + "module * { export * }" claims React-Core typedefs as
      # submodule-owned, producing 'must be imported from module RNFBApp.RNFBAppModule' errors.
      # Fix: disable Clang modules for the RNFirebase pods so all <React/...> imports become
      # textual — macros resolve, no submodule ownership conflict. The framework binary is
      # still produced; only the modulemap is suppressed for these targets.
      if target.name.start_with?('RNFB')
        target.build_configurations.each do |build_config|
          build_config.build_settings['CLANG_ENABLE_MODULES'] = 'NO'
          build_config.build_settings['DEFINES_MODULE'] = 'NO'
        end
      end
    end
    # <<< withAllowNonModularIncludes
`;

module.exports = function withAllowNonModularIncludes(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');

      if (contents.includes(MARKER)) {
        return cfg;
      }

      const anchor = 'react_native_post_install(';
      const anchorIdx = contents.indexOf(anchor);
      if (anchorIdx === -1) {
        throw new Error(
          'withAllowNonModularIncludes: could not find react_native_post_install in Podfile'
        );
      }

      let depth = 1;
      let i = anchorIdx + anchor.length;
      while (i < contents.length && depth > 0) {
        const ch = contents[i];
        if (ch === '(') depth += 1;
        else if (ch === ')') depth -= 1;
        i += 1;
      }
      if (depth !== 0) {
        throw new Error(
          'withAllowNonModularIncludes: unbalanced parens in react_native_post_install call'
        );
      }

      const insertAt = i;
      contents = contents.slice(0, insertAt) + '\n' + SNIPPET + contents.slice(insertAt);

      fs.writeFileSync(podfilePath, contents);
      return cfg;
    },
  ]);
};
