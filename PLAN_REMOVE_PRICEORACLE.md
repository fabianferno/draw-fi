# Plan: Remove PriceOracle Contract Dependency - Use MongoDB for Commitments

## Overview

Replace the PriceOracle smart contract (which stores commitment strings on-chain) with MongoDB storage. This eliminates on-chain gas costs for storing commitments and simplifies the architecture by using MongoDB for both data storage and commitment indexing.

## Current Architecture

**Current Flow:**
1. PriceAggregator produces 60-second price window
2. Orchestrator stores data in MongoDB → gets ObjectId commitment
3. Orchestrator stores commitment string on-chain in PriceOracle contract (indexed by windowStart)
4. When retrieving: Get commitment from PriceOracle contract → fetch data from MongoDB

**New Flow:**
1. PriceAggregator produces 60-second price window
2. Orchestrator stores data in MongoDB → gets ObjectId commitment
3. Orchestrator stores commitment in MongoDB `price_commitments` collection (indexed by windowStart)
4. When retrieving: Get commitment from MongoDB → fetch data from MongoDB

## Benefits

- **No gas costs** for storing commitments
- **Faster writes** (no blockchain transaction wait)
- **Simpler architecture** (one storage system)
- **Better query performance** (MongoDB indexes vs contract calls)
- **No contract deployment needed** for PriceOracle

## MongoDB Schema

### New Collection: `price_commitments`

```typescript
{
  _id: ObjectId,
  windowStart: number,        // Unix timestamp (minute boundary)
  commitment: string,          // MongoDB ObjectId as hex string (0x...)
  createdAt: Date,
  // Indexes:
  // - windowStart (unique)
  // - createdAt
}
```

## Files to Modify

### 1. MongoDB Storage Layer

**`backend/src/storage/mongoStorage.ts`**
- Add property: `private priceCommitmentsCollection: Collection | null = null`
- In `initializeConnection()`: Initialize `priceCommitmentsCollection`
- Add method: `storeCommitment(windowStart: number, commitment: string): Promise<void>`
- Add method: `getCommitment(windowStart: number): Promise<string | null>`
- Add method: `getLatestWindow(): Promise<number | null>`
- Add method: `getWindowsInRange(start: number, end: number): Promise<number[]>`
- Add method: `getWindowCount(): Promise<number>`
- In `createIndexes()`: Add index on `price_commitments.windowStart` (unique) and `createdAt`
- Update `ensureConnected()` to check `priceCommitmentsCollection`

### 2. Replace ContractStorage

**`backend/src/contract/contractStorage.ts`**
- **Option A (Recommended):** Rename to `MongoDBCommitmentStorage.ts` and replace all contract logic with MongoDB calls
- **Option B:** Keep file but replace implementation to use MongoDB instead of ethers contract
- Remove: All ethers contract code, transaction queue, gas estimation, nonce management
- Keep: Same public API (`storeCommitment`, `getCommitment`, `getLatestWindow`, `getWindowsInRange`, `getWindowCount`)
- Update `testConnection()` to ping MongoDB instead of contract
- Update constructor to accept `MongoDBStorage` instance instead of contract address/private key

### 3. Update Orchestrator

**`backend/src/orchestrator/orchestrator.ts`**
- Line 177: Change `contractStorage.storeCommitment()` to `mongoStorage.storeCommitment()`
- Remove blockchain transaction waiting logic (no txHash returned)
- Update event: `commitmentStored` can keep same name but remove `txHash` from payload
- Update log messages to reflect MongoDB storage instead of on-chain
- Remove `contractStorage` dependency, use `mongoStorage` instead

### 4. Update Retrieval Service

**`backend/src/retrieval/retrievalService.ts`**
- Replace `ContractStorage` dependency with `MongoDBStorage`
- Line 8: Change `private contractStorage: ContractStorage` to `private mongoStorage: MongoDBStorage`
- Line 12: Update constructor to accept `MongoDBStorage` instead of `ContractStorage`
- Line 24: Change `contractStorage.getLatestWindow()` to `mongoStorage.getLatestWindow()`
- Line 46: Change `contractStorage.getCommitment()` to `mongoStorage.getCommitment()`
- Line 77: Change `contractStorage.getWindowsInRange()` to `mongoStorage.getWindowsInRange()`
- Line 338: Change `contractStorage.getLatestWindow()` to `mongoStorage.getLatestWindow()`
- Remove check for `'0x' + '0'.repeat(64)` (MongoDB returns null instead)

