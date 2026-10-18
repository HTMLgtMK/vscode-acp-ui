/**
 * Maps Node `process.platform` / `process.arch` to registry binary target keys.
 */
export function platformTargetKey(platform: string, arch: string): string | undefined {
    let osPrefix: string | undefined;
    if (platform === "darwin") {
        osPrefix = "darwin";
    } else if (platform === "linux") {
        osPrefix = "linux";
    } else if (platform === "win32") {
        osPrefix = "windows";
    }
    if (osPrefix === undefined) {
        return undefined;
    }
    let archSuffix: string | undefined;
    if (arch === "arm64") {
        archSuffix = "aarch64";
    } else if (arch === "x64") {
        archSuffix = "x86_64";
    }
    if (archSuffix === undefined) {
        return undefined;
    }
    return `${osPrefix}-${archSuffix}`;
}
