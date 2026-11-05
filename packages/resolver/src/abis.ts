import { parseAbi } from "viem";

/** LayerZero V2 EndpointV2 on Ethereum (docs/03, docs/19 §7). */
export const ENDPOINT_V2 = "0x1a44076050125825900e736c501f859c50fE728c" as const;
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
/** Safe GuardManager slot: keccak256("guard_manager.guard.address"). */
export const SAFE_GUARD_SLOT = "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8" as const;
export const SAFE_SENTINEL = "0x0000000000000000000000000000000000000001" as const;

export const oappAbi = parseAbi([
  "function peers(uint32 eid) view returns (bytes32)",
  "function owner() view returns (address)",
]);

export const endpointAbi = parseAbi([
  "function getReceiveLibrary(address receiver, uint32 srcEid) view returns (address lib, bool isDefault)",
  "function receiveLibraryTimeout(address receiver, uint32 srcEid) view returns (address lib, uint256 expiry)",
  "function getSendLibrary(address sender, uint32 dstEid) view returns (address lib)",
  "function isDefaultSendLibrary(address sender, uint32 dstEid) view returns (bool)",
  "function delegates(address oapp) view returns (address)",
]);

const ULN = "(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)";
export const ulnAbi = parseAbi([
  `function getUlnConfig(address oapp, uint32 remoteEid) view returns (${ULN})`,
  `function getAppUlnConfig(address oapp, uint32 remoteEid) view returns (${ULN})`,
]);

export const safeAbi = parseAbi([
  "function getThreshold() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function getModulesPaginated(address start, uint256 pageSize) view returns (address[] array, address next)",
  "function VERSION() view returns (string)",
]);

export const timelockAbi = parseAbi(["function getMinDelay() view returns (uint256)"]);

export const multicallAbi = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) payable returns (Result[] returnData)",
]);
