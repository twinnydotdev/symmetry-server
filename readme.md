# Symmetry Server

Symmetry Server is a powerful and flexible server component of the Symmetry network, designed to facilitate distributed AI inference between connected peers on the symmetry network.

## Table of Contents

- [Symmetry Server](#symmetry-server)
  - [Table of Contents](#table-of-contents)
  - [Installation](#installation)
  - [Configuration](#configuration)
  - [Usage](#usage)
    - [Command-line Options](#command-line-options)
  - [License](#license)
  - [Acknowledgments](#acknowledgments)

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

Your config file should look like this

```
path: /home/twinnydotdev/.config/symmetry/server # The path to your config file.
wsPort: 4005 # The port to use for WebSocket connections.
publicKey: 4b4a9cc325d134dee6679e9407420023531fd7e96c563f6c5d00fd5549b77435
privateKey: xxx # The private key.
```

You can create a public and private key using [hypercore-crypto](https://github.com/holepunchto/hypercore-crypto)

```js
const crypto = require('hypercore-crypto')

const keyPair = crypto.keyPair()
console.log(keyPair.publicKey.toString('hex'))
console.log(keyPair.secretKey.toString('hex'))
```

You can specify a custom config file path using the `-c` or `--config` option when running the server.

## Usage

To start the Symmetry Server, run:

_Development_

```
npm run dev
```

_Production_

```
npm run build
```

Then

```
node dist/symmetry-server.js
```

Or

```
pm2 start dist/symmetry-server.js
```


### Command-line Options

```bash
Options:
  -V, --version          output the version number
  -c, --config <path>    Path to config file (default: "/home/richard/.config/symmetry/server.yaml")
  -h, --help             display help for command

Commands:
  delete-peer <peerKey>  Delete a peer from the network
```

## License

This project is licensed under the [MIT License](LICENSE).

## Acknowledgments

We thank [Hyperswarm](https://github.com/holepunchto/hyperswarm) for providing the underlying peer-to-peer networking capabilities.