### 5. Update Position Service

**`backend/src/futures/positionService.ts`**
- Replace `ContractStorage` dependency with `MongoDBStorage`
- Line 5: Change import from `ContractStorage` to `MongoDBStorage`
- Line 62: Change `private oracleContract: ContractStorage` to `private mongoStorage: MongoDBStorage`
- Line 72: Update constructor parameter from `oracleContract: ContractStorage` to `mongoStorage: MongoDBStorage`
- Line 81: Update assignment from `this.oracleContract = oracleContract` to `this.mongoStorage = mongoStorage`
- Line 283: Change `oracleContract.getCommitment()` to `mongoStorage.getCommitment()`

### 6. Update Main Application

**`backend/src/index.ts`**
- Remove: `ContractStorage` import (line 4)
- Remove: `contractStorage` property from `MNTPriceOracleApp` class (line 28)
- Remove: `this.contractStorage = new ContractStorage()` instantiation (line 55)
- Update `RetrievalService` constructor (line 57-60): Use `this.mongoStorage` instead of `this.contractStorage`
- Update `Orchestrator` constructor (line 62-67): Remove `this.contractStorage`, use only `this.mongoStorage`
- Update `PositionService` constructor (line 97-106): Change `this.contractStorage` to `this.mongoStorage`
- Update `HealthMonitor` constructor (line 69-72): Remove `this.contractStorage` parameter

### 7. Update Configuration

**`backend/src/config/config.ts`**
- Remove: `contractAddress: string` from `Config` interface (line 11)
- Remove: `contractAddress: getEnvVar('CONTRACT_ADDRESS')` from config object (line 55)
- Keep: `futuresContractAddress` (still needed for LineFutures)

**`backend/env.example`**
- Remove: `CONTRACT_ADDRESS=...` line
- Update comments to reflect MongoDB-only storage

**`backend/.env`**
- Remove: `CONTRACT_ADDRESS` line (user will need to do this manually)

### 8. Update Health Monitor

**`backend/src/monitor/healthMonitor.ts`**
- Remove: `contractStorage: ContractStorage` property
- Remove: `contractStorage` parameter from constructor
- Remove: `contractStorage` from `testConnection()` calls
- Update `getMetrics()` to remove contract-related metrics (or keep structure but remove contract calls)
- Update event listeners if needed

### 9. Update Smart Contracts (Optional)

**`contracts/contracts/LineFutures.sol`**
- **Option A:** Remove `priceOracle` requirement entirely
  - Remove `address public priceOracle;` state variable (line 42)
  - Remove `priceOracle` parameter from constructor (line 90)
  - Update constructor to only require `_pnlServer`
  - Remove `require(_priceOracle != address(0), ...)` check
- **Option B:** Keep `priceOracle` but make it optional (zero address = disabled)
  - Keep variable but allow `address(0)`
  - Update constructor to not require non-zero address
- **Recommendation:** Option A - completely remove since backend handles all commitment lookups

**`contracts/ignition/modules/LineFutures.ts`**
- Update deployment parameters to remove `priceOracleAddress`
- Update to only pass `pnlServerAddress`

**`contracts/scripts/deploy.ts`**
- Update LineFutures deployment to remove `priceOracleAddress` parameter
- Update to only pass `pnlServerAddress`

### 10. Update API Endpoints

**`backend/src/api/server.ts`**
- Check for any endpoints that return `CONTRACT_ADDRESS` or contract status
- Update health/metrics endpoints to remove contract status
- Remove any contract-related API responses

### 11. Update Documentation

**`README.md`**
- Remove references to PriceOracle contract deployment
- Update architecture diagrams to show MongoDB-only storage
- Update deployment instructions to remove PriceOracle step
- Update "Smart Contracts" section to remove PriceOracle.sol

