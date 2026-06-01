#import <Foundation/Foundation.h>

/**
 * VoipPushBridge — auto-bootstrap PushKit + CallKit on launch.
 *
 * Wired in via mobile/plugins/withVoipPush.js (Expo config plugin) so
 * `expo prebuild` copies these files into ios/GeniusLaw/ and adds them
 * to the Xcode project compile sources.
 *
 * Uses ObjC +load + UIApplicationDidFinishLaunchingNotification so no
 * Swift AppDelegate modification is required. Bridge calls
 * RNCallKeep's reportNewIncomingCall synchronously inside the PushKit
 * delegate — required by Apple iOS 13+ for VoIP push delivery to keep
 * working.
 */
@interface VoipPushBridge : NSObject
@end
