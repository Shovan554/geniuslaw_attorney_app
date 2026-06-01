const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const BRIDGE_HEADER = 'VoipPushBridge.h';
const BRIDGE_IMPL = 'VoipPushBridge.m';

function copyBridgeFiles(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot; // mobile/
      const iosRoot = cfg.modRequest.platformProjectRoot; // mobile/ios
      const appName = cfg.modRequest.projectName; // e.g. "GeniusLaw"
      const targetDir = path.join(iosRoot, appName);
      const srcDir = path.join(projectRoot, 'plugins', 'withVoipPush');

      for (const f of [BRIDGE_HEADER, BRIDGE_IMPL]) {
        const src = path.join(srcDir, f);
        const dst = path.join(targetDir, f);
        if (!fs.existsSync(src)) {
          throw new Error(`[withVoipPush] missing source file: ${src}`);
        }
        fs.copyFileSync(src, dst);
      }
      return cfg;
    },
  ]);
}

function addToXcodeProject(config) {
  return withXcodeProject(config, (cfg) => {
    const proj = cfg.modResults; // pbxProject instance
    const appName = cfg.modRequest.projectName;

    // Find the source-folder group (path === appName), NOT the top-level
    // project group (which also has name === appName but no path — files
    // added there land at ios/<file> instead of ios/<appName>/<file>).
    const groupKey =
      proj.findPBXGroupKey({ path: appName }) ||
      proj.findPBXGroupKey({ name: appName });
    if (!groupKey) {
      throw new Error(`[withVoipPush] could not find PBXGroup for ${appName}`);
    }

    // Expo's generated project lists existing files (e.g. AppDelegate.swift)
    // with `path = GeniusLaw/AppDelegate.swift` because the parent PBXGroup
    // has no `path` attribute — only `name`. Without the folder prefix, the
    // build system resolves the file at the project root (ios/) instead of
    // ios/GeniusLaw/ and fails with "Build input file cannot be found".
    const headerPath = `${appName}/${BRIDGE_HEADER}`;
    const implPath = `${appName}/${BRIDGE_IMPL}`;

    if (!proj.hasFile(headerPath)) {
      proj.addHeaderFile(headerPath, { target: proj.getFirstTarget().uuid }, groupKey);
    }
    if (!proj.hasFile(implPath)) {
      proj.addSourceFile(implPath, { target: proj.getFirstTarget().uuid }, groupKey);
    }

    return cfg;
  });
}

const withVoipPush = (config) => {
  config = copyBridgeFiles(config);
  config = addToXcodeProject(config);
  return config;
};

module.exports = withVoipPush;
