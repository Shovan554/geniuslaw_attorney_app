#import "VoipPushBridge.h"
#import <PushKit/PushKit.h>
#import "RNVoipPushNotificationManager.h"
#import "RNCallKeep.h"

static VoipPushBridge *_sharedBridge = nil;

@interface VoipPushBridge () <PKPushRegistryDelegate>
@property (strong, nonatomic) PKPushRegistry *pushRegistry;
@end

@implementation VoipPushBridge

+ (void)load {
    // Defer real setup until the app finishes launching so the RN bridge
    // is alive by the time PushKit might fire a delegate call.
    [[NSNotificationCenter defaultCenter]
        addObserver:[self class]
           selector:@selector(_applicationDidFinishLaunching:)
               name:UIApplicationDidFinishLaunchingNotification
             object:nil];
}

+ (void)_applicationDidFinishLaunching:(NSNotification *)note {
    if (_sharedBridge != nil) return;
    _sharedBridge = [[VoipPushBridge alloc] init];
    [_sharedBridge _startPushKit];
    [[NSNotificationCenter defaultCenter] removeObserver:[self class]
                                                    name:UIApplicationDidFinishLaunchingNotification
                                                  object:nil];
}

- (void)_startPushKit {
    // We own the sole PKPushRegistry. Do NOT call
    // [RNVoipPushNotificationManager voipRegistration] — its implementation
    // creates a SECOND PKPushRegistry whose delegate is
    // [[UIApplication sharedApplication] delegate] (the Swift AppDelegate),
    // which has no PushKit selectors → unrecognized-selector crash on token
    // arrival. We forward credential and incoming-push events to
    // RNVoipPushNotificationManager from our own delegate methods below, so
    // the JS 'register' / 'notification' events still fire.
    self.pushRegistry = [[PKPushRegistry alloc] initWithQueue:dispatch_get_main_queue()];
    self.pushRegistry.delegate = self;
    self.pushRegistry.desiredPushTypes = [NSSet setWithObject:PKPushTypeVoIP];
}

#pragma mark - PKPushRegistryDelegate

- (void)pushRegistry:(PKPushRegistry *)registry
    didUpdatePushCredentials:(PKPushCredentials *)credentials
                     forType:(PKPushType)type {
    [RNVoipPushNotificationManager didUpdatePushCredentials:credentials
                                                    forType:(NSString *)type];
}

- (void)pushRegistry:(PKPushRegistry *)registry
    didInvalidatePushTokenForType:(PKPushType)type {
    // no-op; the backend will drop dead tokens on 410 GONE.
}

- (void)pushRegistry:(PKPushRegistry *)registry
    didReceiveIncomingPushWithPayload:(PKPushPayload *)payload
                              forType:(PKPushType)type
                withCompletionHandler:(void (^)(void))completion {
    NSDictionary *data = payload.dictionaryPayload;
    NSString *uuid = data[@"call_id"] ?: [[NSUUID UUID] UUIDString];
    NSString *callerName = data[@"caller_name"] ?: @"Caller";
    BOOL isVideo = [data[@"is_video"] boolValue];

    // CRITICAL: Apple requires reportNewIncomingCall to fire synchronously
    // before this method returns, else iOS 13+ will terminate the app and
    // stop delivering VoIP pushes.
    [RNCallKeep reportNewIncomingCall:uuid
                               handle:callerName
                           handleType:@"generic"
                             hasVideo:isVideo
                  localizedCallerName:callerName
                      supportsHolding:NO
                         supportsDTMF:NO
                     supportsGrouping:NO
                   supportsUngrouping:NO
                          fromPushKit:YES
                              payload:data
                withCompletionHandler:completion];

    // Forward to JS so it can hear the push event (and the register event
    // earlier captured the token).
    [RNVoipPushNotificationManager didReceiveIncomingPushWithPayload:payload
                                                             forType:(NSString *)type];
}

@end
