#include <napi.h>

#import <Cocoa/Cocoa.h>
#include <objc/runtime.h>

#include <cstring>
#include <functional>
#include <string>

// Measured on macOS 26.5.2 (this machine):
//   NSMainMenuWindowLevel            24   Window Server Menubar
//   NSStatusWindowLevel              25   Control Center menu-bar items
//   CGWindowLevel(kCGDockWindowLevelKey) 20
//   NSPopUpMenuWindowLevel           101
//   NSScreenSaverWindowLevel         1000  Electron "screen-saver"
// Electron already maps "screen-saver" to 1000, which is above the menu bar.
// The menu bar still shows because NSWindow constrainFrameRect:toScreen:
// shrinks a borderless window out of that strip. This helper only changes
// the dedicated output window: it lets that window keep the full screen frame
// and uses the lowest level that still sits above the menu bar, status
// items, and the Dock. Pop-up menus (101) and higher OS UI stay above it.

static const void *kNeudOutputStateKey = &kNeudOutputStateKey;
static Class gPresentationClass = nil;
static int gAppliedLevel = 0;
static int gFrameCoversScreen = 0;

@interface NeudMacOutputState : NSObject
@property(nonatomic, assign) Class originalClass;
@property(nonatomic, assign) BOOL swapped;
@property(nonatomic, strong) id monitor;
@property(nonatomic, assign) BOOL cursorForced;
@property(nonatomic, assign) BOOL savedAcceptsMouseMoved;
@property(nonatomic, assign) BOOL didSaveAcceptsMouseMoved;
@property(nonatomic, assign) BOOL coverSystemUi;
@property(nonatomic, assign) BOOL hideCursor;
@end

@implementation NeudMacOutputState
@end

@interface NeudOutputCursorView : NSView
@property(nonatomic, assign) BOOL hideCursor;
@property(nonatomic, strong) NSTrackingArea *trackingArea;
@end

static NSCursor *NeudInvisibleCursor(void) {
  static NSCursor *cursor = nil;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    NSBitmapImageRep *rep = [[NSBitmapImageRep alloc]
        initWithBitmapDataPlanes:NULL
                      pixelsWide:1
                      pixelsHigh:1
                   bitsPerSample:8
                 samplesPerPixel:4
                        hasAlpha:YES
                        isPlanar:NO
                  colorSpaceName:NSCalibratedRGBColorSpace
                     bytesPerRow:4
                    bitsPerPixel:32];
    unsigned char *pixels = [rep bitmapData];
    if (pixels) {
      pixels[0] = 0;
      pixels[1] = 0;
      pixels[2] = 0;
      pixels[3] = 0;
    }
    NSImage *image = [[NSImage alloc] initWithSize:NSMakeSize(1, 1)];
    [image addRepresentation:rep];
    cursor = [[NSCursor alloc] initWithImage:image hotSpot:NSZeroPoint];
  });
  return cursor;
}

static NSCursor *NeudCursor(BOOL hide) {
  return hide ? NeudInvisibleCursor() : [NSCursor arrowCursor];
}

static NSRect (*NeudSuperConstrain)(id, SEL, NSRect, NSScreen *) = nullptr;

static NSRect NeudConstrainFrameRect(id self, SEL cmd, NSRect frameRect, NSScreen *screen) {
  NeudMacOutputState *state = objc_getAssociatedObject(self, kNeudOutputStateKey);
  if (state.coverSystemUi) {
    return frameRect;
  }
  if (NeudSuperConstrain) {
    return NeudSuperConstrain(self, cmd, frameRect, screen);
  }
  return frameRect;
}

static void NeudEnsurePresentationClass(Class base) {
  if (gPresentationClass) return;
  Method windowMethod = class_getInstanceMethod([NSWindow class], @selector(constrainFrameRect:toScreen:));
  NeudSuperConstrain = windowMethod
      ? reinterpret_cast<NSRect (*)(id, SEL, NSRect, NSScreen *)>(method_getImplementation(windowMethod))
      : nullptr;
  Method superMethod = class_getInstanceMethod(base, @selector(constrainFrameRect:toScreen:));
  gPresentationClass = objc_allocateClassPair(base, "NEUDPresentationNSWindow", 0);
  if (!gPresentationClass) {
    gPresentationClass = objc_lookUpClass("NEUDPresentationNSWindow");
    return;
  }
  class_addMethod(
      gPresentationClass,
      @selector(constrainFrameRect:toScreen:),
      reinterpret_cast<IMP>(NeudConstrainFrameRect),
      method_getTypeEncoding(superMethod));
  objc_registerClassPair(gPresentationClass);
}

