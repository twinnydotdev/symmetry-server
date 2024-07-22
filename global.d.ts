/* eslint-disable @typescript-eslint/no-explicit-any */
declare module "hyperswarm" {
  import { EventEmitter } from "events";

  export interface Swarm {
    flushed(): Promise<void>;
  }

  export interface JoinOptions {
    client?: boolean;
    server?: boolean;
  }
  
  export interface SwarmOptions {
    keyPair?: any;
    seed?: Buffer;
    maxPeers?: number;
    firewall?: (remotePublicKey: string) => boolean;
    dht?: any;
  }

  export default class Hyperswarm extends EventEmitter {
    constructor(opts?: SwarmOptions);
    join(topic: string | Buffer, opts?: JoinOptions): Swarm;
    on: (key: string, cb: (data: any) => void) => void;
    once: (key: string, cb: (data: any) => void) => void;
    flush: () => void;
    leave(topic: Buffer): void;
    destroy(): Promise<void>;
    peers: Map<string, any>;
    connections: Map<string, any>;
    connecting: boolean;
  }
}

declare module "hypercore-crypto" {
  const hyperCoreCrypto: {
    keyPair: () => { publicKey: Buffer; secretKey: Buffer }
    discoveryKey: (publicKey: Buffer) => Buffer;
  };

  export = hyperCoreCrypto;
}
declare module "b4a" {
  const b4a: {
    from(data: string | ArrayBuffer | Buffer, encoding?: string): Buffer;
    toString(buf: Buffer, encoding?: string): string;
    alloc(size: number): Buffer;
    allocUnsafe(size: number): Buffer;
  };

  export = b4a;
}
