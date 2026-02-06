import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("PriceOracleModule", (m) => {
  // Get the submitter address from parameters, or use the deployer as default
  const submitterAddress = m.getParameter("submitterAddress", m.getAccount(0));

  // Deploy the PriceOracle contract
  const oracle = m.contract("PriceOracle", [submitterAddress]);

  return { oracle };
});

