#!/usr/bin/env node
import { Command } from "commander";
import os from "os";
import path from "path";
import { SymmetryServer } from "./server";

const program = new Command();
const defaultConfig = path.join(os.homedir(), ".config", "symmetry", "server.yaml");

program
  .version("1.0.0")
  .description("symmetry server")
  .option("-c, --config <path>", "Path to config file", defaultConfig);

const createServer = (configPath: string) => {
  const server = new SymmetryServer(configPath);
  return server;
};

program
  .command("start")
  .description("Start the symmetry server")
  .action(async () => {
    const server = createServer(program.opts().config);
    await server.init();
  });

program
  .command("delete-peer <peerKey>")
  .description("Delete a peer from the server")
  .action(async (peerKey) => {
    const server = createServer(program.opts().config);
    try {
      await server.init();
      const result = await server.deletePeer(peerKey);
      console.log(result 
        ? `Peer ${peerKey} deleted successfully`
        : `No peer found with key ${peerKey}`);
    } catch (error) {
      console.error(`Error deleting peer: ${error}`);
    } finally {
      process.exit(0);
    }
  });

program.parse(process.argv);