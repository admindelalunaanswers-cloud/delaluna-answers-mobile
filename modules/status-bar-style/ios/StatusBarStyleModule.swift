import ExpoModulesCore
import ObjectiveC.runtime
import UIKit

/// Sets the status bar style the iOS-27 way: from the window's root view
/// controller, with `UIViewControllerBasedStatusBarAppearance` = YES.
///
/// `-[UIApplication setStatusBarStyle:]` — what React Native's StatusBar module,
/// and so expo-status-bar, calls — is a no-op from iOS 27, so the app's light and
/// dark themes stopped steering the status bar. With the Info.plist key YES,
/// iOS asks the root view controller's `preferredStatusBarStyle` instead, and
/// this module answers it. See src/components/app-status-bar.tsx for the JS side.
public class StatusBarStyleModule: Module {
  public func definition() -> ModuleDefinition {
    Name("StatusBarStyle")

    AsyncFunction("setStyle") { (style: String, animated: Bool) in
      StatusBarStyleOverride.apply(StatusBarStyleOverride.style(named: style), animated: animated)
    }.runOnQueue(.main)
  }
}

/// Owns the style the root view controller reports.
///
/// The root view controller is not ours to replace: expo-screen-orientation
/// provides it (ScreenOrientationViewController, internal to that module, so it
/// can't be subclassed from here), and replacing it would drop the portrait lock.
/// Instead the existing instance gets a runtime subclass that overrides only
/// `preferredStatusBarStyle` — the isa-swizzle KVO itself uses. Everything else,
/// orientation included, is inherited unchanged. It is installed once, on the
/// first style change, and is idempotent.
enum StatusBarStyleOverride {
  /// What the root view controller reports. Read by the injected getter, on the
  /// main thread, whenever UIKit re-evaluates the status bar.
  static var current: UIStatusBarStyle = .default

  private static let subclassPrefix = "DLStatusBarStyleHost_"

  static func style(named name: String) -> UIStatusBarStyle {
    switch name {
    case "light": return .lightContent
    case "dark": return .darkContent
    default: return .default
    }
  }

  static func apply(_ style: UIStatusBarStyle, animated: Bool) {
    current = style
    guard let root = keyWindowRootViewController() else { return }
    install(on: root)

    let update = { root.setNeedsStatusBarAppearanceUpdate() }
    if animated {
      UIView.animate(withDuration: 0.25, animations: update)
    } else {
      update()
    }
  }

  private static func keyWindowRootViewController() -> UIViewController? {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
    return (windows.first { $0.isKeyWindow } ?? windows.first)?.rootViewController
  }

  private static func install(on viewController: UIViewController) {
    guard let baseClass = object_getClass(viewController) else { return }
    let baseName = NSStringFromClass(baseClass)
    if baseName.hasPrefix(subclassPrefix) { return }

    let name = subclassPrefix + baseName
    let subclass: AnyClass
    if let existing = NSClassFromString(name) {
      subclass = existing
    } else {
      guard let created = objc_allocateClassPair(baseClass, name, 0) else { return }
      let selector = #selector(getter: UIViewController.preferredStatusBarStyle)
      guard let method = class_getInstanceMethod(UIViewController.self, selector) else { return }
      // UIStatusBarStyle is an NSInteger enum; the getter's type encoding is
      // copied from UIViewController's own, so the signatures match.
      let getter: @convention(block) (AnyObject) -> Int = { _ in current.rawValue }
      class_addMethod(created, selector, imp_implementationWithBlock(getter), method_getTypeEncoding(method))
      objc_registerClassPair(created)
      subclass = created
    }
    object_setClass(viewController, subclass)
  }
}