**`contracts/DEPLOY.md`**
- Remove PriceOracle deployment steps
- Update to only deploy LineFutures contract

**`contracts/DEPLOYMENT.md`**
- Remove PriceOracle deployment steps
- Update LineFutures deployment to not require oracle address

## Implementation Sequence

### Phase 1: MongoDB Commitment Storage
1. Update `mongoStorage.ts` to add `price_commitments` collection and methods
2. Create indexes on `windowStart` (unique) and `createdAt`

### Phase 2: Replace ContractStorage
3. Create `MongoDBCommitmentStorage.ts` (or refactor `contractStorage.ts`)
4. Implement all methods using MongoDB instead of contract calls
5. Remove all ethers/blockchain code

### Phase 3: Update Services
6. Update `orchestrator.ts` to use MongoDB commitment storage
7. Update `retrievalService.ts` to use MongoDB instead of contract
8. Update `positionService.ts` to use MongoDB instead of contract
9. Update `healthMonitor.ts` to remove contract dependency

### Phase 4: Update Application Entry
10. Update `index.ts` to remove ContractStorage instantiation
11. Update all service constructors to use MongoDB storage

### Phase 5: Update Configuration
12. Remove `CONTRACT_ADDRESS` from config and env files
13. Update environment variable examples

### Phase 6: Update Contracts (Optional)
14. Update `LineFutures.sol` to remove priceOracle requirement
15. Update deployment scripts and modules
16. Redeploy LineFutures contract (if already deployed, this is optional)

### Phase 7: Cleanup & Documentation
17. Delete or archive `contracts/contracts/PriceOracle.sol`
18. Delete `contracts/ignition/modules/PriceOracle.ts`
19. Update all documentation
20. Remove old PriceOracle deployment artifacts

## Migration Considerations

### Existing Data

**If PriceOracle contract already has commitments stored:**
- Option 1: Migrate existing commitments from contract to MongoDB
  - Query contract for all window timestamps using `getWindowsInRange()`
  - For each timestamp, get commitment from contract
  - Store in MongoDB `price_commitments` collection
- Option 2: Start fresh (new commitments go to MongoDB, old ones remain on-chain)
  - Keep contract code temporarily for reading old commitments
  - New windows use MongoDB only
  - Old positions can still close using contract lookups

**Recommendation:** If you have active positions referencing old commitments, do Option 1 migration. Otherwise, Option 2 is simpler.

### Backward Compatibility

- LineFutures contract may still reference `priceOracle` address
- If contract is already deployed, you can leave it as-is (backend just won't use it)
- New deployments can use updated contract without priceOracle

## Testing Strategy

1. **Unit Tests:**
   - Test MongoDB commitment storage/retrieval
   - Test window indexing and queries
   - Test edge cases (missing windows, duplicate windows)

2. **Integration Tests:**
   - Full price pipeline: aggregator → MongoDB → commitment storage
   - Position closing: get commitment from MongoDB → retrieve data → calculate PNL
   - Window retrieval for various time ranges

3. **Migration Tests:**
   - If migrating existing data, test migration script
   - Verify all commitments migrated correctly
   - Test that old and new commitments both work

## Rollback Plan

If issues arise:
1. Keep `ContractStorage` code in version control
2. Revert service changes to use ContractStorage
3. Redeploy PriceOracle contract if needed
4. Update config to restore `CONTRACT_ADDRESS`

## Performance Improvements

- **Write Speed:** MongoDB writes are instant vs blockchain confirmation (2-12 seconds)
- **Read Speed:** MongoDB queries are faster than contract view calls
- **Cost:** Zero gas costs for commitment storage
- **Scalability:** MongoDB can handle millions of commitments efficiently

## Security Considerations

- **Data Integrity:** MongoDB is centralized (vs blockchain's decentralization)
- **Mitigation:** Consider adding periodic commitment hashing/verification
- **Access Control:** Ensure MongoDB has proper authentication/authorization
- **Backup:** Regular MongoDB backups are critical (no blockchain redundancy)
