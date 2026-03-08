# Plan 5: UI Foundation

## Objective

Build a simple web interface for visualizing and managing the debug mempool. This UI allows developers to manually pause/resume the mempool, inspect pending transactions, and force-include or drop specific transactions without using curl or scripts.

## Prerequisites

- Plan 1-4 completed (Proxy, Storage, Interception, API)
- Management API fully functional

## Architecture Decision

**Approach: Server-rendered HTML with minimal JavaScript**

Given this is a debugging tool primarily for local development, a simple server-rendered approach is recommended:

- HTML templates served by Hono
- Minimal vanilla JavaScript for interactivity
- HTMX for dynamic updates without full page reloads
- Simple CSS (or Tailwind CDN) for styling

This keeps the tool lightweight and avoids build complexity for what is essentially a debug utility.

## Tasks

### 5.1 Add Static File Serving

**File**: `packages/server/src/ui/index.ts`

Set up UI routes:

```typescript
import { Hono } from 'hono';
import { html } from 'hono/html';
import { ServerOptions } from '../types.js';
import { setup } from '../setup.js';
import { Env } from '../env.js';
import { dashboard } from './pages/dashboard.js';
import { transactionList } from './components/transaction-list.js';
import { stateControls } from './components/state-controls.js';

export function getUIRoutes<CustomEnv extends Env>(
  options: ServerOptions<CustomEnv>,
) {
  const app = new Hono<{ Bindings: CustomEnv }>()
    .use(setup({ serverOptions: options }))

    // Main dashboard
    .get('/', async (c) => {
      const config = c.get('config');
      const storage = config.storage;

      const state = {
        paused: await storage.isPaused(),
        minGasPrice: await storage.getMinGasPrice(),
        autoForward: await storage.isAutoForward(),
      };

      const stats = await storage.getStats();
      const pending = await storage.getPendingTransactions({ limit: 50 });

      return c.html(dashboard({ state, stats, pending }));
    })

    // HTMX partial: Transaction list
    .get('/partials/transactions', async (c) => {
      const config = c.get('config');
      const pending = await config.storage.getPendingTransactions({ limit: 50 });
      return c.html(transactionList(pending));
    })

    // HTMX partial: State controls
    .get('/partials/state', async (c) => {
      const config = c.get('config');
      const state = {
        paused: await config.storage.isPaused(),
        minGasPrice: await config.storage.getMinGasPrice(),
        autoForward: await config.storage.isAutoForward(),
      };
      return c.html(stateControls(state));
    });

  return app;
}
```

### 5.2 Create Base Layout

**File**: `packages/server/src/ui/layout.ts`

