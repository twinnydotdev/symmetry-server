# Symmetry Server

Symmetry Server is a powerful and flexible server component of the Symmetry system, designed to facilitate distributed AI inference.

## Table of Contents

- [Symmetry Server](#symmetry-server)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Usage](#usage)
    - [Command-line Options](#command-line-options)
  - [Features](#features)
  - [License](#license)

## Installation

To install Symmetry Server, follow these steps:

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/symmetry-server.git
   cd symmetry-server
   ```

2. Install dependencies:
   ```
   npm install
   ```

## Configuration

Symmetry Server uses a YAML configuration file. By default, it looks for the config file at:

```
~/.config/symmetry/server.yaml
```

You can specify a custom config file path using the `-c` or `--config` option when running the server.

## Usage

To start the Symmetry Server, run:

```
node symmetry-server.js
```

Or if you've set up the apropriate permissions:

```
./symmetry-server.js
```

### Command-line Options

- `-c, --config <path>`: Specify a custom path for the configuration file
- `-v, --version`: Display the version number
- `-h, --help`: Display help information

## Features

- Distributed AI inference
- Configurable through YAML files
- Built on Hyperswarm for peer-to-peer networking
- Extensible architecture

## License

This project is licensed under the [MIT License](LICENSE).