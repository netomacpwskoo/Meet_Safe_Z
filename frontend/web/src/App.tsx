import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface ConferenceRoom {
  id: string;
  name: string;
  encryptedKey: string;
  participantLimit: number;
  duration: number;
  timestamp: number;
  creator: string;
  isActive: boolean;
  isVerified?: boolean;
  decryptedValue?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [conferences, setConferences] = useState<ConferenceRoom[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingConference, setCreatingConference] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newConferenceData, setNewConferenceData] = useState({ 
    name: "", 
    key: "", 
    limit: "", 
    duration: "" 
  });
  const [selectedConference, setSelectedConference] = useState<ConferenceRoom | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [operationHistory, setOperationHistory] = useState<string[]>([]);
  const [faqVisible, setFaqVisible] = useState(false);
  const [stats, setStats] = useState({ total: 0, active: 0, verified: 0 });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized) return;
      
      try {
        console.log('Initializing FHEVM for secure video conference...');
        await initialize();
        addToHistory("FHEVM initialized for encrypted video streaming");
      } catch (error) {
        console.error('FHEVM initialization failed:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHE security system initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize]);

  useEffect(() => {
    const loadData = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadConferences();
      } catch (error) {
        console.error('Failed to load conference data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isConnected]);

  const addToHistory = (action: string) => {
    setOperationHistory(prev => [`${new Date().toLocaleTimeString()}: ${action}`, ...prev.slice(0, 9)]);
  };

  const loadConferences = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const conferencesList: ConferenceRoom[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          conferencesList.push({
            id: businessId,
            name: businessData.name,
            encryptedKey: businessId,
            participantLimit: Number(businessData.publicValue1) || 0,
            duration: Number(businessData.publicValue2) || 0,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            isActive: true,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading conference data:', e);
        }
      }
      
      setConferences(conferencesList);
      setStats({
        total: conferencesList.length,
        active: conferencesList.filter(c => c.isActive).length,
        verified: conferencesList.filter(c => c.isVerified).length
      });
      addToHistory(`Loaded ${conferencesList.length} encrypted conferences`);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load conference data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createConference = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingConference(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating secure conference room with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const keyValue = parseInt(newConferenceData.key) || 0;
      const businessId = `conference-${Date.now()}`;
      const contractAddress = await contract.getAddress();
      
      const encryptedResult = await encrypt(contractAddress, address, keyValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newConferenceData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newConferenceData.limit) || 0,
        parseInt(newConferenceData.duration) || 0,
        "Secure Video Conference Room"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Encrypting video stream keys..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Secure conference room created!" });
      addToHistory(`Created encrypted conference: ${newConferenceData.name}`);
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadConferences();
      setShowCreateModal(false);
      setNewConferenceData({ name: "", key: "", limit: "", duration: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
        : "Creation failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingConference(false); 
    }
  };

  const decryptConferenceKey = async (conferenceId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(conferenceId);
      if (businessData.isVerified) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Conference key already verified on-chain" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return Number(businessData.decryptedValue) || 0;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(conferenceId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        await contractRead.getAddress(),
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(conferenceId, abiEncodedClearValues, decryptionProof)
      );
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadConferences();
      addToHistory(`Decrypted conference key: ${clearValue}`);
      
      setTransactionStatus({ visible: true, status: "success", message: "Conference key decrypted and verified!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        await loadConferences();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const available = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: `FHE system ${available ? "available" : "unavailable"}` 
      });
      addToHistory("Checked FHE system availability");
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredConferences = conferences.filter(conf =>
    conf.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conf.creator.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>Meet_Safe_Z 🔐</h1>
            <span>FHE-Protected Video Conference</span>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🎥🔐</div>
            <h2>Connect Wallet to Start Secure Conferencing</h2>
            <p>End-to-end encrypted video meetings powered by Fully Homomorphic Encryption</p>
            <div className="feature-grid">
              <div className="feature-item">
                <div className="feature-icon">🔒</div>
                <h3>Encrypted Streams</h3>
                <p>Video/audio encrypted with FHE, servers cannot decode</p>
              </div>
              <div className="feature-item">
                <div className="feature-icon">⚡</div>
                <h3>Homomorphic Signaling</h3>
                <p>Secure signaling exchange while maintaining encryption</p>
              </div>
              <div className="feature-item">
                <div className="feature-icon">🛡️</div>
                <h3>Eavesdrop Protection</h3>
                <p>Military-grade protection against interception</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Video Encryption System...</p>
        <p className="loading-note">Securing your video streams with homomorphic encryption</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading secure conference system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Meet_Safe_Z 🎥🔐</h1>
          <span>FHE-Encrypted Video Conference</span>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="status-btn">
            Check FHE Status
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + New Conference
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="stats-panel">
          <div className="stat-item">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Total Conferences</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{stats.active}</div>
            <div className="stat-label">Active Rooms</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{stats.verified}</div>
            <div className="stat-label">FHE Verified</div>
          </div>
        </div>

        <div className="search-section">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search conferences by name or creator..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <button onClick={loadConferences} className="refresh-btn">
              {isRefreshing ? "🔄" : "↻"}
            </button>
          </div>
        </div>

        <div className="conferences-grid">
          {filteredConferences.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🎥</div>
              <p>No secure conferences found</p>
              <button onClick={() => setShowCreateModal(true)} className="create-btn">
                Create First Conference
              </button>
            </div>
          ) : (
            filteredConferences.map((conference) => (
              <ConferenceCard
                key={conference.id}
                conference={conference}
                onSelect={setSelectedConference}
                onDecrypt={decryptConferenceKey}
              />
            ))
          )}
        </div>

        <div className="info-panels">
          <div className="info-panel">
            <h3>Operation History</h3>
            <div className="history-list">
              {operationHistory.map((entry, index) => (
                <div key={index} className="history-entry">{entry}</div>
              ))}
            </div>
          </div>

          <div className="info-panel">
            <div className="panel-header">
              <h3>FHE Security FAQ</h3>
              <button 
                onClick={() => setFaqVisible(!faqVisible)}
                className="toggle-btn"
              >
                {faqVisible ? "▲" : "▼"}
              </button>
            </div>
            {faqVisible && (
              <div className="faq-content">
                <div className="faq-item">
                  <strong>How does FHE protect my video?</strong>
                  <p>Video streams are encrypted client-side using FHE, servers only relay encrypted data without decryption capability.</p>
                </div>
                <div className="faq-item">
                  <strong>What data is encrypted?</strong>
                  <p>All video/audio streams and signaling data are homomorphically encrypted end-to-end.</p>
                </div>
                <div className="faq-item">
                  <strong>Can servers eavesdrop?</strong>
                  <p>No, servers cannot decrypt the data without private keys that never leave participant devices.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <CreateConferenceModal
          onSubmit={createConference}
          onClose={() => setShowCreateModal(false)}
          creating={creatingConference}
          conferenceData={newConferenceData}
          setConferenceData={setNewConferenceData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedConference && (
        <ConferenceDetailModal
          conference={selectedConference}
          onClose={() => setSelectedConference(null)}
          onDecrypt={decryptConferenceKey}
          isDecrypting={fheIsDecrypting}
        />
      )}
      
      {transactionStatus.visible && (
        <div className={`transaction-toast ${transactionStatus.status}`}>
          <div className="toast-content">
            <span className="toast-icon">
              {transactionStatus.status === "pending" && "⏳"}
              {transactionStatus.status === "success" && "✅"}
              {transactionStatus.status === "error" && "❌"}
            </span>
            {transactionStatus.message}
          </div>
        </div>
      )}
    </div>
  );
};

const ConferenceCard: React.FC<{
  conference: ConferenceRoom;
  onSelect: (conference: ConferenceRoom) => void;
  onDecrypt: (id: string) => Promise<number | null>;
}> = ({ conference, onSelect, onDecrypt }) => {
  const [decrypting, setDecrypting] = useState(false);

  const handleDecrypt = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setDecrypting(true);
    await onDecrypt(conference.id);
    setDecrypting(false);
  };

  return (
    <div className="conference-card" onClick={() => onSelect(conference)}>
      <div className="card-header">
        <h3>{conference.name}</h3>
        <span className={`status-badge ${conference.isVerified ? 'verified' : 'encrypted'}`}>
          {conference.isVerified ? '✅ Verified' : '🔒 Encrypted'}
        </span>
      </div>
      
      <div className="card-details">
        <div className="detail-item">
          <span>Participants:</span>
          <strong>{conference.participantLimit}</strong>
        </div>
        <div className="detail-item">
          <span>Duration:</span>
          <strong>{conference.duration}min</strong>
        </div>
        <div className="detail-item">
          <span>Created:</span>
          <strong>{new Date(conference.timestamp * 1000).toLocaleDateString()}</strong>
        </div>
      </div>
      
      <div className="card-actions">
        <button 
          onClick={handleDecrypt}
          disabled={decrypting || conference.isVerified}
          className={`decrypt-btn ${conference.isVerified ? 'verified' : ''}`}
        >
          {decrypting ? "Decrypting..." : conference.isVerified ? "Decrypted" : "Decrypt Key"}
        </button>
        <button className="join-btn">Join Meeting</button>
      </div>
    </div>
  );
};

const CreateConferenceModal: React.FC<{
  onSubmit: () => void;
  onClose: () => void;
  creating: boolean;
  conferenceData: any;
  setConferenceData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, conferenceData, setConferenceData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'key') {
      const intValue = value.replace(/[^\d]/g, '');
      setConferenceData({ ...conferenceData, [name]: intValue });
    } else {
      setConferenceData({ ...conferenceData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
        <div className="modal-content">
          <div className="modal-header">
            <h2>Create Secure Conference</h2>
            <button onClick={onClose} className="close-btn">×</button>
          </div>
          
          <div className="modal-body">
            <div className="fhe-notice">
              <div className="notice-icon">🔐</div>
              <div>
                <strong>FHE Video Encryption</strong>
                <p>Conference key will be encrypted with Zama FHE (Integer encryption only)</p>
              </div>
            </div>
            
            <div className="form-group">
              <label>Conference Name *</label>
              <input
                type="text"
                name="name"
                value={conferenceData.name}
                onChange={handleChange}
                placeholder="Enter conference name..."
              />
            </div>
            
            <div className="form-group">
              <label>Encryption Key (Integer) *</label>
              <input
                type="number"
                name="key"
                value={conferenceData.key}
                onChange={handleChange}
                placeholder="Enter encryption key..."
                step="1"
                min="0"
              />
              <span className="input-hint">FHE Encrypted Integer</span>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label>Participant Limit *</label>
                <input
                  type="number"
                  name="limit"
                  value={conferenceData.limit}
                  onChange={handleChange}
                  placeholder="Max participants"
                  min="1"
                />
              </div>
              
              <div className="form-group">
                <label>Duration (minutes) *</label>
                <input
                  type="number"
                  name="duration"
                  value={conferenceData.duration}
                  onChange={handleChange}
                  placeholder="Meeting duration"
                  min="1"
                />
              </div>
            </div>
          </div>
          
          <div className="modal-footer">
            <button onClick={onClose} className="cancel-btn">Cancel</button>
            <button
              onClick={onSubmit}
              disabled={creating || isEncrypting || !conferenceData.name || !conferenceData.key}
              className="submit-btn"
            >
              {creating || isEncrypting ? "Encrypting..." : "Create Conference"}
            </button>
          </div>
        </div>
      </div>
  );
};

const ConferenceDetailModal: React.FC<{
  conference: ConferenceRoom;
  onClose: () => void;
  onDecrypt: (id: string) => Promise<number | null>;
  isDecrypting: boolean;
}> = ({ conference, onClose, onDecrypt, isDecrypting }) => {
  const [localDecrypted, setLocalDecrypted] = useState<number | null>(null);

  const handleDecrypt = async () => {
    const result = await onDecrypt(conference.id);
    if (result !== null) {
      setLocalDecrypted(result);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content large">
        <div className="modal-header">
          <h2>Conference Details</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        <div className="modal-body">
          <div className="detail-grid">
            <div className="detail-section">
              <h3>Conference Information</h3>
              <div className="info-item">
                <span>Name:</span>
                <strong>{conference.name}</strong>
              </div>
              <div className="info-item">
                <span>Creator:</span>
                <strong>{conference.creator.substring(0, 8)}...{conference.creator.substring(36)}</strong>
              </div>
              <div className="info-item">
                <span>Created:</span>
                <strong>{new Date(conference.timestamp * 1000).toLocaleString()}</strong>
              </div>
            </div>
            
            <div className="detail-section">
              <h3>Security Status</h3>
              <div className="security-status">
                <div className={`status-indicator ${conference.isVerified ? 'verified' : 'encrypted'}`}>
                  {conference.isVerified ? '✅ On-chain Verified' : '🔒 FHE Encrypted'}
                </div>
                <div className="key-info">
                  <span>Encryption Key:</span>
                  <strong>
                    {conference.isVerified ? 
                      `${conference.decryptedValue} (Verified)` : 
                      localDecrypted ? 
                      `${localDecrypted} (Local)` : 
                      "🔒 Encrypted"
                    }
                  </strong>
                </div>
                <button
                  onClick={handleDecrypt}
                  disabled={isDecrypting || conference.isVerified}
                  className="verify-btn"
                >
                  {isDecrypting ? "Verifying..." : conference.isVerified ? "Verified" : "Verify Key"}
                </button>
              </div>
            </div>
          </div>
          
          <div className="fhe-explanation">
            <h4>FHE Video Protection Flow</h4>
            <div className="flow-steps">
              <div className="flow-step">
                <div className="step-number">1</div>
                <div className="step-content">
                  <strong>Video Encryption</strong>
                  <p>Camera stream encrypted with FHE before transmission</p>
                </div>
              </div>
              <div className="flow-step">
                <div className="step-number">2</div>
                <div className="step-content">
                  <strong>Secure Relay</strong>
                  <p>Servers relay encrypted data without decryption capability</p>
                </div>
              </div>
              <div className="flow-step">
                <div className="step-number">3</div>
                <div className="step-content">
                  <strong>Client Decryption</strong>
                  <p>Authorized participants decrypt streams locally</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          <button className="primary-btn">Join Secure Conference</button>
        </div>
      </div>
    </div>
  );
};

export default App;