```typescript
import { html, raw } from 'hono/html';

export interface LayoutProps {
  title: string;
  children: string;
}

export function layout({ title, children }: LayoutProps) {
  return html`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <script src="https://unpkg.com/htmx.org@1.9.10"></script>
      <style>
        :root {
          --bg: #1a1a2e;
          --surface: #16213e;
          --primary: #0f3460;
          --accent: #e94560;
          --success: #00d26a;
          --warning: #ffc107;
          --text: #eaeaea;
          --text-muted: #a0a0a0;
        }
        
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: var(--bg);
          color: var(--text);
          line-height: 1.6;
        }
        
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
        }
        
        header {
          background: var(--surface);
          padding: 1rem 2rem;
          border-bottom: 1px solid var(--primary);
        }
        
        header h1 {
          font-size: 1.5rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .card {
          background: var(--surface);
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 1rem;
        }
        
        .card h2 {
          font-size: 1rem;
          color: var(--text-muted);
          margin-bottom: 1rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 1rem;
        }
        
        .stat {
          text-align: center;
        }
        
        .stat-value {
          font-size: 2rem;
          font-weight: bold;
          color: var(--accent);
        }
        
        .stat-label {
          font-size: 0.875rem;
          color: var(--text-muted);
        }
        
        .controls {
          display: flex;
          gap: 1rem;
          flex-wrap: wrap;
          align-items: center;
        }
        
        button, .btn {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.875rem;
          transition: opacity 0.2s;
        }
        
        button:hover, .btn:hover {
          opacity: 0.8;
        }
        
        .btn-primary {
          background: var(--primary);
          color: var(--text);
        }
        
        .btn-success {
          background: var(--success);
          color: #000;
        }
        
        .btn-danger {
          background: var(--accent);
          color: var(--text);
        }
        
        .btn-warning {
          background: var(--warning);
          color: #000;
        }
        
        input[type="text"], input[type="number"] {
          padding: 0.5rem;
          border: 1px solid var(--primary);
          border-radius: 4px;
          background: var(--bg);
          color: var(--text);
        }
        
        table {
          width: 100%;
          border-collapse: collapse;
        }
        
        th, td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid var(--primary);
        }
        
        th {
          color: var(--text-muted);
          font-weight: 500;
          text-transform: uppercase;
          font-size: 0.75rem;
        }
        
        .hash {
          font-family: monospace;
          font-size: 0.875rem;
        }
        
        .truncate {
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.75rem;
          text-transform: uppercase;
        }
        
        .status-pending {
          background: var(--warning);
          color: #000;
        }
        
        .status-forwarded {
          background: var(--success);
          color: #000;
        }
        
        .status-dropped {
          background: var(--accent);
          color: var(--text);
        }
        
        .paused-banner {
          background: var(--accent);
          color: var(--text);
          padding: 0.5rem 1rem;
          text-align: center;
          font-weight: bold;
        }
        
        .actions {
          display: flex;
          gap: 0.5rem;
        }
        
        .empty-state {
          text-align: center;
          padding: 3rem;
          color: var(--text-muted);
        }
        
        .htmx-indicator {
          opacity: 0;
          transition: opacity 200ms ease-in;
        }
        
        .htmx-request .htmx-indicator {
          opacity: 1;
        }
      </style>
    </head>
    <body>
      <header>
        <h1>
          <span>🔧</span>
          Debug Mempool
        </h1>
      </header>
      ${raw(children)}
      <script>
        // Auto-refresh transaction list every 2 seconds
        document.body.addEventListener('htmx:load', function(evt) {
          // Re-setup polling after HTMX swaps
        });
      </script>
    </body>
    </html>
  `;
}
```

### 5.3 Create Dashboard Page

**File**: `packages/server/src/ui/pages/dashboard.ts`

```typescript
import { html, raw } from 'hono/html';
import { layout } from '../layout.js';
import { stateControls } from '../components/state-controls.js';
import { statsCard } from '../components/stats-card.js';
import { transactionList } from '../components/transaction-list.js';
import { PendingTransaction, MempoolStats } from '../../mempool/types.js';

export interface DashboardProps {
  state: {
    paused: boolean;
    minGasPrice: bigint;
    autoForward: boolean;
  };
  stats: MempoolStats;
  pending: PendingTransaction[];
}

export function dashboard({ state, stats, pending }: DashboardProps) {
  const content = html`
    ${state.paused ? html`<div class="paused-banner">⏸️ MEMPOOL PAUSED - Transactions are being held</div>` : ''}
    
    <div class="container">
      <div class="card">
        <h2>Mempool State</h2>
        <div id="state-controls" hx-get="/ui/partials/state" hx-trigger="every 5s">
          ${raw(stateControls(state))}
        </div>
      </div>
      
      <div class="card">
        <h2>Statistics</h2>
        ${raw(statsCard(stats))}
      </div>
      
      <div class="card">
        <h2>
          Pending Transactions
          <span class="htmx-indicator">⏳</span>
        </h2>
        <div id="transaction-list" 
             hx-get="/ui/partials/transactions" 
             hx-trigger="every 2s"
             hx-indicator=".htmx-indicator">
          ${raw(transactionList(pending))}
        </div>
      </div>
    </div>
  `;

  return layout({ title: 'Debug Mempool', children: content });
}
```

### 5.4 Create State Controls Component

**File**: `packages/server/src/ui/components/state-controls.ts`

