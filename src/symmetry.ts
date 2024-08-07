#!/usr/bin/env node
import { Command } from "commander";
import os from "os";
import path from "path";

import { SymmetryServer } from "./server";

const program = new Command();

program
  .version("1.0.0")
  .description("symmetry server")
  .option(
    "-c, --config <path>",
    "Path to config file",
    path.join(os.homedir(), ".config", "symmetry", "server.yaml")
  )
  .action(() => {
    const server = new SymmetryServer(program.opts().config);
    server.init();
  });

program
  .command("delete-peer <peerKey>")
  .description("Delete a peer from the server")
  .action(async (peerKey) => {
    const server = new SymmetryServer(program.opts().config);
    try {
      await server.init(); // Initialize the server (this sets up the database connection)
      const result = await server.deletePeer(peerKey);
      if (result) {
        console.log(`Peer ${peerKey} deleted successfully`);
      } else {
        console.log(`No peer found with key ${peerKey}`);
      }
    } catch (error) {
      console.error(`Error deleting peer: ${error}`);
    } finally {
      process.exit(0);
    }
  });

program.parse(process.argv);
