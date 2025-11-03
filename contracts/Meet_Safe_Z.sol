pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract EncryptedVideoConference is ZamaEthereumConfig {
    
    struct Conference {
        string conferenceId;
        euint32 encryptedStreamKey;
        address creator;
        uint256 startTime;
        uint256 endTime;
        bool isActive;
        uint32 decryptedStreamKey;
        bool isDecrypted;
    }
    
    mapping(string => Conference) public conferences;
    string[] public conferenceIds;
    
    event ConferenceCreated(string indexed conferenceId, address indexed creator);
    event StreamKeyDecrypted(string indexed conferenceId, uint32 decryptedKey);
    
    constructor() ZamaEthereumConfig() {
    }
    
    function createConference(
        string calldata conferenceId,
        externalEuint32 encryptedStreamKey,
        bytes calldata inputProof,
        uint256 startTime,
        uint256 endTime
    ) external {
        require(bytes(conferences[conferenceId].conferenceId).length == 0, "Conference already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedStreamKey, inputProof)), "Invalid encrypted input");
        require(startTime < endTime, "Invalid time range");
        require(block.timestamp < endTime, "Conference has already ended");
        
        conferences[conferenceId] = Conference({
            conferenceId: conferenceId,
            encryptedStreamKey: FHE.fromExternal(encryptedStreamKey, inputProof),
            creator: msg.sender,
            startTime: startTime,
            endTime: endTime,
            isActive: true,
            decryptedStreamKey: 0,
            isDecrypted: false
        });
        
        FHE.allowThis(conferences[conferenceId].encryptedStreamKey);
        FHE.makePubliclyDecryptable(conferences[conferenceId].encryptedStreamKey);
        
        conferenceIds.push(conferenceId);
        emit ConferenceCreated(conferenceId, msg.sender);
    }
    
    function decryptStreamKey(
        string calldata conferenceId,
        bytes memory abiEncodedClearKey,
        bytes memory decryptionProof
    ) external {
        require(bytes(conferences[conferenceId].conferenceId).length > 0, "Conference does not exist");
        require(!conferences[conferenceId].isDecrypted, "Stream key already decrypted");
        require(block.timestamp >= conferences[conferenceId].startTime, "Conference has not started");
        require(block.timestamp <= conferences[conferenceId].endTime, "Conference has ended");
        
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(conferences[conferenceId].encryptedStreamKey);
        
        FHE.checkSignatures(cts, abiEncodedClearKey, decryptionProof);
        
        uint32 decodedKey = abi.decode(abiEncodedClearKey, (uint32));
        
        conferences[conferenceId].decryptedStreamKey = decodedKey;
        conferences[conferenceId].isDecrypted = true;
        
        emit StreamKeyDecrypted(conferenceId, decodedKey);
    }
    
    function getEncryptedStreamKey(string calldata conferenceId) external view returns (euint32) {
        require(bytes(conferences[conferenceId].conferenceId).length > 0, "Conference does not exist");
        return conferences[conferenceId].encryptedStreamKey;
    }
    
    function getConferenceDetails(string calldata conferenceId) external view returns (
        address creator,
        uint256 startTime,
        uint256 endTime,
        bool isActive,
        bool isDecrypted,
        uint32 decryptedStreamKey
    ) {
        require(bytes(conferences[conferenceId].conferenceId).length > 0, "Conference does not exist");
        Conference storage conf = conferences[conferenceId];
        
        return (
            conf.creator,
            conf.startTime,
            conf.endTime,
            conf.isActive,
            conf.isDecrypted,
            conf.decryptedStreamKey
        );
    }
    
    function getAllConferenceIds() external view returns (string[] memory) {
        return conferenceIds;
    }
    
    function endConference(string calldata conferenceId) external {
        require(bytes(conferences[conferenceId].conferenceId).length > 0, "Conference does not exist");
        require(msg.sender == conferences[conferenceId].creator, "Only creator can end conference");
        require(block.timestamp > conferences[conferenceId].endTime, "Conference is still active");
        
        conferences[conferenceId].isActive = false;
    }
    
    function isConferenceActive(string calldata conferenceId) external view returns (bool) {
        require(bytes(conferences[conferenceId].conferenceId).length > 0, "Conference does not exist");
        return conferences[conferenceId].isActive;
    }
}

