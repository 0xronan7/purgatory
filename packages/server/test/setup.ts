import {getChain} from './helpers.js';
import {
	Chain,
	createPublicClient,
	createWalletClient,
	http,
	PublicClient,
	Transport,
	WalletClient,
} from 'viem';
import {
	TEST_CONTRACT_ABI,
	TEST_CONTRACT_ADDRESS,
	TEST_CONTRACT_BYTECODE,
} from './utils/data.js';
import {assert} from 'vitest';
import {RPC_URL} from './prool/url.js';

// Test addresses
export const TEST_DEPLOYER_ADDRESS =
	'0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // acount 1
export const TEST_ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // acount 2
export const TEST_PRIVATE_KEY =
	'0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
export const TEST_RECIPIENT = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'; // acount 3

// Test ABIs
export const ERC20_BALANCE_OF_ABI =
	'function balanceOf(address) returns (uint256)';
export const ERC20_TOTAL_SUPPLY_ABI =
	'function totalSupply() returns (uint256)';
export const ERC20_TRANSFER_ABI =
	'function transfer(address to, uint256 amount) returns (bool)';
export const TRANSFER_EVENT_ABI =
	'event Transfer(address indexed from, address indexed to, uint256 amount)';
export const APPROVAL_EVENT_ABI =
	'event Approval(address indexed owner, address indexed spender, uint256 value)';

// Test context type
export type TestContext = {
	chain: Chain;
	rpcUrl: string;
	walletClient: WalletClient<Transport, Chain>;
	publicClient: PublicClient<Transport, Chain>;
	accounts: `0x${string}`[];
};

// Global test setup
let testContext: TestContext | null = null;

/**
 * Setup test environment - starts Anvil, deploys test contract, creates MCP server
 * @returns Test context with server, client, and RPC clients
 */
export async function setupTestEnvironment(): Promise<TestContext> {
	if (testContext) {
		return testContext;
	}

	const rpcUrl = RPC_URL;

	// Create chain with local RPC
	const chain = await getChain(rpcUrl);

	const walletClient = createWalletClient({chain, transport: http(rpcUrl)});
	const publicClient = createPublicClient({chain, transport: http(rpcUrl)});

	const deploymentHash = await walletClient.deployContract({
		abi: TEST_CONTRACT_ABI,
		args: [TEST_ADDRESS, 1_000_000n],
		bytecode: TEST_CONTRACT_BYTECODE,
		account: TEST_DEPLOYER_ADDRESS,
	});

	const deploymentReceipt = await publicClient.waitForTransactionReceipt({
		hash: deploymentHash,
		timeout: 10000, // 10 second timeout
	});

	assert(
		deploymentReceipt.contractAddress?.toLowerCase() ===
			TEST_CONTRACT_ADDRESS.toLowerCase(),
		`Expected contract address ${TEST_CONTRACT_ADDRESS}, but got ${deploymentReceipt.contractAddress}`,
	);

	// Transfer some tokens to test address
	const hashForTokens = await walletClient.writeContract({
		account: TEST_DEPLOYER_ADDRESS,
		abi: TEST_CONTRACT_ABI,
		functionName: 'transfer',
		args: [TEST_ADDRESS, 1_000n],
		address: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
	});
	await publicClient.waitForTransactionReceipt({hash: hashForTokens});

	const accounts = await walletClient.getAddresses();

	testContext = {
		chain,
		rpcUrl,
		walletClient,
		publicClient,
		accounts,
	};

	return testContext;
}

/**
 * Tear down test environment
 */
export async function teardownTestEnvironment(): Promise<void> {
	testContext = null;
}

/**
 * Get or create test context
 */
export function getTestContext(): TestContext {
	if (!testContext) {
		throw new Error(
			'Test context not initialized. Call setupTestEnvironment() first.',
		);
	}
	return testContext;
}
