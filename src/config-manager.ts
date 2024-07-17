import { ClientConfig, ServerConfig } from "./types";
import fs from "fs";
import yaml from "js-yaml";

type Config =
  | (ClientConfig & { type: "client" })
  | (ServerConfig & { type: "server" });

export class ConfigManager {
  private config: Config;

  constructor(configPath: string, isClient: boolean) {
    const configFile = fs.readFileSync(configPath, "utf8");
    const loadedConfig = yaml.load(configFile) as Partial<
      ClientConfig & ServerConfig
    >;
    this.config = {
      ...loadedConfig,
      type: isClient ? "client" : "server",
    } as Config;
    this.validate();
  }

  private validate(): void {
    if (this.config.type === "client") {
      this.validateClientConfig(this.config);
    } else {
      this.validateServerConfig(this.config);
    }
  }

  private validateClientConfig(
    config: ClientConfig & { type: "client" }
  ): void {
    const requiredFields: (keyof ClientConfig)[] = [
      "apiHostname",
      "apiPath",
      "apiPort",
      "apiProtocol",
      "apiProvider",
      "modelName",
      "path",
      "public",
      "serverKey",
    ];

    for (const field of requiredFields) {
      if (!(field in config)) {
        throw new Error(
          `Missing required field in client configuration: ${field}`
        );
      }
    }

    if (typeof config.public !== "boolean") {
      throw new Error(
        'The "public" field in client configuration must be a boolean'
      );
    }
  }

  private validateServerConfig(
    config: ServerConfig & { type: "server" }
  ): void {
    if (!config.path) {
      throw new Error("Missing required field in server configuration: path");
    }
  }

  get<K extends keyof ClientConfig>(key: K): ClientConfig[K];
  get<K extends keyof ServerConfig>(key: K): ServerConfig[K];
  get(key: string): unknown {
    return this.config[key as keyof Config];
  }

  isClientConfig(): this is ConfigManager & {
    config: ClientConfig & { type: "client" };
  } {
    return this.config.type === "client";
  }

  isServerConfig(): this is ConfigManager & {
    config: ServerConfig & { type: "server" };
  } {
    return this.config.type === "server";
  }
}

export function createConfigManager(
  configPath: string,
  isClient: boolean
): ConfigManager {
  return new ConfigManager(configPath, isClient);
}

export function createConfigManagerClient(
  configPath: string,
): ConfigManager {
  return new ConfigManager(configPath, true);
}