/**
 * expo-notifications and @react-native-firebase/messaging both inject a
 * <meta-data android:name="com.google.firebase.messaging.default_notification_color">
 * tag into AndroidManifest.xml with different resource values. The manifest
 * merger refuses to pick a winner and the build fails.
 *
 * This plugin adds `tools:replace="android:resource"` to the meta-data tags
 * expo-notifications writes (default_notification_color and
 * default_notification_icon) so they override the firebase-messaging
 * defaults. expo-notifications' values are the ones our app actually wants
 * — they reference @color/notification_icon_color and @drawable/notification_icon
 * which are configured by the expo-notifications plugin.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

const KEYS_TO_FORCE_REPLACE = new Set([
  'com.google.firebase.messaging.default_notification_color',
  'com.google.firebase.messaging.default_notification_icon',
]);

module.exports = function withFcmNotificationMeta(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (!application) return cfg;

    const metas = application['meta-data'] || [];
    for (const meta of metas) {
      const name = meta.$?.['android:name'];
      if (name && KEYS_TO_FORCE_REPLACE.has(name)) {
        meta.$['tools:replace'] = 'android:resource';
      }
    }
    return cfg;
  });
};
