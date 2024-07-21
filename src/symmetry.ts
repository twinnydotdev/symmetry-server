#!/usr/bin/env node
import { Command } from "commander";
import os from "os";
import path from "path";

import { SymmetryServer } from "./server";

const program = new Command();

program
  .version("1.0.0")
  .description("symmetry cli")
  .option(
    "-c, --config <path>",
    "Path to config file",
    path.join(os.homedir(), ".config", "symmetry", "server.yaml")
  )
  .action(() => {
    const server = new SymmetryServer(program.opts().config);
    server.init();
  });

program.parse(process.argv);
