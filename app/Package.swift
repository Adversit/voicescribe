// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "VoiceScribe",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "VoiceScribe", targets: ["VoiceScribe"])
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "VoiceScribe",
            path: "VoiceScribe",
            linkerSettings: [
                .linkedFramework("Carbon"),
                .linkedFramework("AVFoundation"),
            ]
        )
    ]
)
