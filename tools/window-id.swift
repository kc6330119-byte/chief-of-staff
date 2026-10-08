// Prints the window number of the first normal on-screen window that a process owns, for `screencapture -l`.
// With --menu, the number of its smallest on-screen window above the normal level instead: an open menu (on recent macOS its window can be as large as the app's).
// With --bounds, the rectangle around all of its on-screen windows, as x,y,w,h for `screencapture -R`.
// Usage: window-id <pid> [--menu | --bounds]
import CoreGraphics
import Foundation

let pid = Int32(CommandLine.arguments[1])!
let mode = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : ""
let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
let own = windows.filter { ($0[kCGWindowOwnerPID as String] as? Int32) == pid }
if mode == "--bounds" {
    var rect = CGRect.null
    for w in own {
        if let b = w[kCGWindowBounds as String] as? NSDictionary, let r = CGRect(dictionaryRepresentation: b as CFDictionary) { rect = rect.union(r) }
    }
    if rect.isNull { exit(1) }
    print("\(Int(rect.minX)),\(Int(rect.minY)),\(Int(rect.width)),\(Int(rect.height))")
    exit(0)
}
let area = { (w: [String: Any]) -> CGFloat in
    guard let b = w[kCGWindowBounds as String] as? NSDictionary, let r = CGRect(dictionaryRepresentation: b as CFDictionary) else { return .infinity }
    return r.width * r.height
}
let layer = { (w: [String: Any]) -> Int in w[kCGWindowLayer as String] as? Int ?? 0 }
let found = mode == "--menu" ? own.filter { layer($0) > 0 }.min { area($0) < area($1) } : own.first { layer($0) == 0 }
guard let w = found else { exit(1) }
print(w[kCGWindowNumber as String] as! Int)
