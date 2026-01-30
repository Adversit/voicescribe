import Foundation

/// 后端 API 服务
actor BackendService {
    static let shared = BackendService()
    
    private let baseURL = URL(string: "http://127.0.0.1:8765")!
    private let session: URLSession
    
    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 300 // 5 分钟超时（长录音）
        self.session = URLSession(configuration: config)
    }
    
    // MARK: - API Methods
    
    /// 获取可用引擎列表
    func listEngines() async throws -> [EngineInfo] {
        let url = baseURL.appendingPathComponent("engines")
        let (data, _) = try await session.data(from: url)
        return try JSONDecoder().decode([EngineInfo].self, from: data)
    }
    
    /// 预加载模型
    func loadEngine(engine: String, model: String) async throws {
        var request = URLRequest(url: baseURL.appendingPathComponent("load"))
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = "engine=\(engine)&model=\(model)".data(using: .utf8)
        
        let (_, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw BackendError.loadFailed
        }
    }
    
    /// 转录音频文件
    func transcribe(
        audioPath: String,
        engine: String,
        model: String,
        language: String,
        enableDiarization: Bool,
        hotwords: String = ""
    ) async throws -> TranscribeResult {
        let url = baseURL.appendingPathComponent("transcribe")
        
        // 构建 multipart form data
        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var body = Data()
        
        // 添加音频文件
        let audioURL = URL(fileURLWithPath: audioPath)
        let audioData = try Data(contentsOf: audioURL)
        let filename = audioURL.lastPathComponent
        
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/wav\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n".data(using: .utf8)!)
        
        // 添加参数
        var params = [
            "engine": engine,
            "model": model,
            "language": language,
            "enable_diarization": enableDiarization ? "true" : "false"
        ]

        // 添加热词参数（如果有）
        if !hotwords.isEmpty {
            params["hotwords"] = hotwords
        }
        
        for (key, value) in params {
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n".data(using: .utf8)!)
            body.append("\(value)\r\n".data(using: .utf8)!)
        }
        
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body
        
        let (data, response) = try await session.data(for: request)
        
        if let httpResponse = response as? HTTPURLResponse {
            print("[Backend] Status: \(httpResponse.statusCode)")
        }
        if let responseStr = String(data: data, encoding: .utf8) {
            print("[Backend] Response: \(responseStr.prefix(200))")
        }
        
        return try JSONDecoder().decode(TranscribeResult.self, from: data)
    }
    
    /// 注册说话人
    func registerSpeaker(name: String, audioPath: String) async throws -> SpeakerInfo {
        let url = baseURL.appendingPathComponent("speakers/register")
        
        let boundary = UUID().uuidString
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var body = Data()
        
        // Name
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"name\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(name)\r\n".data(using: .utf8)!)
        
        // Audio file
        let audioURL = URL(fileURLWithPath: audioPath)
        let audioData = try Data(contentsOf: audioURL)
        
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"audio\"; filename=\"sample.wav\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: audio/wav\r\n\r\n".data(using: .utf8)!)
        body.append(audioData)
        body.append("\r\n".data(using: .utf8)!)
        
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body
        
        let (data, _) = try await session.data(for: request)
        return try JSONDecoder().decode(SpeakerInfo.self, from: data)
    }
    
    /// 获取已注册说话人列表
    func listSpeakers() async throws -> [SpeakerInfo] {
        let url = baseURL.appendingPathComponent("speakers")
        let (data, _) = try await session.data(from: url)
        let response = try JSONDecoder().decode(SpeakersResponse.self, from: data)
        return response.speakers
    }

    /// 删除说话人
    func deleteSpeaker(speakerId: String) async throws {
        let url = baseURL.appendingPathComponent("speakers/\(speakerId)")
        var request = URLRequest(url: url)
        request.httpMethod = "DELETE"
        let (_, response) = try await session.data(for: request)
        if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode >= 400 {
            throw BackendError.deleteFailed
        }
    }
}

// MARK: - Response Types

struct TranscribeResult: Codable {
    let text: String
    let segments: [SegmentResult]
    let duration: Double
    let engine: String
    let model: String
    
    struct SegmentResult: Codable {
        let start: Double
        let end: Double
        let text: String
        let speaker: String?
    }
}

struct SpeakerInfo: Codable, Identifiable {
    var id: String { speakerId }
    let speakerId: String
    let name: String
    
    enum CodingKeys: String, CodingKey {
        case speakerId = "speaker_id"
        case name
    }
}

struct SpeakersResponse: Codable {
    let speakers: [SpeakerInfo]
}

enum BackendError: Error, LocalizedError {
    case loadFailed
    case transcribeFailed
    case connectionFailed
    case deleteFailed

    var errorDescription: String? {
        switch self {
        case .loadFailed: return "加载模型失败"
        case .transcribeFailed: return "转录失败"
        case .connectionFailed: return "无法连接后端服务"
        case .deleteFailed: return "删除失败"
        }
    }
}
