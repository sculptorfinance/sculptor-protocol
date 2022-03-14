// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "../interfaces/IPriceFeed.sol";
import "../interfaces/IBandStdReference.sol";
import "../interfaces/IChainlinkAggregator.sol";
import "../dependencies/openzeppelin/contracts/SafeMath.sol";

/*
* PriceFeed for mainnet deployment, to be connected to Chainlink's live ETH:USD aggregator reference
* contract, and a wrapper contract bandOracle, which connects to BandMaster contract.
*
* The PriceFeed uses Chainlink as primary oracle, and Band as fallback. It contains logic for
* switching oracles based on oracle failures, timeouts, and conditions for returning to the primary
* Chainlink oracle.
*/
contract MockPriceFeed is IPriceFeed {
    using SafeMath for uint256;

    uint constant public DECIMAL_PRECISION = 1e18;

    IChainlinkAggregator public chainlinkOracle;  // Mainnet Chainlink aggregator
    IBandStdReference public bandOracle;  // Wrapper contract that calls the Band system

    string public bandBase;
    string public constant bandQuote = "USD";

    // Use to convert a price answer to an 18-digit precision uint
    uint constant public TARGET_DIGITS = 18;

    // Maximum time period allowed since Chainlink's latest round data timestamp, beyond which Chainlink is considered frozen.
    // For stablecoins we recommend 90000, as Chainlink updates once per day when there is no significant price movement
    // For volatile assets we recommend 14400 (4 hours)
    uint immutable public TIMEOUT;

    // Maximum deviation allowed between two consecutive Chainlink oracle prices. 18-digit precision.
    uint constant public MAX_PRICE_DEVIATION_FROM_PREVIOUS_ROUND =  5e17; // 50%

    /*
    * The maximum relative price difference between two oracle responses allowed in order for the PriceFeed
    * to return to using the Chainlink oracle. 18-digit precision.
    */
    uint constant public MAX_PRICE_DIFFERENCE_BETWEEN_ORACLES = 5e16; // 5%

    // The last good price seen from an oracle by Liquity
    uint public lastGoodPrice;

    struct ChainlinkResponse {
        uint80 roundId;
        uint256 answer;
        uint256 timestamp;
        bool success;
        uint8 decimals;
    }

    struct BandResponse {
        uint256 value;
        uint256 timestamp;
        bool success;
    }

    enum Status {
        chainlinkWorking,
        usingBandChainlinkUntrusted,
        bothOraclesUntrusted,
        usingBandChainlinkFrozen,
        usingChainlinkBandUntrusted
    }

    // The current status of the PricFeed, which determines the conditions for the next price fetch attempt
    Status public status;

    /* event LastGoodPriceUpdated(uint _lastGoodPrice);
    event PriceFeedStatusChanged(Status newStatus); */

    // --- Dependency setters ---
    uint256 private setPrice = 1000000000000000000;
    constructor(
        IChainlinkAggregator _chainlinkOracleAddress,
        IBandStdReference _bandOracleAddress,
        uint256 _timeout,
        string memory _bandBase,
        uint256 _setPrice
    ) {
        chainlinkOracle = _chainlinkOracleAddress;
        bandOracle = _bandOracleAddress;

        TIMEOUT = _timeout;

        bandBase = _bandBase;
        
        setPrice = _setPrice;
        lastGoodPrice = _setPrice;
    }

    // --- Functions ---

    /*
    * fetchPrice():
    * Returns the latest price obtained from the Oracle. Called by Liquity functions that require a current price.
    *
    * Also callable by anyone externally.
    *
    * Non-view function - it stores the last good price seen by Liquity.
    *
    * Uses a main oracle (Chainlink) and a fallback oracle (Band) in case Chainlink fails. If both fail,
    * it uses the last good price seen by Liquity.
    *
    */
    function fetchPrice() external view override returns (uint) {
        uint price = setPrice;
        return price;
    }

    function updatePrice() external override returns (uint) {
        uint price = setPrice;
        lastGoodPrice = price;

        return price;
    }
}
