import {Hono} from 'hono';
import {ServerOptions} from '../../types.js';
import {setup} from '../../setup.js';
import {Env} from '../../env.js';
import type {Hash, Address} from 'viem';

export function getAdminAPI<CustomEnv extends Env>(
	options: ServerOptions<CustomEnv>,
) {
	const app = new Hono<{Bindings: CustomEnv}>()
		.use(setup({serverOptions: options}))
		.post('/reset-db', async (c) => {
			const config = c.get('config');
			const env = config.env;
			const storage = config.storage;

			if (!(env as any).DEV) {
				throw new Error(`can only reset db in dev mode `);
			}
			await storage.reset();
			return c.json({success: true});
		})
		.post('/setup-db', async (c) => {
			const config = c.get('config');
			const env = config.env;
			const storage = config.storage;

			await storage.setup();
			return c.json({success: true});
		})
		.post('/tx/hide', async (c) => {
			const config = c.get('config');
			const storage = config.storage;
			const body = await c.req.json<{hash: Hash}>();

			if (!body.hash) {
				return c.json({error: 'hash is required'}, 400);
			}

			await storage.hideTransaction(body.hash);
			return c.json({success: true, hash: body.hash});
		})
		.post('/tx/restore', async (c) => {
			const config = c.get('config');
			const storage = config.storage;
			const body = await c.req.json<{hash: Hash}>();

			if (!body.hash) {
				return c.json({error: 'hash is required'}, 400);
			}

			await storage.restoreTransaction(body.hash);
			return c.json({success: true, hash: body.hash});
		})
		.get('/tx/hidden', async (c) => {
			const config = c.get('config');
			const storage = config.storage;
			const address = c.req.query('address') as Address | undefined;

			const hidden = await storage.getHiddenTransactions(address);
			return c.json({transactions: hidden});
		});

	return app;
}