```typescript
import { html } from 'hono/html';

export interface StateControlsProps {
  paused: boolean;
  minGasPrice: bigint;
  autoForward: boolean;
}

export function stateControls(state: StateControlsProps) {
  const gasPriceGwei = Number(state.minGasPrice) / 1e9;

  return html`
    <div class="controls">
      <div>
        <strong>Status:</strong>
        ${state.paused 
          ? html`<span class="status-badge status-dropped">Paused</span>`
          : html`<span class="status-badge status-forwarded">Running</span>`
        }
      </div>
      
      ${state.paused
        ? html`
            <button class="btn btn-success"
                    hx-post="/api/mempool/resume"
                    hx-swap="none"
                    hx-on::after-request="htmx.trigger('#state-controls', 'htmx:load')">
              ▶️ Resume
            </button>
          `
        : html`
            <button class="btn btn-warning"
                    hx-post="/api/mempool/pause"
                    hx-swap="none"
                    hx-on::after-request="htmx.trigger('#state-controls', 'htmx:load')">
              ⏸️ Pause
            </button>
          `
      }
      
      <button class="btn btn-primary"
              hx-post="/api/mempool/flush"
              hx-swap="none"
              hx-confirm="Forward all pending transactions?">
        🚀 Flush All
      </button>
      
      <button class="btn btn-danger"
              hx-delete="/api/mempool/clear"
              hx-swap="none"
              hx-confirm="Clear all pending transactions?">
        🗑️ Clear
      </button>
      
      <div style="margin-left: auto; display: flex; align-items: center; gap: 0.5rem;">
        <label>Min Gas Price:</label>
        <input type="number" 
               id="min-gas-price" 
               value="${gasPriceGwei}"
               step="0.1"
               style="width: 100px;">
        <span>gwei</span>
        <button class="btn btn-primary"
                onclick="setMinGasPrice()">
          Set
        </button>
      </div>
    </div>
    
    <script>
      function setMinGasPrice() {
        const gwei = document.getElementById('min-gas-price').value;
        const wei = Math.floor(parseFloat(gwei) * 1e9).toString();
        fetch('/api/mempool/gas-price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ minGasPrice: wei })
        }).then(() => htmx.trigger('#state-controls', 'htmx:load'));
      }
    </script>
  `;
}
```

### 5.5 Create Stats Card Component

**File**: `packages/server/src/ui/components/stats-card.ts`

```typescript
import { html } from 'hono/html';
import { MempoolStats } from '../../mempool/types.js';

export function statsCard(stats: MempoolStats) {
  const formatAge = (seconds?: number) => {
    if (!seconds) return '-';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  const now = Math.floor(Date.now() / 1000);
  const oldestAge = stats.oldestPending ? now - stats.oldestPending : undefined;

  return html`
    <div class="stats-grid">
      <div class="stat">
        <div class="stat-value">${stats.totalPending}</div>
        <div class="stat-label">Pending</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.totalForwarded}</div>
        <div class="stat-label">Forwarded</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.totalDropped}</div>
        <div class="stat-label">Dropped</div>
      </div>
      <div class="stat">
        <div class="stat-value">${stats.uniqueSenders}</div>
        <div class="stat-label">Unique Senders</div>
      </div>
      <div class="stat">
        <div class="stat-value">${formatAge(oldestAge)}</div>
        <div class="stat-label">Oldest Tx Age</div>
      </div>
    </div>
  `;
}
```

### 5.6 Create Transaction List Component

**File**: `packages/server/src/ui/components/transaction-list.ts`

```typescript
import { html } from 'hono/html';
import { PendingTransaction } from '../../mempool/types.js';

export function transactionList(transactions: PendingTransaction[]) {
  if (transactions.length === 0) {
    return html`
      <div class="empty-state">
        <p>No pending transactions</p>
      </div>
    `;
  }

  const truncateHash = (hash: string) => 
    `${hash.slice(0, 10)}...${hash.slice(-8)}`;

  const formatGasPrice = (price: bigint) => {
    const gwei = Number(price) / 1e9;
    return `${gwei.toFixed(2)} gwei`;
  };

  const formatValue = (value: bigint) => {
    const eth = Number(value) / 1e18;
    if (eth === 0) return '0 ETH';
    if (eth < 0.0001) return '<0.0001 ETH';
    return `${eth.toFixed(4)} ETH`;
  };

  const formatAge = (timestamp: number) => {
    const now = Math.floor(Date.now() / 1000);
    const age = now - timestamp;
    if (age < 60) return `${age}s ago`;
    if (age < 3600) return `${Math.floor(age / 60)}m ago`;
    return `${Math.floor(age / 3600)}h ago`;
  };

  return html`
    <table>
      <thead>
        <tr>
          <th>Hash</th>
          <th>From</th>
          <th>To</th>
          <th>Value</th>
          <th>Gas Price</th>
          <th>Nonce</th>
          <th>Age</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${transactions.map(tx => html`
          <tr>
            <td class="hash truncate" title="${tx.hash}">
              ${truncateHash(tx.hash)}
            </td>
            <td class="hash truncate" title="${tx.from}">
              ${truncateHash(tx.from)}
            </td>
            <td class="hash truncate" title="${tx.to ?? 'Contract Creation'}">
              ${tx.to ? truncateHash(tx.to) : '📄 Create'}
            </td>
            <td>${formatValue(tx.value)}</td>
            <td>${formatGasPrice(tx.maxFeePerGas ?? tx.gasPrice)}</td>
            <td>${tx.nonce}</td>
            <td>${formatAge(tx.createdAt)}</td>
            <td class="actions">
              <button class="btn btn-success"
                      style="padding: 0.25rem 0.5rem; font-size: 0.75rem;"
                      hx-post="/api/mempool/include/${tx.hash}"
                      hx-swap="none"
                      title="Force Include">
                ✓
              </button>
              <button class="btn btn-danger"
                      style="padding: 0.25rem 0.5rem; font-size: 0.75rem;"
                      hx-post="/api/mempool/drop/${tx.hash}"
                      hx-swap="none"
                      title="Drop">
                ✕
              </button>
            </td>
          </tr>
        `)}
      </tbody>
    </table>
  `;
}
```

