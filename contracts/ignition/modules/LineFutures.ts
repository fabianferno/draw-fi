import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("LineFuturesModule", (m) => {
  // Get the PnL server address from parameters, or use the deployer as default
  const pnlServerAddress = m.getParameter("pnlServerAddress", m.getAccount(0));

  // Get the PriceOracle address from parameters (required)
  const priceOracleAddress = m.getParameter("priceOracleAddress", "0x0000000000000000000000000000000000000000");

  // Deploy the LineFutures contract
  const lineFutures = m.contract("LineFutures", [pnlServerAddress, priceOracleAddress]);

  return { lineFutures };
});

