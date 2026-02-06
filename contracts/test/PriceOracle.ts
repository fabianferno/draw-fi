import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.connect();

describe("MNTPriceOracle", function () {
  let oracle: any;
  let owner: any;
  let submitter: any;
  let otherAccount: any;

  beforeEach(async function () {
    [owner, submitter, otherAccount] = await ethers.getSigners();

    oracle = await ethers.deployContract("MNTPriceOracle", [submitter.address]);
  });

  describe("Deployment", function () {
    it("Should set the correct submitter", async function () {
      expect(await oracle.submitter()).to.equal(submitter.address);
    });

    it("Should set the correct owner", async function () {
      expect(await oracle.owner()).to.equal(owner.address);
    });

    it("Should revert if submitter is zero address", async function () {
      const MNTPriceOracle = await ethers.getContractFactory("MNTPriceOracle");
      await expect(
        MNTPriceOracle.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("MNTPriceOracle: submitter is zero address");
    });
  });

  describe("storeCommitment", function () {
    const windowStart = 1739136000; // Valid minute boundary
    const commitment = ethers.keccak256(ethers.toUtf8Bytes("test-commitment"));

    it("Should store a commitment successfully", async function () {
      const tx = await oracle.connect(submitter).storeCommitment(windowStart, commitment);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(oracle, "CommitmentStored")
        .withArgs(windowStart, commitment, block!.timestamp);

      expect(await oracle.priceCommitments(windowStart)).to.equal(commitment);
    });

    it("Should store commitment timestamp", async function () {
      await oracle.connect(submitter).storeCommitment(windowStart, commitment);
      
      const storedTimestamp = await oracle.commitmentTimestamps(windowStart);
      expect(storedTimestamp).to.be.gt(0);
    });

    it("Should add window to timestamps array", async function () {
      await oracle.connect(submitter).storeCommitment(windowStart, commitment);
      
      expect(await oracle.getWindowCount()).to.equal(1);
      expect(await oracle.windowTimestamps(0)).to.equal(windowStart);
    });

    it("Should not duplicate window in timestamps array", async function () {
      const commitment2 = ethers.keccak256(ethers.toUtf8Bytes("test-commitment-2"));
      
      await oracle.connect(submitter).storeCommitment(windowStart, commitment);
      await oracle.connect(submitter).storeCommitment(windowStart, commitment2);
      
      expect(await oracle.getWindowCount()).to.equal(1);
    });

    it("Should revert if caller is not submitter", async function () {
      await expect(
        oracle.connect(otherAccount).storeCommitment(windowStart, commitment)
      ).to.be.revertedWith("MNTPriceOracle: caller is not the submitter");
    });

    it("Should revert if commitment is zero", async function () {
      await expect(
        oracle.connect(submitter).storeCommitment(windowStart, ethers.ZeroHash)
      ).to.be.revertedWith("MNTPriceOracle: commitment is zero");
    });

    it("Should revert if window start is zero", async function () {
      await expect(
        oracle.connect(submitter).storeCommitment(0, commitment)
      ).to.be.revertedWith("MNTPriceOracle: invalid window start");
    });

    it("Should revert if window start is not minute boundary", async function () {
      const invalidWindowStart = 1739136015; // Not a minute boundary
      await expect(
        oracle.connect(submitter).storeCommitment(invalidWindowStart, commitment)
      ).to.be.revertedWith("MNTPriceOracle: window start must be minute boundary");
    });

    it("Should store multiple commitments", async function () {
      const windowStart2 = windowStart + 60;
      const commitment2 = ethers.keccak256(ethers.toUtf8Bytes("test-commitment-2"));

      await oracle.connect(submitter).storeCommitment(windowStart, commitment);
      await oracle.connect(submitter).storeCommitment(windowStart2, commitment2);

      expect(await oracle.getWindowCount()).to.equal(2);
      expect(await oracle.priceCommitments(windowStart)).to.equal(commitment);
      expect(await oracle.priceCommitments(windowStart2)).to.equal(commitment2);
    });
  });

  describe("getCommitment", function () {
    const windowStart = 1739136000;
    const commitment = ethers.keccak256(ethers.toUtf8Bytes("test-commitment"));

    it("Should return stored commitment", async function () {
      await oracle.connect(submitter).storeCommitment(windowStart, commitment);
      expect(await oracle.getCommitment(windowStart)).to.equal(commitment);
    });

    it("Should return zero for non-existent window", async function () {
      expect(await oracle.getCommitment(windowStart)).to.equal(ethers.ZeroHash);
    });
  });

  describe("getLatestWindow", function () {
    it("Should return 0 when no windows stored", async function () {
      expect(await oracle.getLatestWindow()).to.equal(0);
    });

    it("Should return latest window timestamp", async function () {
      const windowStart1 = 1739136000;
      const windowStart2 = 1739136060;
      const windowStart3 = 1739136120;
      const commitment = ethers.keccak256(ethers.toUtf8Bytes("test-commitment"));

      await oracle.connect(submitter).storeCommitment(windowStart1, commitment);
      await oracle.connect(submitter).storeCommitment(windowStart2, commitment);
      await oracle.connect(submitter).storeCommitment(windowStart3, commitment);

      expect(await oracle.getLatestWindow()).to.equal(windowStart3);
    });
  });

  describe("getWindowsInRange", function () {
    const windowStart1 = 1739136000;
    const windowStart2 = 1739136060;
    const windowStart3 = 1739136120;
    const windowStart4 = 1739136180;
    const commitment = ethers.keccak256(ethers.toUtf8Bytes("test-commitment"));

    beforeEach(async function () {
      await oracle.connect(submitter).storeCommitment(windowStart1, commitment);
      await oracle.connect(submitter).storeCommitment(windowStart2, commitment);
      await oracle.connect(submitter).storeCommitment(windowStart3, commitment);
      await oracle.connect(submitter).storeCommitment(windowStart4, commitment);
    });

    it("Should return all windows in range", async function () {
      const windows = await oracle.getWindowsInRange(windowStart1, windowStart4);
      expect(windows.length).to.equal(4);
      expect(windows[0]).to.equal(windowStart1);
      expect(windows[3]).to.equal(windowStart4);
    });

    it("Should return partial range", async function () {
      const windows = await oracle.getWindowsInRange(windowStart2, windowStart3);
      expect(windows.length).to.equal(2);
      expect(windows[0]).to.equal(windowStart2);
      expect(windows[1]).to.equal(windowStart3);
    });

    it("Should return empty array for range with no windows", async function () {
      const windows = await oracle.getWindowsInRange(windowStart4 + 60, windowStart4 + 120);
      expect(windows.length).to.equal(0);
    });

    it("Should revert if start > end", async function () {
      await expect(
        oracle.getWindowsInRange(windowStart3, windowStart1)
      ).to.be.revertedWith("MNTPriceOracle: invalid range");
    });

    it("Should handle single window range", async function () {
      const windows = await oracle.getWindowsInRange(windowStart2, windowStart2);
      expect(windows.length).to.equal(1);
      expect(windows[0]).to.equal(windowStart2);
    });
  });

  describe("getWindowCount", function () {
    it("Should return 0 initially", async function () {
      expect(await oracle.getWindowCount()).to.equal(0);
    });

    it("Should return correct count after storing commitments", async function () {
      const commitment = ethers.keccak256(ethers.toUtf8Bytes("test-commitment"));
      
      await oracle.connect(submitter).storeCommitment(1739136000, commitment);
      expect(await oracle.getWindowCount()).to.equal(1);
      
      await oracle.connect(submitter).storeCommitment(1739136060, commitment);
      expect(await oracle.getWindowCount()).to.equal(2);
      
      await oracle.connect(submitter).storeCommitment(1739136120, commitment);
      expect(await oracle.getWindowCount()).to.equal(3);
    });
  });

  describe("updateSubmitter", function () {
    it("Should update submitter", async function () {
      await expect(
        oracle.connect(owner).updateSubmitter(otherAccount.address)
      )
        .to.emit(oracle, "SubmitterUpdated")
        .withArgs(submitter.address, otherAccount.address);

      expect(await oracle.submitter()).to.equal(otherAccount.address);
    });

    it("Should revert if caller is not owner", async function () {
      await expect(
        oracle.connect(submitter).updateSubmitter(otherAccount.address)
      ).to.be.revertedWith("MNTPriceOracle: caller is not the owner");
    });

    it("Should revert if new submitter is zero address", async function () {
      await expect(
        oracle.connect(owner).updateSubmitter(ethers.ZeroAddress)
      ).to.be.revertedWith("MNTPriceOracle: new submitter is zero address");
    });

    it("Should allow new submitter to store commitments", async function () {
      await oracle.connect(owner).updateSubmitter(otherAccount.address);
      
      const windowStart = 1739136000;
      const commitment = ethers.keccak256(ethers.toUtf8Bytes("test-commitment"));
      
      await oracle.connect(otherAccount).storeCommitment(windowStart, commitment);
      expect(await oracle.priceCommitments(windowStart)).to.equal(commitment);
    });
  });

  describe("transferOwnership", function () {
    it("Should transfer ownership", async function () {
      await expect(
        oracle.connect(owner).transferOwnership(otherAccount.address)
      )
        .to.emit(oracle, "OwnershipTransferred")
        .withArgs(owner.address, otherAccount.address);

      expect(await oracle.owner()).to.equal(otherAccount.address);
    });

    it("Should revert if caller is not owner", async function () {
      await expect(
        oracle.connect(submitter).transferOwnership(otherAccount.address)
      ).to.be.revertedWith("MNTPriceOracle: caller is not the owner");
    });

    it("Should revert if new owner is zero address", async function () {
      await expect(
        oracle.connect(owner).transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWith("MNTPriceOracle: new owner is zero address");
    });

    it("Should allow new owner to update submitter", async function () {
      await oracle.connect(owner).transferOwnership(otherAccount.address);
      
      await oracle.connect(otherAccount).updateSubmitter(submitter.address);
      expect(await oracle.submitter()).to.equal(submitter.address);
    });
  });

  // Helper function to get block timestamp
  async function getBlockTimestamp(): Promise<number> {
    const blockNumber = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNumber);
    return block!.timestamp;
  }
});

