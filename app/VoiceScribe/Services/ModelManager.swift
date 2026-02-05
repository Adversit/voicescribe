import Foundation
import SwiftUI

struct ModelStatusInfo: Codable, Identifiable, Hashable {
    var id: String { "\(engine)-\(model)" }
    let engine: String
    let model: String
    let available: Bool
    let downloading: Bool
    let sizeBytes: Int?
    let downloadedBytes: Int?
    let error: String?

    enum CodingKeys: String, CodingKey {
        case engine
        case model
        case available
        case downloading
        case sizeBytes = "size_bytes"
        case downloadedBytes = "downloaded_bytes"
        case error
    }
}

@MainActor
class ModelManager: ObservableObject {
    static let shared = ModelManager()

    @Published var models: [ModelStatusInfo] = []
    @Published var isRefreshing = false
    @Published var autoDownloadPhase: AutoDownloadPhase? = nil
    @Published var autoDownloadError: String? = nil
    @Published var toastMessage: String? = nil

    @AppStorage("didAutoDownloadDefaultModel") private var didAutoDownloadDefaultModel = false

    private let baseURL = URL(string: "http://127.0.0.1:8765")!
    private var pollTimer: Timer?
    private var autoDownloadKey: String?

    enum AutoDownloadPhase {
        case downloading
        case loading
    }

    private init() {}

    func refresh() {
        Task { await fetchModels() }
    }

    func status(engine: String, model: String) -> ModelStatusInfo? {
        models.first { $0.engine == engine && $0.model == model }
    }

    func download(engine: String, model: String) {
        Task { _ = await startDownload(engine: engine, model: model) }
    }

    func delete(engine: String, model: String) {
        Task { await deleteModel(engine: engine, model: model) }
    }

    func autoDownloadDefaultIfNeeded(engine: String, model: String) {
        guard !didAutoDownloadDefaultModel else { return }
        Task {
            await fetchModels()
            let current = status(engine: engine, model: model)
            if current?.available == true {
                didAutoDownloadDefaultModel = true
                return
            }
            autoDownloadKey = "\(engine)-\(model)"
            autoDownloadPhase = .downloading
            let started = await startDownload(engine: engine, model: model)
            if started {
                didAutoDownloadDefaultModel = true
            } else {
                autoDownloadPhase = nil
            }
        }
    }

    var isAutoDownloadActive: Bool {
        autoDownloadPhase != nil
    }

    var autoDownloadStatus: ModelStatusInfo? {
        guard let key = autoDownloadKey else { return nil }
        return models.first { $0.id == key }
    }

    private func fetchModels() async {
        isRefreshing = true
        defer { isRefreshing = false }

        do {
            let url = baseURL.appendingPathComponent("models")
            let (data, response) = try await URLSession.shared.data(from: url)
            if let http = response as? HTTPURLResponse, http.statusCode != 200 {
                throw URLError(.badServerResponse)
            }
            let decoded = try JSONDecoder().decode([ModelStatusInfo].self, from: data)
            models = decoded

            updatePolling()
            await handleAutoDownloadStateIfNeeded()
        } catch {
            models = []
            print("[ModelManager] Failed to fetch models: \(error)")
            showToast("模型状态获取失败，请重启应用")
        }
    }

    private func startDownload(engine: String, model: String) async -> Bool {
        do {
            var request = URLRequest(url: baseURL.appendingPathComponent("models/download"))
            request.httpMethod = "POST"
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            request.httpBody = "engine=\(engine)&model=\(model)".data(using: .utf8)

            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode != 200 {
                throw URLError(.badServerResponse)
            }
            await fetchModels()
            return true
        } catch {
            autoDownloadError = error.localizedDescription
            print("[ModelManager] Failed to start download: \(error)")
            return false
        }
    }

    private func deleteModel(engine: String, model: String) async {
        do {
            var request = URLRequest(url: baseURL.appendingPathComponent("models/delete"))
            request.httpMethod = "POST"
            request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            request.httpBody = "engine=\(engine)&model=\(model)".data(using: .utf8)

            let (_, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode != 200 {
                throw URLError(.badServerResponse)
            }
            await fetchModels()
        } catch {
            print("[ModelManager] Failed to delete model: \(error)")
        }
    }

    private func updatePolling() {
        let hasDownloading = models.contains { $0.downloading }
        if hasDownloading && pollTimer == nil {
            pollTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
                Task { [weak self] in
                    await self?.fetchModels()
                }
            }
        } else if !hasDownloading {
            pollTimer?.invalidate()
            pollTimer = nil
        }
    }

    private func handleAutoDownloadStateIfNeeded() async {
        guard let phase = autoDownloadPhase, let status = autoDownloadStatus else { return }

        if phase == .downloading {
            if status.downloading {
                return
            }
            if status.available {
                autoDownloadPhase = .loading
                do {
                    try await BackendService.shared.loadEngine(engine: status.engine, model: status.model)
                    autoDownloadPhase = nil
                    showToast("模型已加载完成")
                } catch {
                    autoDownloadError = error.localizedDescription
                    autoDownloadPhase = nil
                }
            } else if let error = status.error {
                autoDownloadError = error
                autoDownloadPhase = nil
            }
        }
    }

    private func showToast(_ message: String) {
        toastMessage = message
        DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) { [weak self] in
            if self?.toastMessage == message {
                self?.toastMessage = nil
            }
        }
    }
}

extension ModelStatusInfo {
    static let byteFormatter: ByteCountFormatter = {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        formatter.allowedUnits = [.useMB, .useGB]
        return formatter
    }()

    var sizeText: String? {
        guard let sizeBytes else { return nil }
        return ModelStatusInfo.byteFormatter.string(fromByteCount: Int64(sizeBytes))
    }

    var downloadedText: String? {
        guard let downloadedBytes else { return nil }
        return ModelStatusInfo.byteFormatter.string(fromByteCount: Int64(downloadedBytes))
    }
}
