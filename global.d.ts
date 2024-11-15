
declare module "hyperswarm" {
  import { EventEmitter } from "events";
  import { Peer } from "symmetry-core";

  export interface Swarm {
    flushed(): Promise<void>;
  }

  export interface JoinOptions {
    client?: boolean;
    server?: boolean;
  }
  
  export interface SwarmOptions {
    keyPair?: { publicKey: Buffer; secretKey: Buffer };
    seed?: Buffer;
    maxPeers?: number;
    firewall?: (remotePublicKey: string) => boolean;
    dht?: unknown;
  }

  export default class Hyperswarm extends EventEmitter {
    constructor(opts?: SwarmOptions);
    join(topic: string | Buffer, opts?: JoinOptions): Swarm;
    on: (key: string, cb: (data: Peer) => void) => void;
    once: (key: string, cb: (data: Peer) => void) => void;
    flush: () => void;
    leave(topic: Buffer): void;
    destroy(): Promise<void>;
    peers: Map<string, Peer>;
    connections: Map<string, Peer>;
    connecting: boolean;
  }
}

declare module "hypercore-crypto" {
  const hyperCoreCrypto: {
    keyPair: () => { publicKey: Buffer; secretKey: Buffer }
    discoveryKey: (publicKey: Buffer) => Buffer;
    sign(message, secretKey) : Buffer;
  };

  export = hyperCoreCrypto;
}
