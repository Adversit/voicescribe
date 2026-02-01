import Foundation

/// 后端进程管理器
class BackendManager: ObservableObject {
    static let shared = BackendManager()

    @Published var isRunning = false
    @Published var statusMessage = "未启动"
    @Published var isInstalling = false
    @Published var installProgress: String = ""

    private var process: Process?
    private var outputPipe: Pipe?

    private init() {}

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

        // 检查 venv 是否存在
        let venvPath = (backendPath as NSString).appendingPathComponent("venv")
        if !FileManager.default.fileExists(atPath: venvPath) {
            print("[BackendManager] venv 不存在，开始安装依赖...")
            installDependencies(backendPath: backendPath)
            return
        }

        // 查找 Python
        guard let pythonPath = findPython() else {
            statusMessage = "找不到 Python"
            print("[BackendManager] 找不到 Python")
            return
        }

        print("[BackendManager] Python 路径: \(pythonPath)")

        let process = Process()
        process.executableURL = URL(fileURLWithPath: pythonPath)
        process.arguments = ["server.py"]
        process.currentDirectoryURL = URL(fileURLWithPath: backendPath)

        // 设置环境变量
        var env = ProcessInfo.processInfo.environment
        env["PYTHONUNBUFFERED"] = "1"
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
        process.terminate()

        // 同步等待进程结束，确保应用退出前后端已关闭
        process.waitUntilExit()
        self.process = nil
        self.isRunning = false
        self.statusMessage = "已停止"
        print("[BackendManager] 后端已停止")
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

    /// 查找后端路径（优先使用原始项目目录，因为那里有完整的 venv）
    private func findBackendPath() -> String? {
        // 1. 检查应用同级目录（优先，因为有完整 venv）
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
                // 优先选择有 venv 的目录
                if FileManager.default.fileExists(atPath: serverPath) &&
                   FileManager.default.fileExists(atPath: venvPath) {
                    return resolved
                }
            }

            // 再次检查，这次不要求 venv
            for path in possiblePaths {
                let resolved = (path as NSString).standardizingPath
                if FileManager.default.fileExists(atPath: (resolved as NSString).appendingPathComponent("server.py")) {
                    return resolved
                }
            }
        }

        // 2. 检查 .app bundle 内的后端（作为备选）
        if let bundlePath = Bundle.main.resourcePath {
            let backendInBundle = (bundlePath as NSString).appendingPathComponent("backend")
            if FileManager.default.fileExists(atPath: (backendInBundle as NSString).appendingPathComponent("server.py")) {
                return backendInBundle
            }
        }

        // 3. 开发时的相对路径
        let devPath = "./backend"
        if FileManager.default.fileExists(atPath: (devPath as NSString).appendingPathComponent("server.py")) {
            return devPath
        }

        return nil
    }

    /// 查找 Python 解释器
    private func findPython() -> String? {
        // 查找后端目录下的 venv
        if let backendPath = findBackendPath() {
            let venvPython = (backendPath as NSString).appendingPathComponent("venv/bin/python3")
            if FileManager.default.fileExists(atPath: venvPython) {
                return venvPython
            }
            let venvPython2 = (backendPath as NSString).appendingPathComponent("venv/bin/python")
            if FileManager.default.fileExists(atPath: venvPython2) {
                return venvPython2
            }
        }

        // 常见 Python 路径
        let pythonPaths = [
            "/usr/local/bin/python3",
            "/opt/homebrew/bin/python3",
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
}
