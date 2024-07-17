#!/usr/bin/env node
import { Command } from "commander";
import os from "os";
import path from "path";

import { SymmetryClient } from "./client";
import { SymmetryServer } from "./server";

const program = new Command();

program
  .version("1.0.0")
  .description("symmetry cli")
  .option(
    "-c, --client <path>",
    "Path to config file",
    path.join(os.homedir(), ".config", "symmetry", "client.yaml")
  )
  .option(
    "-s, --server <path>",
    "Path to config file",
    path.join(os.homedir(), ".config", "symmetry", "server.yaml")
  );

program
  .command("init <name>")
  .description("Initialize a new provider")
  .action(async (name) => {
    const client = new SymmetryClient(program.opts().client);
    await client.init(name);
  });

program
  .command("serve")
  .description("Initialize a new server")
  .action(() => {
    const server = new SymmetryServer(program.opts().server);
    server.init();
  });

program.parse(process.argv);
