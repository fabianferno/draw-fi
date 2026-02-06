// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title PriceOracle
 * @notice Stores EigenDA commitment strings for token pair price data windows
 * @dev Each commitment represents a 60-second price window stored in EigenDA
 */
contract PriceOracle {
    // Mapping from window start timestamp to EigenDA commitment string
    mapping(uint256 => string) public priceCommitments;
    
    // Mapping from window start timestamp to block timestamp when commitment was stored
    mapping(uint256 => uint256) public commitmentTimestamps;
    
    // Array of all window timestamps for iteration
    uint256[] public windowTimestamps;
    
    // Mapping to check if a window timestamp already exists
    mapping(uint256 => bool) private windowExists;
    
    // Address authorized to submit commitments
    address public submitter;
    
    // Contract owner for administrative functions
    address public owner;
    
    // Events
    event CommitmentStored(
        uint256 indexed windowStart,
        string commitment,
        uint256 timestamp
    );
    
    event SubmitterUpdated(
        address indexed oldSubmitter,
        address indexed newSubmitter
    );
    
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );
    
    // Modifiers
    modifier onlySubmitter() {
        require(msg.sender == submitter, "PriceOracle: caller is not the submitter");
        _;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "PriceOracle: caller is not the owner");
        _;
    }
    
    /**
     * @notice Constructor sets the initial submitter and owner
     * @param _submitter Address authorized to submit commitments
     */
    constructor(address _submitter) {
        require(_submitter != address(0), "PriceOracle: submitter is zero address");
        submitter = _submitter;
        owner = msg.sender;
        
        emit SubmitterUpdated(address(0), _submitter);
        emit OwnershipTransferred(address(0), msg.sender);
    }
    
    /**
     * @notice Store a commitment string for a price window
     * @param windowStart Unix timestamp of the window start (minute boundary)
     * @param commitment EigenDA commitment string
     */
    function storeCommitment(uint256 windowStart, string memory commitment) external onlySubmitter {
        require(bytes(commitment).length > 0, "PriceOracle: commitment is empty");
        require(windowStart > 0, "PriceOracle: invalid window start");
        require(windowStart % 60 == 0, "PriceOracle: window start must be minute boundary");
        
        // Store the commitment
        priceCommitments[windowStart] = commitment;
        commitmentTimestamps[windowStart] = block.timestamp;
        
        // Add to window timestamps array if not already present
        if (!windowExists[windowStart]) {
            windowTimestamps.push(windowStart);
            windowExists[windowStart] = true;
        }
        
        emit CommitmentStored(windowStart, commitment, block.timestamp);
    }
    
    /**
     * @notice Get the commitment string for a specific window
     * @param windowStart Unix timestamp of the window start
     * @return commitment The EigenDA commitment string
     */
    function getCommitment(uint256 windowStart) external view returns (string memory) {
        return priceCommitments[windowStart];
    }
    
    /**
     * @notice Get the latest window timestamp
     * @return Latest window start timestamp, or 0 if no windows stored
     */
    function getLatestWindow() external view returns (uint256) {
        if (windowTimestamps.length == 0) {
            return 0;
        }
        return windowTimestamps[windowTimestamps.length - 1];
    }
    
    /**
     * @notice Get all window timestamps in a time range
     * @param start Start of the time range (inclusive)
     * @param end End of the time range (inclusive)
     * @return windows Array of window timestamps in the range
     */
    function getWindowsInRange(uint256 start, uint256 end) external view returns (uint256[] memory) {
        require(start <= end, "PriceOracle: invalid range");
        
        // First pass: count matching windows
        uint256 count = 0;
        for (uint256 i = 0; i < windowTimestamps.length; i++) {
            if (windowTimestamps[i] >= start && windowTimestamps[i] <= end) {
                count++;
            }
        }
        
        // Second pass: collect matching windows
        uint256[] memory windows = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < windowTimestamps.length; i++) {
            if (windowTimestamps[i] >= start && windowTimestamps[i] <= end) {
                windows[index] = windowTimestamps[i];
                index++;
            }
        }
        
        return windows;
    }
    
    /**
     * @notice Get the total number of stored windows
     * @return Total count of windows
     */
    function getWindowCount() external view returns (uint256) {
        return windowTimestamps.length;
    }
    
    /**
     * @notice Update the authorized submitter address
     * @param newSubmitter New submitter address
     */
    function updateSubmitter(address newSubmitter) external onlyOwner {
        require(newSubmitter != address(0), "PriceOracle: new submitter is zero address");
        address oldSubmitter = submitter;
        submitter = newSubmitter;
        emit SubmitterUpdated(oldSubmitter, newSubmitter);
    }
    
    /**
     * @notice Transfer ownership of the contract
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "PriceOracle: new owner is zero address");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

