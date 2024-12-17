import fs from "fs";
import yaml from "js-yaml";

import { Config } from "./types";

export class ServerConfig {
  private config: Config;

  constructor(configPath: string) {
    const configFile = fs.readFileSync(configPath, "utf8");
    const loadedConfig = yaml.load(configFile) as Partial<Config>;
    this.config = {
      ...loadedConfig,
    } as Config;
    this.validate();
  }

  public getAll() {
    return this.config;
  }

  private validate(): void {
    const requiredFields: (keyof Config)[] = [
      "path",
      "publicKey",
      "privateKey",
      "allowedOrigins",
      "apiPort",
    ];

    for (const field of requiredFields) {
      if (!(field in this.config)) {
        throw new Error(
          `Missing required field in client configuration: ${field}`
        );
      }
    }

    if (typeof this.config.apiPort !== "number") {
      throw new Error(
        `Invalid value for wsPort in client configuration: ${this.config.apiPort}`
      );
    }
  }

  get<K extends keyof Config>(key: K): Config[K];
  get(key: string): unknown {
    return this.config[key as keyof Config];
  }
}
