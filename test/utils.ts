import { signTypedData, SignTypedDataVersion } from "@metamask/eth-sig-util";
import { fromRpcSig, ECDSASignature } from "ethereumjs-util";
import { Contract, ContractTransaction } from "@ethersproject/contracts";

export const buildPermitParams = (
  chainId: number,
  bendToken: string,
  owner: string,
  spender: string,
  nonce: number,
  deadline: string,
  value: string
) => ({
  types: {
    EIP712Domain: [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ],
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "Permit" as const,
  domain: {
    name: "Bend Token",
    version: "1",
    chainId: chainId,
    verifyingContract: bendToken,
  },
  message: {
    owner,
    spender,
    value,
    nonce,
    deadline,
  },
});

export const getSignatureFromTypedData = (
  privateKey: string,
  typedData: any
): ECDSASignature => {
  const signature = signTypedData({
    privateKey: Buffer.from(privateKey.substring(2, 66), "hex"),
    data: typedData,
    version: SignTypedDataVersion.V4,
  });
  return fromRpcSig(signature);
};

export async function waitForTx(tx: ContractTransaction) {
  await tx.wait();
}
