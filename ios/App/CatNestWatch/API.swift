import Foundation
import CryptoKit

// MARK: - what the server sends

struct Home: Decodable {
    struct User: Decodable { let nickname: String; let fish: Int }
    struct Stats: Decodable { let hunger: Double; let energy: Double; let mood: Double }
    struct Cat: Decodable {
        let id: String
        let name: String
        let out: Bool
        let sleepy: Bool
        let stats: Stats
        let mood: String
        let look: String
    }
    struct WishState: Decodable {
        struct Wish: Decodable { let text: String; let need: Int }
        let wish: Wish
        let progress: Int
        let done: Bool
    }
    struct Food: Decodable, Identifiable { let id: String; let name: String; let count: Int }
    struct Letter: Decodable, Identifiable { let id: Int; let ts: Double; let title: String; let text: String; let seen: Bool }

    let user: User
    let cat: Cat?
    let line: String?
    let wish: WishState?
    let foods: [Food]?
    let letters: [Letter]?
    let unread: Int?
    let night: Bool?
}

struct APIError: LocalizedError {
    let status: Int
    let message: String
    var errorDescription: String? { message }
}

// MARK: - client

final class API: NSObject, URLSessionDelegate, @unchecked Sendable {
    static let shared = API()

    var token: String? {
        get { Keychain.get("session") }
        set { Keychain.set("session", newValue) }
    }

    private lazy var session: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 20
        c.httpShouldSetCookies = false
        return URLSession(configuration: c, delegate: self, delegateQueue: nil)
    }()

    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        #if DEBUG
        // the local development server uses a self-signed certificate
        let host = challenge.protectionSpace.host
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
           host == "localhost" || host == "127.0.0.1",
           let trust = challenge.protectionSpace.serverTrust {
            return (.useCredential, URLCredential(trust: trust))
        }
        #endif
        return (.performDefaultHandling, nil)
    }

    func url(_ path: String) -> URL {
        URL(string: path, relativeTo: Config.server)?.absoluteURL ?? Config.server
    }

    func send<T: Decodable>(_ method: String, _ path: String, _ body: [String: Any]? = nil, as: T.Type = T.self) async throws -> T {
        var req = URLRequest(url: url(path))
        req.httpMethod = method
        req.setValue("CatNestWatch/1.0 watchOS", forHTTPHeaderField: "User-Agent")
        req.setValue("1", forHTTPHeaderField: "x-catnest") // required on writes before there is a token
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let data: Data
        let res: URLResponse
        do {
            (data, res) = try await session.data(for: req)
        } catch {
            throw APIError(status: 0, message: "连不上猫窝，看看网络？")
        }
        let status = (res as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError(status: status, message: msg ?? "猫窝打了个盹，等等再试")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    func data(_ path: String) async throws -> Data {
        var req = URLRequest(url: url(path))
        req.setValue("CatNestWatch/1.0 watchOS", forHTTPHeaderField: "User-Agent")
        let (data, res) = try await session.data(for: req)
        guard (res as? HTTPURLResponse)?.statusCode == 200 else { throw APIError(status: 0, message: "图片没下载下来") }
        return data
    }

    // MARK: guest accounts need a small proof of work (as on the web)

    struct Pow: Decodable { let c: String; let d: Int; let e: Double; let s: String }

    func solve(_ p: Pow) -> String {
        var n = 0
        while true {
            let digest = SHA256.hash(data: Data("\(p.c):\(n)".utf8))
            var bits = 0
            for byte in digest {
                if byte == 0 { bits += 8; continue }
                bits += byte.leadingZeroBitCount
                break
            }
            if bits >= p.d { return String(n) }
            n += 1
        }
    }
}

struct Empty: Decodable {}
struct Line: Decodable { let text: String }
struct Command: Decodable { let action: String; let reply: String }
struct TokenReply: Decodable { let token: String? }
struct PairStart: Decodable { let code: String; let secret: String; let interval: Double }
struct PairPoll: Decodable { let status: String; let token: String? }
struct ActReply: Decodable { let wishDone: Bool? }