### 5.7 Register UI Routes

**File**: [`packages/server/src/index.ts`](../packages/server/src/index.ts)

```typescript
import { getUIRoutes } from './ui/index.js';

export function createServer<CustomEnv extends Env>(
  options: ServerOptions<CustomEnv>,
) {
  const app = new Hono<{ Bindings: CustomEnv }>();

  // ... existing routes
  const ui = getUIRoutes(options);

  return app
    .use('/*', corsSetup)
    .route('/', dummy)
    .route('/rpc', rpc)
    .route('/api/mempool', mempool)
    .route('/health', health)
    .route('/ui', ui)  // UI dashboard
    // ... rest
}
```

## UI Flow Diagram

```mermaid
flowchart TB
    subgraph Dashboard
        State[State Controls]
        Stats[Statistics]
        List[Transaction List]
    end
    
    subgraph Actions
        Pause[Pause/Resume]
        GasPrice[Set Gas Price]
        Flush[Flush All]
        Clear[Clear All]
    end
    
    subgraph TxActions[Transaction Actions]
        Include[Force Include]
        Drop[Drop]
    end
    
    State --> Pause
    State --> GasPrice
    State --> Flush
    State --> Clear
    
    List --> Include
    List --> Drop
    
    Pause -->|HTMX POST| API[/api/mempool/*]
    GasPrice -->|HTMX POST| API
    Flush -->|HTMX POST| API
    Clear -->|HTMX DELETE| API
    Include -->|HTMX POST| API
    Drop -->|HTMX POST| API
    
    API -->|Trigger refresh| Dashboard
```

## Testing Checklist

- [ ] Dashboard loads with current state
- [ ] Pause/Resume buttons work
- [ ] Gas price setting works
- [ ] Flush All forwards all transactions
- [ ] Clear All removes pending transactions
- [ ] Transaction list shows pending transactions
- [ ] Transaction list auto-refreshes
- [ ] Force Include works from list
- [ ] Drop works from list
- [ ] State controls refresh after actions
- [ ] Paused banner shows when paused
- [ ] Responsive layout on mobile

## Files to Create/Modify

| File | Action |
|------|--------|
| `packages/server/src/ui/index.ts` | Create |
| `packages/server/src/ui/layout.ts` | Create |
| `packages/server/src/ui/pages/dashboard.ts` | Create |
| `packages/server/src/ui/components/state-controls.ts` | Create |
| `packages/server/src/ui/components/stats-card.ts` | Create |
| `packages/server/src/ui/components/transaction-list.ts` | Create |
| `packages/server/src/index.ts` | Modify |

## Success Criteria

1. Dashboard accessible at `/ui`
2. Real-time state display
3. All controls functional
4. Transaction list with actions
5. Auto-refresh without full page reload
6. Responsive design
7. Clean, readable interface

## Future Enhancements

After the foundation is working:

- **Transaction Details Modal**: Click on transaction to see full details
- **Filter Controls**: Filter by sender, status, gas price range
- **Sort Options**: Sort transactions by various fields
- **Real-time Updates**: WebSocket for instant updates instead of polling
- **Dark/Light Theme Toggle**: User preference
- **Transaction History Tab**: View forwarded/dropped transactions
- **Search**: Search by hash or address
- **Export**: Export transaction data as JSON/CSV
