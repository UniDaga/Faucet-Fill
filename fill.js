const { ethers } = require('ethers');
const fs = require('fs');
const readline = require('readline');

const RPC_URL = 'https://api.zan.top/node/v1/pharos/testnet/310c2748ef27422db4294fce8c59ef11/';
const PRIVATE_KEY_FILE = 'privatekey.txt';
const RECEIVER_FILE = 'address.txt';
const GAS_LIMIT = BigInt(100000);
const GAS_PRICE = ethers.parseUnits('1', 'gwei');
const DELAY_BETWEEN_TX = 2000;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function main() {
    try {
        const privateKeys = fs.readFileSync(PRIVATE_KEY_FILE, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && line.startsWith('0x'));

        if (privateKeys.length === 0) {
            throw new Error('No valid private keys found in privatekey.txt');
        }

        const receivers = fs.readFileSync(RECEIVER_FILE, 'utf8')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && ethers.isAddress(line));

        if (receivers.length === 0) {
            throw new Error('No valid receiver addresses found in address.txt');
        }

        console.log(`Found ${privateKeys.length} private keys and ${receivers.length} receiver addresses`);

        
        const amountInKite = await new Promise((resolve) => {
            rl.question('Enter the amount of PHRS to send to each receiver: ', (answer) => {
                resolve(answer);
            });
        });

        
        const amount = parseFloat(amountInKite.trim());
        if (isNaN(amount) || amount <= 0) {
            throw new Error('Invalid PHRS amount entered. Please enter a positive number.');
        }

        const amountPerReceiver = ethers.parseUnits(amountInKite.trim(), 'ether');

        const provider = new ethers.JsonRpcProvider(RPC_URL);

        console.log(`Proceeding with ${receivers.length} receiver addresses`);

        for (const privateKey of privateKeys) {
            try {
                console.log('\n' + '='.repeat(50));
                await processWallet(privateKey, receivers, amountPerReceiver, provider);
            } catch (error) {
                console.error(`Error processing key:`, error.message || error);
            }
            await delay(3000);
        }

        console.log('\nAll operations completed!');
    } catch (error) {
        console.error('Fatal Error:', error.message || error);
    } finally {
        rl.close();
    }
}

async function processWallet(privateKey, receivers, amountPerReceiver, provider) {
    const wallet = new ethers.Wallet(privateKey, provider);

    console.log(`\nProcessing wallet: ${wallet.address}`);

    const balance = await provider.getBalance(wallet.address);
    console.log(`Current balance: ${ethers.formatEther(balance)} PHRS`);

    const gasCostPerTx = GAS_LIMIT * GAS_PRICE;
    console.log(`Estimated gas cost per transaction: ${ethers.formatEther(gasCostPerTx)} PHRS`);

    const totalNeeded = gasCostPerTx * BigInt(receivers.length) + amountPerReceiver * BigInt(receivers.length);

    if (balance < totalNeeded) {
        throw new Error(`Insufficient balance. Need at least ${ethers.formatEther(totalNeeded)} PHRS for transactions and gas costs`);
    }

    console.log(`\nSending ${ethers.formatEther(amountPerReceiver)} PHRS to each of ${receivers.length} receivers...`);

    for (const receiver of receivers) {
        await sendWithGas(wallet, receiver, amountPerReceiver, GAS_LIMIT, GAS_PRICE);
        await delay(DELAY_BETWEEN_TX);
    }
}

async function sendWithGas(wallet, toAddress, amount, gasLimit, gasPrice) {
    try {
        const tx = {
            to: toAddress,
            value: amount,
            gasLimit: gasLimit,
            gasPrice: gasPrice
        };

        console.log(`\nSending ${ethers.formatEther(amount)} PHRS to ${toAddress}...`);
        const transaction = await wallet.sendTransaction(tx);
        console.log('Transaction hash:', transaction.hash);

        const receipt = await transaction.wait();
        if (receipt.status === 0) {
            throw new Error('Transaction reverted. The recipient contract may not accept Ether or requires a specific function call.');
        }
        console.log('Transaction confirmed in block:', receipt.blockNumber);
        console.log('Gas used:', receipt.gasUsed.toString());
        return true;
    } catch (error) {
        console.error(`Failed to send to ${toAddress}:`, error.message || error);
        if (error.transaction) {
            console.error('Transaction details:', JSON.stringify(error.transaction, null, 2));
        }
        if (error.receipt) {
            console.error('Receipt details:', JSON.stringify(error.receipt, null, 2));
        }
        return false;
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main();
