import { ServerConfig } from "./types";
import fs from "fs";
import yaml from "js-yaml";

type Config = ServerConfig & { type: "server" };

export class ConfigManager {
  private config: Config;

  constructor(configPath: string) {
    const configFile = fs.readFileSync(configPath, "utf8");
    const loadedConfig = yaml.load(configFile) as Partial<ServerConfig>;
    this.config = {
      ...loadedConfig,
    } as Config;
    this.validate();
  }

  public getAll () {
    return this.config;
  }

  private validate(): void {
    const requiredFields: (keyof ServerConfig)[] = [
      "path",
      "webSocketPort"
    ];

    for (const field of requiredFields) {
      if (!(field in this.config)) {
        throw new Error(
          `Missing required field in client configuration: ${field}`
        );
      }
    }

    if (typeof this.config.webSocketPort !== "number") {
      throw new Error(
        `Invalid value for webSocketPort in client configuration: ${this.config.webSocketPort}`
      );
    }
  }

  get<K extends keyof ServerConfig>(key: K): ServerConfig[K];
  get(key: string): unknown {
    return this.config[key as keyof Config];
  }
}
