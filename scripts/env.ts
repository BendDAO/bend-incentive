import { HardhatRuntimeEnvironment } from "hardhat/types";
export let HRE: HardhatRuntimeEnvironment = {} as HardhatRuntimeEnvironment;

export const setHRE = (_HRE: HardhatRuntimeEnvironment) => {
  HRE = _HRE;
};
