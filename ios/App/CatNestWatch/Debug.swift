import Foundation

/// Development hooks, compiled into DEBUG builds only, so screens can be checked
/// from the command line:
///   xcrun simctl launch <watch> com.catnest.app.watchkitapp -CatNestDebugCode XXXX-XXXX-XXXX -CatNestDebugScreen more
enum Debug {
    #if DEBUG
    static var code: String? { UserDefaults.standard.string(forKey: "CatNestDebugCode") }
    static var screen: String? { UserDefaults.standard.string(forKey: "CatNestDebugScreen") }
    static var pet: Bool { UserDefaults.standard.bool(forKey: "CatNestDebugPet") }
    static var signOut: Bool { UserDefaults.standard.bool(forKey: "CatNestDebugSignOut") }
    #else
    static let code: String? = nil
    static let screen: String? = nil
    static let pet = false
    static let signOut = false
    #endif
}
