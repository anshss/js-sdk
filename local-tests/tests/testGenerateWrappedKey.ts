import { log } from '@lit-protocol/misc';
import { TinnyEnvironment } from 'local-tests/setup/tinny-environment';
import { exportPrivateKey, generatePrivateKey, generatePrivateKeyLitAction, importPrivateKey } from '@lit-protocol/wrapped-keys';
import { getPkpSessionSigs } from 'local-tests/setup/session-sigs/get-pkp-session-sigs';
import { ethers } from 'ethers';

/**
 * Test Commands:
 * ✅ NETWORK=cayenne yarn test:local --filter=testGenerateWrappedKey
 * ✅ NETWORK=manzano yarn test:local --filter=testGenerateWrappedKey
 * ✅ NETWORK=localchain yarn test:local --filter=testGenerateWrappedKey
 */
export const testGenerateWrappedKey = async (devEnv: TinnyEnvironment) => {
  const alice = await devEnv.createRandomPerson();

  const pkpSessionSigs = await getPkpSessionSigs(
    devEnv,
    alice,
    null,
    new Date(Date.now() + 1000 * 60 * 10).toISOString()
  ); // 10 mins expiry

  console.log(pkpSessionSigs);

  const { pkpAddress, generatedPublicKey } = await generatePrivateKey({
    pkpSessionSigs,
    litActionCode: generatePrivateKeyLitAction,
    litNodeClient: devEnv.litNodeClient,
  });

  const alicePkpAddress = alice.authMethodOwnedPkp.ethAddress;
  if (pkpAddress !== alicePkpAddress) {
    throw new Error(
      `Received address: ${pkpAddress} doesn't match Alice's PKP address: ${alicePkpAddress}`
    );
  }

  const pkpSessionSigsExport = await getPkpSessionSigs(
    devEnv,
    alice,
    null,
    new Date(Date.now() + 1000 * 60 * 10).toISOString()
  ); // 10 mins expiry

  console.log(pkpSessionSigsExport);

  const decryptedPrivateKey = await exportPrivateKey({
    pkpSessionSigs: pkpSessionSigsExport,
    litNodeClient: devEnv.litNodeClient,
  });

  const wallet = new ethers.Wallet(decryptedPrivateKey);
  const decryptedPublicKey = wallet.publicKey;

  if (decryptedPublicKey !== generatedPublicKey) {
    throw new Error(
      `Decrypted decryptedPublicKey: ${decryptedPublicKey} doesn't match with the original generatedPublicKey: ${generatedPublicKey}`
    );
  }

  log('✅ testGenerateWrappedKey');
};
