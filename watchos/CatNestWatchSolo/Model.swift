import Foundation

// What the server sends the standalone watch app (/api/watch and friends). Names and
// words come already chosen, since the watch carries none of the game's catalogs.

struct WatchHome: Decodable {
    struct User: Decodable { let nickname: String; let fish: Int; let secured: Bool }
    struct Town: Decodable {
        struct Show: Decodable { let name: String; let blurb: String; let at: String; let live: Bool; let gathering: Bool; let rainedOff: Bool }
        let time: String
        let phase: String
        let weather: String
        let season: String
        let show: Show?
        let mode: String
        let notice: String
    }
    struct Stats: Decodable { let hunger: Double; let energy: Double; let mood: Double; let clean: Double; let social: Double; let bond: Double }
    struct Bond: Decodable { let level: Int; let name: String; let value: Int; let next: Int }
    struct Places: Decodable { let found: Int; let total: Int }
    struct Cat: Decodable {
        let id: String
        let name: String
        let out: Bool
        let sleepy: Bool
        let away: String?
        let stats: Stats
        let mood: String
        let coat: String
        let traits: [String]
        let quirk: String
        let days: Int
        let stage: String
        let bond: Bond
        let outfit: [String]
        let places: Places
        let look: String
    }
    struct Trip: Decodable { let place: String; let since: Double?; let finds: [String]; let friends: [String]; let places: Int; let goingHome: Bool }

    let user: User
    let town: Town
    let night: Bool?
    let unread: Int?
    let cat: Cat?
    let trip: Trip?
    let wish: Home.WishState?
    let foods: [Home.Food]?
}

struct Wardrobe: Decodable {
    struct Item: Decodable, Identifiable, Hashable {
        let id: String
        let name: String
        let slot: String
        let slotName: String
        let desc: String
        let price: Int
    }
    let worn: [String]
    let owned: [Item]
    let forSale: [Item]
}

struct ShopList: Decodable {
    struct Food: Decodable, Identifiable { let id: String; let name: String; let desc: String; let price: Int; let owned: Int }
    let fish: Int
    let foods: [Food]
}

struct Book: Decodable {
    struct Item: Decodable, Identifiable { let id: String; let name: String; let rarity: Int; let desc: String; let count: Int }
    let total: Int
    let found: [Item]
}

struct DiaryEntry: Decodable, Identifiable {
    let id: Int
    let ts: Double
    let kind: String
    let text: String
}

struct Mail: Decodable, Identifiable {
    let id: Int
    let ts: Double
    let kind: String
    let title: String
    let text: String
    let seen: Int
}

struct Hood: Decodable {
    struct NeighborCat: Decodable, Identifiable { let id: String; let name: String; let out: Bool; let away: String? }
    struct House: Decodable, Identifiable {
        let n: Int
        let uid: String
        let name: String
        let cats: [NeighborCat]
        let door: String
        let close: Bool
        var id: String { uid }
    }
    let houses: [House]
}

struct TownStatus: Decodable {
    let worldTz: Double
    let trial: Bool?
    let mode: String?
    let web: Bool?
}

struct MoveStatus: Decodable {
    struct Request: Decodable {
        struct Summary: Decodable {
            struct SummaryCat: Decodable { let name: String }
            let cat: SummaryCat
        }
        let id: Int
        let status: String
        let reason: String?
        let origin: String
        let summary: Summary
    }
    let request: Request?
}

/// When something happened, the way people say it: 刚刚, 5 分钟前, 昨天 21:30, 10月3日.
func whenText(_ ms: Double) -> String {
    let d = Date(timeIntervalSince1970: ms / 1000)
    let s = -d.timeIntervalSinceNow
    if s < 60 { return "刚刚" }
    if s < 3600 { return "\(Int(s / 60)) 分钟前" }
    let cal = Calendar.current
    let f = DateFormatter()
    f.locale = Locale(identifier: "zh_CN")
    if cal.isDateInToday(d) { f.dateFormat = "HH:mm"; return "今天 \(f.string(from: d))" }
    if cal.isDateInYesterday(d) { f.dateFormat = "HH:mm"; return "昨天 \(f.string(from: d))" }
    f.dateFormat = "M月d日"
    return f.string(from: d)
}
