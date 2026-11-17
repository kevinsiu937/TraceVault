import { type NetConnectHook, ShellProxy, type ShellProxyOwner } from "../capture/ShellProxy.js";

const PROXY_VARIABLES = ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"];
// Set by someone else, any of these means the shell already has a proxy and is left alone.
const EXISTING_PROXY_VARIABLES = [...PROXY_VARIABLES, "ALL_PROXY", "all_proxy"];
const LOCAL_HOSTS = "localhost,127.0.0.1,::1";

/**
 * Points each bash call's shell at a proxy of its own (ticket 87). A port
 * belongs to one call, so every connection on it is that call's; ports stay
 * open until OpenCode exits, so a background process keeps its call.
 */
export class ShellProxies {
  /** `environment` is OpenCode's own, which the shell inherits beneath the hook's `env`. */
  constructor(private readonly environment: Readonly<Record<string, string | undefined>> = process.env) {}

  /** Sets the call's proxy variables, or resolves with why the shell is not watched and leaves `env` alone. */
  async point(owner: ShellProxyOwner, env: Record<string, string>, record: (connection: NetConnectHook) => void): Promise<string | null> {
    const existing = EXISTING_PROXY_VARIABLES.find((name) => (env[name] ?? this.environment[name] ?? "") !== "");
    if (existing !== undefined) {
      return `shell not watched for call ${owner.callID}: ${existing} was already set`;
    }
    let port: number;
    try {
      port = await new ShellProxy(owner, record).listen();
    } catch (error) {
      return `shell not watched for call ${owner.callID}: the proxy could not listen (${error instanceof Error ? error.message : String(error)})`;
    }
    for (const name of PROXY_VARIABLES) {
      env[name] = `http://127.0.0.1:${port}`;
    }
    for (const name of ["NO_PROXY", "no_proxy"]) {
      const current = env[name] ?? this.environment[name] ?? "";
      env[name] = current === "" ? LOCAL_HOSTS : `${current},${LOCAL_HOSTS}`;
    }
    return null;
  }
}
