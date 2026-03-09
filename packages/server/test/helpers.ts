import {Methods} from 'eip-1193';
import {createCurriedJSONRPC} from 'remote-procedure-call';
import {Chain, createPublicClient, createWalletClient, http} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';

export async function getChain(rpcUrl: string) {
	const rpc = createCurriedJSONRPC<Methods>(rpcUrl);
	const response = await rpc.call('eth_chainId')();
	if (!response.success) {
		throw new Error('Failed to get chain ID');
	}
	const chainIDAsHex = response.value;

	const chain = {
		id: Number(chainIDAsHex),
		name: 'Unknown',
		nativeCurrency: {
			decimals: 18,
			name: 'Ether',
			symbol: 'ETH',
		},
		rpcUrls: {
			default: {
				http: [rpcUrl],
			},
		},
	};
	return chain;
}

export function getClients(
	params: {chain: Chain; privateKey?: `0x${string}`},
	options?: {rpcURL?: string},
) {
	const {chain, privateKey} = params;
	const account = privateKey ? privateKeyToAccount(privateKey) : undefined;
	const transport = http(options?.rpcURL || chain.rpcUrls.default.http[0]);
	const walletClient = account
		? createWalletClient({
				account,
				chain,
				transport,
			})
		: undefined;
	const publicClient = createPublicClient({
		chain,
		transport,
	});

	return {walletClient, publicClient};
}

// Helper function to handle BigInt serialization in JSON.stringify
export function stringifyWithBigInt(obj: any, space?: number): string {
	return JSON.stringify(
		obj,
		(_key, value) => (typeof value === 'bigint' ? value.toString() : value),
		space,
	);
}
