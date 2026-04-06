const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Block workspace/ and agent/ from Metro bundler to prevent OOM with 50+ generated projects
const workspaceDir = path.resolve(__dirname, "workspace").replace(/\\/g, "/");
const agentDir = path.resolve(__dirname, "agent").replace(/\\/g, "/");

// Use absolute paths to avoid matching src/features/workspace/
const existingBlockList = config.resolver.blockList || [];
const wsEscaped = workspaceDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const agEscaped = agentDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const extraBlockList = [
  new RegExp(`^${wsEscaped}[\\\\/].*`),
  new RegExp(`^${agEscaped}[\\\\/].*`),
];
config.resolver.blockList = Array.isArray(existingBlockList)
  ? [...existingBlockList, ...extraBlockList]
  : extraBlockList;

// Force zustand to resolve to CJS instead of ESM (ESM uses import.meta which crashes Hermes)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "zustand" || moduleName.startsWith("zustand/")) {
    const cjsPath = moduleName === "zustand"
      ? path.resolve(__dirname, "node_modules/zustand/index.js")
      : path.resolve(__dirname, "node_modules", moduleName + ".js");

    if (require("fs").existsSync(cjsPath)) {
      return { type: "sourceFile", filePath: cjsPath };
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./src/global.css" });
