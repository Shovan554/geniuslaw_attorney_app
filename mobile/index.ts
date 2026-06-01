// MUST be the first import — registers the FCM background handler before
// React mounts so Android can wake the killed app on incoming-call data
// messages and synchronously call RNCallKeep.displayIncomingCall.
import './fcmBackground';

import 'expo-router/entry';
