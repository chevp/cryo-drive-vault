/**
 * JSON-RPC 2.0 over newline-delimited JSON (NDJSON) on stdio — the same
 * transport and envelope as kosmos-runtime (tools/kosmos-runtime/protocol).
 * The kosmos container spawns `cdv serve`, writes one request object per line
 * to stdin, and reads responses + progress notifications (one object per line)
 * from stdout. stderr is for human diagnostics only, never protocol.
 *
 *   request   → { jsonrpc:"2.0", id, method, params }
 *   response  ← { jsonrpc:"2.0", id, result }
 *   error     ← { jsonrpc:"2.0", id, error:{ code, message, data? } }
 *   notify    ← { jsonrpc:"2.0", method, params }        // no id, no reply
 *
 * Closing the child's stdin (EOF) is the normal shutdown signal.
 */

export interface RpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: RpcError;
}

export interface RpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

export const ERR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;
