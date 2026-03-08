# Plan 1: Core Proxy Infrastructure

## Objective

Create the foundational JSON-RPC proxy that can receive requests from applications and forward them to an Ethereum node. This phase establishes the basic plumbing before adding mempool-specific logic.

## Prerequisites

- Existing project structure with Hono framework
- Node.js platform configured
- viem installed in packages/server

## Tasks

### 1.1 Update Environment Configuration

**File**: [`packages/server/src/env.ts`](../packages/server/src/env.ts)

Add environment variables for the proxy:

```typescript
export type Env = {
  DEV?: string;
  RPC_URL: string;  // Target node URL (e.g., http://localhost:8545)
};
```

**File**: [`platforms/nodejs/.env.default`](../platforms/nodejs/.env.default)

```
DEV=true
RPC_URL=http://localhost:8545
```

### 1.2 Create JSON-RPC Types

**File**: `packages/server/src/rpc/types.ts`

Define TypeScript types for JSON-RPC request/response:

```typescript
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: unknown[];
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Common Ethereum RPC methods for reference
export type EthMethod =
  | 'eth_sendRawTransaction'
  | 'eth_getTransactionByHash'
  | 'eth_getTransactionReceipt'
  | 'eth_getTransactionCount'
  | 'eth_blockNumber'
  | 'eth_call'
  | 'eth_estimateGas'
  | 'eth_gasPrice'
  | 'eth_getBalance'
  | 'eth_chainId'
  | string;  // Allow any other method
```

### 1.3 Create RPC Proxy Handler

**File**: `packages/server/src/rpc/proxy.ts`

Create the core proxy logic:

```typescript
import { JsonRpcRequest, JsonRpcResponse } from './types.js';

export interface ProxyOptions {
  targetUrl: string;
}

export async function forwardRpcRequest(
  request: JsonRpcRequest,
  options: ProxyOptions
): Promise<JsonRpcResponse> {
  const response = await fetch(options.targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: {
        code: -32603,
        message: `Upstream error: ${response.status} ${response.statusText}`,
      },
    };
  }

  return response.json() as Promise<JsonRpcResponse>;
}

export function createJsonRpcError(
  id: number | string | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, data },
  };
}

export function createJsonRpcResult(
  id: number | string | null,
  result: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}
```

### 1.4 Create RPC API Route

**File**: `packages/server/src/api/rpc.ts`

Expose the JSON-RPC endpoint:

```typescript
import { Hono } from 'hono';
import { ServerOptions } from '../types.js';
import { setup } from '../setup.js';
import { Env } from '../env.js';
import { JsonRpcRequest, JsonRpcResponse } from '../rpc/types.js';
import { forwardRpcRequest, createJsonRpcError } from '../rpc/proxy.js';

export function getRpcAPI<CustomEnv extends Env>(
  options: ServerOptions<CustomEnv>,
) {
  const app = new Hono<{ Bindings: CustomEnv }>()
    .use(setup({ serverOptions: options }))
    .post('/', async (c) => {
      const config = c.get('config');
      const targetUrl = config.env.RPC_URL;

      if (!targetUrl) {
        return c.json(
          createJsonRpcError(null, -32603, 'RPC_URL not configured'),
          500
        );
      }

      let request: JsonRpcRequest;
      try {
        request = await c.req.json();
      } catch {
        return c.json(
          createJsonRpcError(null, -32700, 'Parse error'),
          400
        );
      }

      // Validate JSON-RPC structure
      if (request.jsonrpc !== '2.0' || !request.method) {
        return c.json(
          createJsonRpcError(
            request?.id ?? null,
            -32600,
            'Invalid Request'
          ),
          400
        );
      }

      // For now, forward all requests to the target node
      // Phase 3 will add interception logic here
      const response = await forwardRpcRequest(request, { targetUrl });
      return c.json(response);
    });

  return app;
}
```

### 1.5 Register RPC Route in Server

**File**: [`packages/server/src/index.ts`](../packages/server/src/index.ts)

Add the RPC route to the server:

```typescript
import { getRpcAPI } from './api/rpc.js';

export function createServer<CustomEnv extends Env>(
  options: ServerOptions<CustomEnv>,
) {
  const app = new Hono<{ Bindings: CustomEnv }>();

  const dummy = getDummyAPI(options);
  const rpc = getRpcAPI(options);

  return app
    .use('/*', corsSetup)
    .route('/', dummy)
    .route('/rpc', rpc)  // JSON-RPC endpoint
    // ... rest of config
}
```

### 1.6 Add Health Check Endpoint

**File**: `packages/server/src/api/health.ts`

```typescript
import { Hono } from 'hono';
import { ServerOptions } from '../types.js';
import { Env } from '../env.js';

export function getHealthAPI<CustomEnv extends Env>(
  options: ServerOptions<CustomEnv>,
) {
  const app = new Hono<{ Bindings: CustomEnv }>()
    .get('/', async (c) => {
      return c.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '0.1.0',
      });
    })
    .get('/upstream', async (c) => {
      const config = c.get('config');
      const targetUrl = config?.env?.RPC_URL;

      if (!targetUrl) {
        return c.json({
          status: 'error',
          message: 'RPC_URL not configured',
        }, 503);
      }

      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_chainId',
            params: [],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return c.json({
            status: 'ok',
            chainId: data.result,
            targetUrl,
          });
        }
        
        return c.json({
          status: 'error',
          message: `Upstream returned ${response.status}`,
        }, 503);
      } catch (error) {
        return c.json({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }, 503);
      }
    });

  return app;
}
```

### 1.7 Update Node.js Platform Configuration

**File**: [`platforms/nodejs/src/cli.ts`](../platforms/nodejs/src/cli.ts)

Ensure environment variables are loaded and passed correctly:

- Verify `RPC_URL` is accessible in the env object
- Add startup logging to confirm proxy configuration

## Testing Checklist

- [ ] Start local Anvil/Hardhat node on port 8545
- [ ] Start the proxy server
- [ ] Send a simple RPC request through the proxy:
  ```bash
  curl -X POST http://localhost:3000/rpc \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
  ```
- [ ] Verify the response matches what the direct node would return
- [ ] Test health endpoints:
  - `GET /health` - returns status
  - `GET /health/upstream` - checks node connectivity
- [ ] Test error handling:
  - Invalid JSON
  - Missing method
  - Node unavailable

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/server/src/env.ts` | Modify |
| `packages/server/src/rpc/types.ts` | Create |
| `packages/server/src/rpc/proxy.ts` | Create |
| `packages/server/src/api/rpc.ts` | Create |
| `packages/server/src/api/health.ts` | Create |
| `packages/server/src/index.ts` | Modify |
| `platforms/nodejs/.env.default` | Modify |

## Success Criteria

1. Proxy transparently forwards all JSON-RPC requests to the target node
2. Responses are returned unchanged to the client
3. Health endpoints confirm proxy and upstream status
4. Error handling for malformed requests and upstream failures
5. All existing functionality continues to work

## Next Phase

Once the basic proxy is working, proceed to [Plan 2: Mempool Storage Layer](./02-mempool-storage.md) to add persistence for pending transactions.