static NSInteger NeudPresentationLevel(void) {
  return NSStatusWindowLevel + 1;
}

static NSScreen *NeudScreenForWindow(NSWindow *window) {
  NSRect frame = window.frame;
  NSScreen *best = window.screen;
  CGFloat bestArea = -1;
  for (NSScreen *screen in [NSScreen screens]) {
    NSRect overlap = NSIntersectionRect(frame, screen.frame);
    CGFloat area = overlap.size.width * overlap.size.height;
    if (area > bestArea) {
      bestArea = area;
      best = screen;
    }
  }
  return best ?: [NSScreen mainScreen];
}

static NeudMacOutputState *NeudState(NSWindow *window) {
  NeudMacOutputState *state = objc_getAssociatedObject(window, kNeudOutputStateKey);
  if (!state) {
    state = [[NeudMacOutputState alloc] init];
    state.originalClass = [window class];
    objc_setAssociatedObject(window, kNeudOutputStateKey, state, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  }
  return state;
}

static void NeudApplyCursor(NSWindow *window, BOOL hide, BOOL inside) {
  NeudMacOutputState *state = NeudState(window);
  if (hide && inside) {
    [NeudInvisibleCursor() set];
    state.cursorForced = YES;
    return;
  }
  if (state.cursorForced) {
    [[NSCursor arrowCursor] set];
    state.cursorForced = NO;
  }
}

@implementation NeudOutputCursorView

- (instancetype)initWithFrame:(NSRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    self.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.wantsLayer = YES;
    self.layer.backgroundColor = CGColorGetConstantColor(kCGColorClear);
  }
  return self;
}

- (void)updateTrackingAreas {
  [super updateTrackingAreas];
  if (self.trackingArea) {
    [self removeTrackingArea:self.trackingArea];
  }
  self.trackingArea = [[NSTrackingArea alloc]
      initWithRect:NSZeroRect
           options:(NSTrackingMouseEnteredAndExited | NSTrackingMouseMoved | NSTrackingCursorUpdate |
                    NSTrackingActiveAlways | NSTrackingInVisibleRect)
             owner:self
          userInfo:nil];
  [self addTrackingArea:self.trackingArea];
}

- (void)resetCursorRects {
  [super resetCursorRects];
  [self addCursorRect:self.bounds cursor:NeudCursor(self.hideCursor)];
}

- (void)setFrameSize:(NSSize)newSize {
  [super setFrameSize:newSize];
  [[self window] invalidateCursorRectsForView:self];
}

- (void)applyCursor {
  NSPoint location = [self convertPoint:[[self window] mouseLocationOutsideOfEventStream] fromView:nil];
  BOOL inside = NSPointInRect(location, self.bounds);
  NeudApplyCursor([self window], self.hideCursor, inside);
}

- (void)cursorUpdate:(NSEvent *)event {
  (void)event;
  [self applyCursor];
}

- (void)mouseEntered:(NSEvent *)event {
  (void)event;
  [self applyCursor];
}

- (void)mouseMoved:(NSEvent *)event {
  (void)event;
  [self applyCursor];
}

- (void)mouseExited:(NSEvent *)event {
  (void)event;
  NeudApplyCursor([self window], NO, NO);
}

- (BOOL)acceptsFirstMouse:(NSEvent *)event {
  (void)event;
  return YES;
}

@end

static NeudOutputCursorView *NeudInstallOverlay(NSWindow *window, BOOL hideCursor) {
  NSView *content = window.contentView;
  if (!content) return nil;
  NeudOutputCursorView *overlay = nil;
  for (NSView *view in content.subviews) {
    if ([view isKindOfClass:[NeudOutputCursorView class]]) {
      overlay = (NeudOutputCursorView *)view;
      break;
    }
  }
  if (!overlay) {
    overlay = [[NeudOutputCursorView alloc] initWithFrame:content.bounds];
    [content addSubview:overlay positioned:NSWindowAbove relativeTo:nil];
  }
  overlay.hideCursor = hideCursor;
  overlay.frame = content.bounds;
  [overlay updateTrackingAreas];
  [window invalidateCursorRectsForView:overlay];
  [overlay applyCursor];
  return overlay;
}

