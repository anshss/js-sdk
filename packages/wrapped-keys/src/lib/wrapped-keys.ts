import {
  CHAIN_ETHEREUM,
  ENCRYPTED_PRIVATE_KEY_ENDPOINT,
  LIT_PREFIX,
} from './constants';
import { decryptToString, encryptString } from '@lit-protocol/encryption';
import { logError } from '@lit-protocol/misc';
import {
  fetchPrivateKeyMedataFromDatabase,
  getFirstSessionSig,
  getPkpAccessControlCondition,
  getPkpAddressFromSessionSig,
  postLitActionValidation,
} from './utils';
import {
  LitTransaction,
  ExportPrivateKeyParams,
  ExportPrivateKeyResponse,
  ImportPrivateKeyParams,
  ImportPrivateKeyResponse,
  SignTransactionWithEncryptedKeyParams,
  SignMessageWithEncryptedKeyParams,
  GeneratePrivateKeyParams,
} from './interfaces';

export async function generatePrivateKey({ pkpSessionSigs, litActionCode, litNodeClient }: GeneratePrivateKeyParams): Promise<string> {
  const firstSessionSig = getFirstSessionSig(pkpSessionSigs);
  const pkpAddress = getPkpAddressFromSessionSig(firstSessionSig);

  try {
    const result = await litNodeClient.executeJs({
      sessionSigs: pkpSessionSigs,
      code: litActionCode,
      jsParams: {
        pkpAddress,
        accessControlConditions: getPkpAccessControlCondition(pkpAddress),
      },
    });

    const response = postLitActionValidation(result);
    const { ciphertext, dataToEncryptHash } = JSON.parse(response);

    console.log('ciphertext');
    console.log(ciphertext);
    console.log('dataToEncryptHash');
    console.log(dataToEncryptHash);
  } catch (err: any) {
    throw new Error(
      `Lit Action threw an unexpected error: ${JSON.stringify(err)}`
    );
  }

  return "";
}

export async function importPrivateKey({
  pkpSessionSigs,
  privateKey,
  litNodeClient,
}: ImportPrivateKeyParams): Promise<string> {
  const firstSessionSig = getFirstSessionSig(pkpSessionSigs);
  const pkpAddress = getPkpAddressFromSessionSig(firstSessionSig);
  const allowPkpAddressToDecrypt = getPkpAccessControlCondition(pkpAddress);

  const updatedPrivateKey = LIT_PREFIX + privateKey;

  const { ciphertext, dataToEncryptHash } = await encryptString(
    {
      accessControlConditions: allowPkpAddressToDecrypt,
      dataToEncrypt: updatedPrivateKey,
    },
    litNodeClient
  );

  const data = {
    ciphertext,
    dataToEncryptHash,
  };

  try {
    const response = await fetch(ENCRYPTED_PRIVATE_KEY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        pkpsessionsig: JSON.stringify(firstSessionSig),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logError(
        `Could not import the encrypted key due to the error: ${errorBody}`
      );

      throw new Error(errorBody);
    }

    const importedPrivateKey: ImportPrivateKeyResponse = await response.json();
    return importedPrivateKey.pkpAddress;
  } catch (error) {
    const errorMessage = `There was a problem fetching from the database: ${error}`;
    console.error(errorMessage);

    throw new Error(errorMessage);
  }
}

export async function exportPrivateKey({
  pkpSessionSigs,
  litNodeClient,
}: ExportPrivateKeyParams): Promise<string> {
  const firstSessionSig = getFirstSessionSig(pkpSessionSigs);
  const pkpAddress = getPkpAddressFromSessionSig(firstSessionSig);
  const allowPkpAddressToDecrypt = getPkpAccessControlCondition(pkpAddress);

  try {
    const response = await fetch(ENCRYPTED_PRIVATE_KEY_ENDPOINT, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        pkpsessionsig: JSON.stringify(firstSessionSig),
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logError(
        `Could not fetch the encrypted key due to the error: ${errorBody}`
      );

      throw new Error(errorBody);
    }

    const exportedPrivateKeyData: ExportPrivateKeyResponse =
      await response.json();

    const decryptedPrivateKey = await decryptToString(
      {
        accessControlConditions: allowPkpAddressToDecrypt,
        chain: CHAIN_ETHEREUM,
        ciphertext: exportedPrivateKeyData.ciphertext,
        dataToEncryptHash: exportedPrivateKeyData.dataToEncryptHash,
        sessionSigs: pkpSessionSigs,
      },
      litNodeClient
    );

    // It will be of the form lit_<privateKey>
    return decryptedPrivateKey.startsWith(LIT_PREFIX)
      ? decryptedPrivateKey.slice(LIT_PREFIX.length)
      : decryptedPrivateKey;
  } catch (error) {
    const errorMessage = `There was a problem fetching from the database: ${error}`;
    console.error(errorMessage);

    throw new Error(errorMessage);
  }
}

export async function signTransactionWithEncryptedKey<T = LitTransaction>({
  pkpSessionSigs,
  litActionCode,
  unsignedTransaction,
  broadcast,
  litNodeClient,
}: SignTransactionWithEncryptedKeyParams<T>): Promise<string> {
  const { pkpAddress, ciphertext, dataToEncryptHash } =
    await fetchPrivateKeyMedataFromDatabase(pkpSessionSigs);

  try {
    const result = await litNodeClient.executeJs({
      sessionSigs: pkpSessionSigs,
      code: litActionCode,
      jsParams: {
        pkpAddress,
        ciphertext,
        dataToEncryptHash,
        unsignedTransaction,
        broadcast,
        accessControlConditions: getPkpAccessControlCondition(pkpAddress),
      },
    });

    return postLitActionValidation(result);
  } catch (err: any) {
    if (broadcast && err.errorCode === 'NodeJsTimeoutError') {
      throw new Error(
        `The action timed out: ${err.message}. This doesn't mean that your transaction wasn't broadcast but that it took more than 30 secs to confirm. Please confirm whether it went through on the blockchain explorer for your chain.`
      );
    } else {
      throw new Error(
        `Lit Action threw an unexpected error: ${JSON.stringify(err)}`
      );
    }
  }
}

export async function signMessageWithEncryptedKey({
  pkpSessionSigs,
  litActionCode,
  unsignedMessage,
  litNodeClient,
}: SignMessageWithEncryptedKeyParams): Promise<string> {
  const { pkpAddress, ciphertext, dataToEncryptHash } =
    await fetchPrivateKeyMedataFromDatabase(pkpSessionSigs);

  try {
    const result = await litNodeClient.executeJs({
      sessionSigs: pkpSessionSigs,
      code: litActionCode,
      jsParams: {
        pkpAddress,
        ciphertext,
        dataToEncryptHash,
        unsignedMessage,
        accessControlConditions: getPkpAccessControlCondition(pkpAddress),
      },
    });

    return postLitActionValidation(result);
  } catch (err: any) {
    throw new Error(
      `Lit Action threw an unexpected error: ${JSON.stringify(err)}`
    );
  }
}
