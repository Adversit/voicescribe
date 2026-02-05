import Foundation
import Darwin

/// 后端进程管理器
class BackendManager: ObservableObject {
    static let shared = BackendManager()

    @Published var isRunning = false
    @Published var statusMessage = "未启动"
    @Published var isInstalling = false
    @Published var installProgress: String = ""

    private var process: Process?
    private var outputPipe: Pipe?
    private var embeddedPythonHome: String?

    private init() {}

    private var allowDependencyInstall: Bool {
#if DEBUG
        return true
#else
        return ProcessInfo.processInfo.environment["VOICESCRIBE_ALLOW_PIP_INSTALL"] == "1"
#endif
    }

    private func defaultModelCacheDir() -> String {
        let supportDir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let modelDir = supportDir.appendingPathComponent("VoiceScribe").appendingPathComponent("models")
        return modelDir.path
    }

    /// 启动后端服务
    func start() {
        guard process == nil else {
            print("[BackendManager] 后端已在运行")
            return
        }

        // 查找后端路径
        guard let backendPath = findBackendPath() else {
            statusMessage = "找不到后端"
            print("[BackendManager] 找不到后端目录")
            return
        }

        print("[BackendManager] 后端路径: \(backendPath)")

        // 检查 venv 是否存在（若有嵌入式 Python 则可跳过）
        let embeddedPython = findEmbeddedPython()
        let venvPath = (backendPath as NSString).appendingPathComponent("venv")
        if !FileManager.default.fileExists(atPath: venvPath) && embeddedPython == nil {
            if allowDependencyInstall {
                print("[BackendManager] venv 不存在，开始安装依赖...")
                installDependencies(backendPath: backendPath)
            } else {
                statusMessage = "依赖缺失（需重新安装应用）"
                print("[BackendManager] 依赖缺失，已禁用自动安装")
            }
            return
        }

        // 查找 Python
        guard let pythonPath = findPython() else {
            statusMessage = "找不到 Python"
            print("[BackendManager] 找不到 Python")
            return
        }

        print("[BackendManager] 后端路径: \(backendPath)")
        print("[BackendManager] Python 路径: \(pythonPath)")

        // 设置模型缓存目录
        let modelCacheDir = defaultModelCacheDir()
        do {
            try FileManager.default.createDirectory(
                atPath: modelCacheDir,
                withIntermediateDirectories: true,
                attributes: nil
            )
        } catch {
            print("[BackendManager] 创建模型缓存目录失败: \(error)")
        }

        // 准备日志文件并写入启动信息
        let logPath = "/tmp/backend.log"
        let startupLog = """
        [BackendManager] 启动时间: \(Date())
        [BackendManager] 后端路径: \(backendPath)
        [BackendManager] Python 路径: \(pythonPath)
        [BackendManager] 模型缓存目录: \(modelCacheDir)
        [BackendManager] server.py 路径: \(backendPath)/server.py

        """
        FileManager.default.createFile(atPath: logPath, contents: startupLog.data(using: .utf8))

        let process = Process()
        process.executableURL = URL(fileURLWithPath: pythonPath)
        process.arguments = ["\(backendPath)/server.py"]  // 使用绝对路径
        process.currentDirectoryURL = URL(fileURLWithPath: backendPath)

        // 设置环境变量
        var env = ProcessInfo.processInfo.environment
        env["PYTHONUNBUFFERED"] = "1"
        // 确保 PATH 包含 Homebrew 路径（ffmpeg 等依赖）
        let homebrewPaths = "/opt/homebrew/bin:/usr/local/bin"
        if let existingPath = env["PATH"] {
            env["PATH"] = "\(homebrewPaths):\(existingPath)"
        } else {
            env["PATH"] = "\(homebrewPaths):/usr/bin:/bin"
        }
        if let pythonHome = embeddedPythonHome {
            env["PYTHONHOME"] = pythonHome
            env["PATH"] = "\(pythonHome)/bin:" + (env["PATH"] ?? "")
        }
        env["VOICESCRIBE_MODEL_DIR"] = modelCacheDir
        env["MODELSCOPE_CACHE"] = modelCacheDir
        process.environment = env

        // 捕获输出
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        self.outputPipe = pipe

        // 读取输出
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if let output = String(data: data, encoding: .utf8), !output.isEmpty {
                print("[Backend] \(output)")
                // 同时写入日志文件
                if let logHandle = FileHandle(forWritingAtPath: logPath) {
                    logHandle.seekToEndOfFile()
                    logHandle.write(data)
                    try? logHandle.close()
                }

                // 检测启动成功
                if output.contains("Uvicorn running") || output.contains("Application startup complete") {
                    DispatchQueue.main.async {
                        self?.isRunning = true
                        self?.statusMessage = "运行中"
                    }
                }
            }
        }

        // 进程终止处理
        process.terminationHandler = { [weak self] proc in
            DispatchQueue.main.async {
                self?.isRunning = false
                self?.statusMessage = "已停止 (退出码: \(proc.terminationStatus))"
                self?.process = nil
            }
        }

