import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {
	getTestContext,
	setupTestEnvironment,
	teardownTestEnvironment,
} from './setup';
import {parseEther} from 'viem';

describe('Basic test', () => {
	beforeAll(async () => {
		await setupTestEnvironment();
	}, 30000);

	afterAll(async () => {
		await teardownTestEnvironment();
	});

	it('should work', async () => {
		const {publicClient, walletClient, accounts} = getTestContext();

		const value = parseEther('1');
		const balance = await publicClient.getBalance({address: accounts[1]});
		await walletClient.sendTransaction({
			account: accounts[0],
			to: accounts[1],
			value,
		});
		const newBalance = await publicClient.getBalance({address: accounts[1]});
		expect(newBalance - value).toEqual(balance);
	});
});
