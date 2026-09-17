// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Example",
    platforms: [.iOS(.v16)],
    targets: [.target(name: "Example", path: "App")]
)