static void NeudRemoveOverlay(NSWindow *window) {
  NSView *content = window.contentView;
  for (NSView *view in [content.subviews copy]) {
    if ([view isKindOfClass:[NeudOutputCursorView class]]) {
      [view removeFromSuperview];
    }
  }
}

static void NeudInstallMonitor(NSWindow *window) {
  NeudMacOutputState *state = NeudState(window);
  if (state.monitor) {
    [NSEvent removeMonitor:state.monitor];
    state.monitor = nil;
  }
  __weak NSWindow *weakWindow = window;
  // Local monitor sees ALL app mouse events. Cheap early-exit when the event is
  // not for the output window so the operator UI is not taxed on every move.
  state.monitor = [NSEvent addLocalMonitorForEventsMatchingMask:(NSEventMaskMouseMoved | NSEventMaskMouseEntered |
                                                                  NSEventMaskMouseExited | NSEventMaskLeftMouseDragged |
                                                                  NSEventMaskRightMouseDragged)
                                                         handler:^NSEvent *(NSEvent *event) {
                                                           NSWindow *target = weakWindow;
                                                           if (!target || event.window != target) return event;
                                                           NeudMacOutputState *current = objc_getAssociatedObject(target, kNeudOutputStateKey);
                                                           if (!current || !current.hideCursor) return event;
                                                           BOOL inside = NSPointInRect([NSEvent mouseLocation], target.frame);
                                                           NeudApplyCursor(target, current.hideCursor, inside);
                                                           return event;
                                                         }];
}

static std::string NeudConfigure(void *viewPtr, bool coverSystemUi, bool hideCursor) {
  @autoreleasepool {
    if (!viewPtr) return "missing output view";
    NSView *view = (__bridge NSView *)viewPtr;
    if (![view isKindOfClass:[NSView class]]) return "native handle is not a view";
    NSWindow *window = view.window;
    if (!window) return "output view has no window";

    NeudMacOutputState *state = NeudState(window);
    state.hideCursor = hideCursor ? YES : NO;
    if (!state.didSaveAcceptsMouseMoved) {
      state.savedAcceptsMouseMoved = window.acceptsMouseMovedEvents;
      state.didSaveAcceptsMouseMoved = YES;
    }
    window.acceptsMouseMovedEvents = YES;

    NeudEnsurePresentationClass(state.originalClass ?: [NSWindow class]);
    if (gPresentationClass && !state.swapped && [window class] != gPresentationClass) {
      object_setClass(window, gPresentationClass);
      state.swapped = YES;
    }

    state.coverSystemUi = coverSystemUi ? YES : NO;
    NSScreen *screen = NeudScreenForWindow(window);
    if (coverSystemUi) {
      [window setLevel:NeudPresentationLevel()];
    } else {
      [window setLevel:NSNormalWindowLevel];
    }
    // Square-corner presentation surface: never inherit Tahoe rounded window chrome.
    window.hasShadow = NO;
    window.opaque = YES;
    if (window.contentView) {
      window.contentView.wantsLayer = YES;
      window.contentView.layer.cornerRadius = 0.0;
      window.contentView.layer.masksToBounds = YES;
      if (window.contentView.superview) {
        window.contentView.superview.wantsLayer = YES;
        window.contentView.superview.layer.cornerRadius = 0.0;
        window.contentView.superview.layer.masksToBounds = YES;
      }
    }
    if (screen) {
      [window setFrame:screen.frame display:YES];
    }
    NeudInstallOverlay(window, state.hideCursor);
    NeudInstallMonitor(window);
    NSPoint mouse = [NSEvent mouseLocation];
    NeudApplyCursor(window, state.hideCursor, NSPointInRect(mouse, window.frame));
    gAppliedLevel = (int)window.level;
    gFrameCoversScreen = screen && NSEqualRects(window.frame, screen.frame) ? 1 : 0;
    return "";
  }
}

