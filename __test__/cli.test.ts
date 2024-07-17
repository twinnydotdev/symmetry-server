import { SymmetryClient } from "../src/client";
import fs from "fs";
import yaml from "js-yaml";

jest.mock("hyperswarm", () => {
  return jest.fn().mockImplementation(() => ({
    join: jest
      .fn()
      .mockReturnValue({ flushed: jest.fn().mockResolvedValue(undefined) }),
    on: jest.fn(),
    destroy: jest.fn().mockResolvedValue(undefined),
    flush: jest.fn().mockResolvedValue(undefined),
  }));
});

jest.mock("hyperdrive", () => {
  return jest.fn().mockImplementation(() => ({
    ready: jest.fn().mockResolvedValue(undefined),
    discoveryKey: "mock-discovery-key",
    close: jest.fn().mockResolvedValue(undefined),
  }));
});

jest.mock("localdrive", () => {
  return jest.fn().mockImplementation(() => ({
    mirror: jest
      .fn()
      .mockReturnValue({ done: jest.fn().mockResolvedValue(undefined) }),
    close: jest.fn().mockResolvedValue(undefined),
  }));
});

jest.mock("corestore", () => jest.fn());

jest.mock("fs", () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.mock("js-yaml", () => ({
  load: jest.fn(),
}));

jest.mock("../src/constants", () => ({
  apiProviders: {
    Ollama: "Ollama",
    OpenWebUI: "OpenWebUI",
    LlamaCpp: "LlamaCpp",
    LiteLLM: "LiteLLM",
  },
  NORMALIZE_REGEX: /test-regex/,
}));

describe("Symmetry", () => {
  let writer: SymmetryClient;
  const mockConfig = {
    path: "/test/path",
    temperature: 1,
    apiHostname: "test.api.com",
    apiPort: 443,
    apiPath: "/v1/chat",
    apiProtocol: "https",
    apiKey: "test-api-key",
    apiProvider: "test-provider",
    modelName: "test-model",
    name: "test",
    public: true,
    serverKey: "test-server-key",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (yaml.load as jest.Mock).mockReturnValue(mockConfig);
    writer = new SymmetryClient("mock-config.yaml");
  });

  test("init method sets up the writer correctly", async () => {
    await writer.init("test");
    expect(writer._providers).toBeTruthy();
  });

  test("loadConfig loads and parses YAML file correctly", () => {
    expect(fs.readFileSync).toHaveBeenCalledWith("mock-config.yaml", "utf8");
    expect(yaml.load).toHaveBeenCalled();
    expect(writer._config).toBeDefined();
  });

  test("buildStreamRequest creates correct request object", () => {
    const messages = [{ role: "user", content: "Hello" }];
    const result = writer.buildStreamRequest(messages);

    expect(result.requestOptions).toEqual({
      hostname: "test.api.com",
      port: 443,
      path: "/v1/chat",
      protocol: "https",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-api-key",
      },
    });

    expect(result.requestBody).toEqual({
      model: "test-model",
      messages,
      temperature: 1,
      stream: true,
    });
  });
});
