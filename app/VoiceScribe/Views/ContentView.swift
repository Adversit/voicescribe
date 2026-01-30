import SwiftUI

enum SettingsSection: String, CaseIterable, Identifiable {
    case general = "通用"
    case engine = "引擎"
    case vocabulary = "词汇"
    case speaker = "说话人"
    case hotkey = "快捷键"

    var id: String { rawValue }

    var icon: String {
        switch self {
        case .general: return "gear"
        case .engine: return "cpu"
        case .vocabulary: return "textformat"
        case .speaker: return "person.2"
        case .hotkey: return "keyboard"
        }
    }
}

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    @State private var selectedSection: SettingsSection = .general

    var body: some View {
        NavigationSplitView {
            // 左侧导航栏
            List(SettingsSection.allCases, selection: $selectedSection) { section in
                Label(section.rawValue, systemImage: section.icon)
                    .tag(section)
            }
            .listStyle(.sidebar)
            .navigationTitle("设置")
        } detail: {
            // 右侧内容区
            Group {
                switch selectedSection {
                case .general:
                    GeneralSettingsView()
                case .engine:
                    EngineSettingsView()
                case .vocabulary:
                    VocabularySettingsView()
                case .speaker:
                    SpeakerSettingsView()
                case .hotkey:
                    HotkeySettingsView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minWidth: 700, minHeight: 450)
        .toolbar {
            ToolbarItem {
                ConnectionStatusView()
            }
        }
    }
}

// MARK: - Connection Status View

struct ConnectionStatusView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(appState.backendConnected ? Color.green : Color.red)
                .frame(width: 8, height: 8)

            Text(appState.backendConnected ? "已连接" : "未连接")
                .font(.caption)
        }
    }
}