        do {
            try process.run()
            self.process = process
            statusMessage = "启动中..."
            print("[BackendManager] 后端进程已启动, PID: \(process.processIdentifier)")

            // 等待一小段时间后检查健康状态
            DispatchQueue.global().asyncAfter(deadline: .now() + 2) { [weak self] in
                self?.checkHealth()
            }
        } catch {
            statusMessage = "启动失败: \(error.localizedDescription)"
            print("[BackendManager] 启动失败: \(error)")
        }
    }

    /// 停止后端服务
    func stop() {
        guard let process = process, process.isRunning else {
            return
        }

        print("[BackendManager] 正在停止后端...")
        let pid = process.processIdentifier
        process.terminate()

        // 立即更新状态，避免阻塞退出
        self.process = nil
        self.isRunning = false
        self.statusMessage = "已停止"

        DispatchQueue.global(qos: .utility).async {
            let deadline = Date().addingTimeInterval(2.0)
            while process.isRunning && Date() < deadline {
                usleep(100_000)
            }
            if process.isRunning {
                print("[BackendManager] 强制终止后端, PID: \(pid)")
                kill(pid, SIGKILL)
            }
            print("[BackendManager] 后端已停止")
        }
    }

    /// 检查后端健康状态
    func checkHealth() {
        guard let url = URL(string: "http://127.0.0.1:8765/health") else { return }

        let task = URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
            DispatchQueue.main.async {
                if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                    self?.isRunning = true
                    self?.statusMessage = "运行中"
                } else if self?.process?.isRunning == true {
                    // 进程在运行但还没响应，可能还在启动
                    self?.statusMessage = "启动中..."
                }
            }
        }
        task.resume()
    }

    /// 安装 Python 依赖
    private func installDependencies(backendPath: String) {
        isInstalling = true
        installProgress = "正在初始化..."
        statusMessage = "安装依赖中..."

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }

            // 查找系统 Python
            guard let systemPython = self.findSystemPython() else {
                DispatchQueue.main.async {
                    self.isInstalling = false
                    self.statusMessage = "找不到 Python3，请先安装"
                    self.installProgress = "错误：未找到 Python3"
                }
                return
            }

            print("[BackendManager] 使用系统 Python: \(systemPython)")

            // Step 1: 创建 venv
            DispatchQueue.main.async {
                self.installProgress = "创建虚拟环境..."
            }

            let venvPath = (backendPath as NSString).appendingPathComponent("venv")
            if !self.runCommand(systemPython, args: ["-m", "venv", venvPath], workDir: backendPath) {
                DispatchQueue.main.async {
                    self.isInstalling = false
                    self.statusMessage = "创建 venv 失败"
                    self.installProgress = "错误：无法创建虚拟环境"
                }
                return
            }

            // Step 2: 升级 pip
            DispatchQueue.main.async {
                self.installProgress = "升级 pip..."
            }

            let venvPython = (venvPath as NSString).appendingPathComponent("bin/python3")
            _ = self.runCommand(venvPython, args: ["-m", "pip", "install", "--upgrade", "pip"], workDir: backendPath)

            // Step 3: 安装依赖
            DispatchQueue.main.async {
                self.installProgress = "安装依赖（可能需要几分钟）..."
            }

            let requirementsPath = (backendPath as NSString).appendingPathComponent("requirements.txt")
            if !self.runCommand(venvPython, args: ["-m", "pip", "install", "-r", requirementsPath], workDir: backendPath) {
                DispatchQueue.main.async {
                    self.isInstalling = false
                    self.statusMessage = "安装依赖失败"
                    self.installProgress = "错误：pip install 失败"
                }
                return
            }

            // 安装完成，稍等后启动后端
            DispatchQueue.main.async {
                self.installProgress = "安装完成！正在启动..."
                print("[BackendManager] 依赖安装完成，准备启动后端...")

                // 延迟 2 秒后启动，确保系统准备就绪
                DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
                    self.isInstalling = false
                    self.start()
                }
            }
        }
    }

    /// 运行命令
    private func runCommand(_ executable: String, args: [String], workDir: String) -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = args
        process.currentDirectoryURL = URL(fileURLWithPath: workDir)

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe

        // 实时读取输出
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if let output = String(data: data, encoding: .utf8), !output.isEmpty {
                print("[Install] \(output)")
                // 更新进度显示（简化输出）
                if output.contains("Collecting") || output.contains("Installing") || output.contains("Downloading") {
                    let lines = output.components(separatedBy: "\n")
                    if let firstLine = lines.first(where: { !$0.isEmpty }) {
                        let shortLine = String(firstLine.prefix(50))
                        DispatchQueue.main.async {
                            self?.installProgress = shortLine + "..."
                        }
                    }
                }
            }
        }

        do {
            try process.run()
            process.waitUntilExit()
            pipe.fileHandleForReading.readabilityHandler = nil
            return process.terminationStatus == 0
        } catch {
            print("[BackendManager] 命令执行失败: \(error)")
            return false
        }
    }

    /// 查找系统 Python（不依赖 venv）
    private func findSystemPython() -> String? {
        let pythonPaths = [
            "/opt/homebrew/bin/python3",
            "/usr/local/bin/python3",
            "/usr/bin/python3",
        ]

        for path in pythonPaths {
            if FileManager.default.fileExists(atPath: path) {
                return path
            }
        }

        // 使用 which 命令查找
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        process.arguments = ["python3"]
        let pipe = Pipe()
        process.standardOutput = pipe

        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
               !path.isEmpty {
                return path
            }
        } catch {
            print("[BackendManager] which python3 失败: \(error)")
        }

        return nil
    }

    /// 查找后端路径（优先使用 .app bundle 内的后端）
    private func findBackendPath() -> String? {
        // 1. 优先检查 .app bundle 内的后端（如果有 venv）
        if let bundlePath = Bundle.main.resourcePath {
            let backendInBundle = (bundlePath as NSString).appendingPathComponent("backend")
            let serverPath = (backendInBundle as NSString).appendingPathComponent("server.py")
            let venvPath = (backendInBundle as NSString).appendingPathComponent("venv")

            if FileManager.default.fileExists(atPath: serverPath) {
                // 如果有 venv，优先使用 bundle 内的后端
                if FileManager.default.fileExists(atPath: venvPath) {
                    print("[BackendManager] 使用 bundle 内后端: \(backendInBundle)")
                    return backendInBundle
                }
            }
        }

        // 2. 检查项目目录（开发模式）
        if let executablePath = Bundle.main.executablePath {
            let appDir = (executablePath as NSString).deletingLastPathComponent
            let possiblePaths = [
                (appDir as NSString).appendingPathComponent("../../../backend"),  // 开发模式: app/.build/debug/
                (appDir as NSString).appendingPathComponent("../../../../backend"),  // .app 在 app/build/ 下
                (appDir as NSString).appendingPathComponent("../../../../../backend"),  // .app 在 build/ 下
            ]

            for path in possiblePaths {
                let resolved = (path as NSString).standardizingPath
                let serverPath = (resolved as NSString).appendingPathComponent("server.py")
                let venvPath = (resolved as NSString).appendingPathComponent("venv")
                if FileManager.default.fileExists(atPath: serverPath) &&
                   FileManager.default.fileExists(atPath: venvPath) {
                    print("[BackendManager] 使用项目目录后端: \(resolved)")
                    return resolved
                }
            }
        }

        // 3. 检查 .app bundle 内的后端（无 venv，需要安装）
        if let bundlePath = Bundle.main.resourcePath {
            let backendInBundle = (bundlePath as NSString).appendingPathComponent("backend")
            if FileManager.default.fileExists(atPath: (backendInBundle as NSString).appendingPathComponent("server.py")) {
                print("[BackendManager] 使用 bundle 内后端（需安装依赖）: \(backendInBundle)")
                return backendInBundle
            }
        }

        return nil
    }

    /// 查找 Python 解释器（优先使用 venv）
    private func findPython() -> String? {
        if let embedded = findEmbeddedPython() {
            print("[BackendManager] 使用嵌入式 Python: \(embedded)")
            return embedded
        }

        // 查找后端目录下的 venv
        if let backendPath = findBackendPath() {
            // 检查 venv 中的 Python（使用符号链接也算存在）
            let venvPython = (backendPath as NSString).appendingPathComponent("venv/bin/python3")
            var isDir: ObjCBool = false
            if FileManager.default.fileExists(atPath: venvPython, isDirectory: &isDir) && !isDir.boolValue {
                print("[BackendManager] 找到 venv Python: \(venvPython)")
                return venvPython
            }
            let venvPython2 = (backendPath as NSString).appendingPathComponent("venv/bin/python")
            if FileManager.default.fileExists(atPath: venvPython2, isDirectory: &isDir) && !isDir.boolValue {
                print("[BackendManager] 找到 venv Python: \(venvPython2)")
                return venvPython2
            }
            print("[BackendManager] venv Python 不存在: \(venvPython)")
        }

        // 常见 Python 路径（仅作为后备）
        print("[BackendManager] 警告：使用系统 Python，可能缺少依赖")
        let pythonPaths = [
            "/opt/homebrew/bin/python3",
            "/usr/local/bin/python3",
            "/usr/bin/python3",
        ]

        for path in pythonPaths {
            if FileManager.default.fileExists(atPath: path) {
                return path
            }
        }

        // 使用 which 命令查找
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        process.arguments = ["python3"]
        let pipe = Pipe()
        process.standardOutput = pipe

        do {
            try process.run()
            process.waitUntilExit()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
               !path.isEmpty {
                return path
            }
        } catch {
            print("[BackendManager] which python3 失败: \(error)")
        }

        return nil
    }

    /// 查找嵌入式 Python（位于 app bundle）
    private func findEmbeddedPython() -> String? {
        if let bundlePath = Bundle.main.resourcePath {
            let pythonHome = (bundlePath as NSString).appendingPathComponent("python")
            let pythonBin = (pythonHome as NSString).appendingPathComponent("bin/python3")
            if FileManager.default.fileExists(atPath: pythonBin) {
                embeddedPythonHome = pythonHome
                return pythonBin
            }
        }
        return nil
    }
}
