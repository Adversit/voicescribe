import Foundation
import AVFoundation
import Combine

/// 音频录制服务
class AudioRecorder: NSObject, ObservableObject {
    static let shared = AudioRecorder()
    
    @Published var isRecording = false
    @Published var duration: TimeInterval = 0
    @Published var audioLevel: Float = 0
    
    private var audioRecorder: AVAudioRecorder?
    private var timer: Timer?
    private var currentRecordingURL: URL?
    
    private let settings: [String: Any] = [
        AVFormatIDKey: Int(kAudioFormatLinearPCM),
        AVSampleRateKey: 16000,
        AVNumberOfChannelsKey: 1,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsBigEndianKey: false,
    ]
    
    override private init() {
        super.init()
    }
    
    /// 检查并请求麦克风权限
    func checkPermission(completion: @escaping (Bool) -> Void) {
        switch AVCaptureDevice.authorizationStatus(for: .audio) {
        case .authorized:
            completion(true)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .audio) { granted in
                DispatchQueue.main.async {
                    completion(granted)
                }
            }
        case .denied, .restricted:
            completion(false)
        @unknown default:
            completion(false)
        }
    }
    
    /// 开始录音
    func startRecording() throws -> URL {
        // 检查权限状态
        let status = AVCaptureDevice.authorizationStatus(for: .audio)
        guard status == .authorized else {
            print("[Recorder] Permission denied. Status: \(status.rawValue)")
            throw RecorderError.permissionDenied
        }
        
        // 生成临时文件路径
        let tempDir = FileManager.default.temporaryDirectory
        let filename = "recording_\(Date().timeIntervalSince1970).wav"
        let url = tempDir.appendingPathComponent(filename)
        
        print("[Recorder] Recording to: \(url.path)")
        print("[Recorder] Settings: \(settings)")
        
        // 创建录音器
        do {
            audioRecorder = try AVAudioRecorder(url: url, settings: settings)
        } catch {
            print("[Recorder] Failed to create recorder: \(error)")
            throw RecorderError.recordFailed
        }
        
        audioRecorder?.delegate = self
        audioRecorder?.isMeteringEnabled = true
        
        // 准备录音
        guard audioRecorder?.prepareToRecord() == true else {
            print("[Recorder] prepareToRecord() failed")
            throw RecorderError.recordFailed
        }
        
        // 开始录音
        guard audioRecorder?.record() == true else {
            print("[Recorder] record() returned false")
            print("[Recorder] isRecording: \(audioRecorder?.isRecording ?? false)")
            throw RecorderError.recordFailed
        }
        
        currentRecordingURL = url
        isRecording = true
        duration = 0
        
        // 启动计时器更新时长和音量
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self = self, let recorder = self.audioRecorder else { return }
            
            recorder.updateMeters()
            self.duration = recorder.currentTime
            
            // 转换分贝到 0-1 范围
            let db = recorder.averagePower(forChannel: 0)
            self.audioLevel = max(0, min(1, (db + 60) / 60))
        }
        
        print("[Recorder] Started recording to: \(url.path)")
        return url
    }
    
    /// 停止录音
    func stopRecording() -> URL? {
        timer?.invalidate()
        timer = nil
        
        audioRecorder?.stop()
        isRecording = false
        
        let url = currentRecordingURL
        currentRecordingURL = nil
        
        print("[Recorder] Stopped recording. Duration: \(duration)s")
        return url
    }
    
    /// 取消录音
    func cancelRecording() {
        timer?.invalidate()
        timer = nil
        
        audioRecorder?.stop()
        isRecording = false
        
        // 删除临时文件
        if let url = currentRecordingURL {
            try? FileManager.default.removeItem(at: url)
        }
        currentRecordingURL = nil
    }
}

extension AudioRecorder: AVAudioRecorderDelegate {
    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        if !flag {
            print("[Recorder] Recording finished with error")
        }
    }
    
    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        print("[Recorder] Encode error: \(error?.localizedDescription ?? "unknown")")
    }
}

enum RecorderError: Error, LocalizedError {
    case recordFailed
    case permissionDenied
    
    var errorDescription: String? {
        switch self {
        case .recordFailed: return "无法开始录音"
        case .permissionDenied: return "没有麦克风权限"
        }
    }
}