static std::string NeudRestore(void *viewPtr) {
  @autoreleasepool {
    if (!viewPtr) return "missing output view";
    NSView *view = (__bridge NSView *)viewPtr;
    if (![view isKindOfClass:[NSView class]]) return "native handle is not a view";
    NSWindow *window = view.window;
    if (!window) return "";

    NeudMacOutputState *state = objc_getAssociatedObject(window, kNeudOutputStateKey);
    if (!state) return "";
    if (state.monitor) {
      [NSEvent removeMonitor:state.monitor];
      state.monitor = nil;
    }
    state.coverSystemUi = NO;
    state.hideCursor = NO;
    [window setLevel:NSNormalWindowLevel];
    NeudApplyCursor(window, NO, NO);
    [[NSCursor arrowCursor] set];
    state.cursorForced = NO;
    NeudRemoveOverlay(window);
    if (state.didSaveAcceptsMouseMoved) {
      window.acceptsMouseMovedEvents = state.savedAcceptsMouseMoved;
    }
    if (state.swapped && state.originalClass) {
      object_setClass(window, state.originalClass);
      state.swapped = NO;
    }
    objc_setAssociatedObject(window, kNeudOutputStateKey, nil, OBJC_ASSOCIATION_ASSIGN);
    return "";
  }
}

static void *NeudViewPointer(const Napi::Value &value, std::string *error) {
  if (!value.IsBuffer()) {
    *error = "nativeHandle required";
    return nullptr;
  }
  Napi::Buffer<uint8_t> buffer = value.As<Napi::Buffer<uint8_t>>();
  if (buffer.Length() < sizeof(void *)) {
    *error = "nativeHandle is too small";
    return nullptr;
  }
  void *ptr = nullptr;
  std::memcpy(&ptr, buffer.Data(), sizeof(void *));
  return ptr;
}

static void NeudOnMain(const std::function<void()> &work) {
  if ([NSThread isMainThread]) {
    work();
    return;
  }
  dispatch_sync(dispatch_get_main_queue(), ^{
    work();
  });
}

Napi::Value Configure(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Object result = Napi::Object::New(env);
  if (info.Length() < 1 || !info[0].IsObject()) {
    result.Set("ok", Napi::Boolean::New(env, false));
    result.Set("error", Napi::String::New(env, "configureMacOutputWindow options required"));
    return result;
  }
  Napi::Object options = info[0].As<Napi::Object>();
  std::string error;
  void *view = NeudViewPointer(options.Get("nativeHandle"), &error);
  bool cover = options.Get("coverSystemUi").ToBoolean().Value();
  bool hide = options.Get("hideCursor").ToBoolean().Value();
  if (!error.empty()) {
    result.Set("ok", Napi::Boolean::New(env, false));
    result.Set("error", Napi::String::New(env, error));
    return result;
  }
  std::string failure;
  NeudOnMain([&] { failure = NeudConfigure(view, cover, hide); });
  result.Set("ok", Napi::Boolean::New(env, failure.empty()));
  result.Set("level", Napi::Number::New(env, failure.empty() ? gAppliedLevel : 0));
  result.Set("frameCoversScreen", Napi::Boolean::New(env, gFrameCoversScreen == 1));
  if (!failure.empty()) result.Set("error", Napi::String::New(env, failure));
  return result;
}

Napi::Value Restore(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Object result = Napi::Object::New(env);
  if (info.Length() < 1) {
    result.Set("ok", Napi::Boolean::New(env, false));
    result.Set("error", Napi::String::New(env, "nativeHandle required"));
    return result;
  }
  std::string error;
  void *view = NeudViewPointer(info[0], &error);
  if (!error.empty()) {
    result.Set("ok", Napi::Boolean::New(env, false));
    result.Set("error", Napi::String::New(env, error));
    return result;
  }
  std::string failure;
  NeudOnMain([&] { failure = NeudRestore(view); });
  result.Set("ok", Napi::Boolean::New(env, failure.empty()));
  if (!failure.empty()) result.Set("error", Napi::String::New(env, failure));
  return result;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("configure", Napi::Function::New(env, Configure));
  exports.Set("restore", Napi::Function::New(env, Restore));
  return exports;
}

NODE_API_MODULE(neud_mac_output, Init)
