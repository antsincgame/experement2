const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Block workspace/ and agent/ from Metro bundler to prevent OOM with 50+ generated projects
const workspaceDir = path.resolve(__dirname, "workspace").replace(/\\/g, "/");
const agentDir = path.resolve(__dirname, "agent").replace(/\\/g, "/");

const existingBlockList = config.resolver.blockList || [];
const extraBlockList = [
  /[/\\]workspace[/\\].*/,
  /[/\\]agent[/\\].*/,
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
