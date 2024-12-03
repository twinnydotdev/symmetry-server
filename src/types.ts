import { StreamMetrics } from "symmetry-core";

export interface ServerConfig {
  path: string;
  wsPort: number;
  publicKey: string;
  privateKey: string;
}

export interface ClientMessage<T = unknown> {
  key: string;
  data?: T;
}

export interface Session {
  id: string;
  providerId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface PeerSessionRequest {
  modelName: string;
  preferredProviderId?: string;
}

export interface ChallengeRequest extends Session {
  challenge: Buffer;
}

export interface PeerWithSession extends Session {
  peer_key: string | null;
  discovery_key: string | null;
  model_name: string | null;
}

export interface PeerUpsert {
  key: string;
  discoveryKey: string;
  dataCollectionEnabled: boolean;
  modelName?: string;
  public?: boolean;
  serverKey?: string;
  maxConnections: number;
  name: string;
  website: string;
  apiProvider: string;
}

export interface DbPeer {
  key: string;
  discovery_key: string;
  model_name?: string;
  public?: boolean;
  server_key?: string;
  data_collection_enabled: boolean;
  max_connections: number;
  connections?: number;
  created_at: Date;
  name: string;
  website: string;
  online?: boolean;
  updated_at: Date;
  provider: string;
  points?: number;
}

export interface ConnectionSizeUpdate {
  connections: number;
}

export interface PeerReward {
  peer_key: string;
  points: number;
  total_connection_time: number;
  last_points_update: Date;
}

export interface PeerConnection {
  peer_key: string;
  connected_at: Date;
  disconnected_at?: Date;
  points_earned: number;
}

export interface IpMessageRow {
  id: number;
  ip_address: string;
  message_count: number;
  first_seen: string;
  last_seen: string;
}

export interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  totalRequestsToday: number;
  totalRequests: number;
  averageSessionMinutes: number;
  totalProviderTime: number;
}

export interface StreamMetricsState {
  totalTokens: number;
  checkpoints: number;
  totalBytes: number;
  totalProcessTime: number;
  averageTokenLength: number;
  startTime: number;
  averageTokensPerSecond: number;
}

export interface CompletionMetrics {
  requestId: string;
  checkpoints: StreamMetrics[];
  state: StreamMetricsState;
  peerId: string;
  timestamp: number;
}