import React, { useState, useEffect, useCallback } from 'react';
import ReactPlayer from 'react-player/youtube';
import './App.css';
import { fetchLiveGame, fetchChampionAbilities, fetchDataDragonVersion, searchYouTubeVideos } from './utils/api';
import { 
  getAccounts, 
  saveAccount, 
  deleteAccount, 
  getLastSelectedAccount, 
  setLastSelectedAccount,
  getChampionLearningCount,
  incrementChampionLearning,
  decrementChampionLearning,
  getLearningRange,
  getLearningBadgeColor
} from './utils/storage';

function App() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [liveGame, setLiveGame] = useState(null);
  const [selectedChampionId, setSelectedChampionId] = useState(null);
  const [abilities, setAbilities] = useState([]);
  const [videos, setVideos] = useState({ guide: null, matchup: null });
  const [ddVersion, setDdVersion] = useState(null);
  const [error, setError] = useState('');
  const [loadingAbilities, setLoadingAbilities] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [learningRange, setLearningRange] = useState({ min: 0, max: 0 });

  // Initialize
  useEffect(() => {
    loadAccountsFromStorage();
    loadDataDragonVersion();
  }, []);

  // Update learning range when needed
  const updateLearningRange = useCallback(() => {
    setLearningRange(getLearningRange());
  }, []);

  useEffect(() => {
    updateLearningRange();
  }, [updateLearningRange, liveGame]);

  const loadAccountsFromStorage = () => {
    const loadedAccounts = getAccounts();
    setAccounts(loadedAccounts);
    
    const lastSelected = getLastSelectedAccount();
    if (lastSelected && loadedAccounts.find(acc => acc.name === lastSelected)) {
      setSelectedAccount(lastSelected);
      fetchLiveGameData(lastSelected);
    }
  };

  const loadDataDragonVersion = async () => {
    try {
      const version = await fetchDataDragonVersion();
      setDdVersion(version);
    } catch (error) {
      console.error('Error loading Data Dragon version:', error);
      setDdVersion('13.24.1'); // Fallback
    }
  };

  const showError = (message, duration = 5000) => {
    setError(message);
    setTimeout(() => setError(''), duration);
  };

  const fetchLiveGameData = async (accountName) => {
    if (!accountName) return;
    
    try {
      setError('');
      const gameData = await fetchLiveGame(accountName);
      setLiveGame(gameData);
      
      // Auto-select first ally if none selected
      if (!selectedChampionId && gameData.allyTeam.length > 0) {
        selectChampion(gameData.allyTeam[0].championId);
      }
    } catch (error) {
      setLiveGame(null);
      setSelectedChampionId(null);
      if (error.message === 'Not currently in game') {
        showError('Not currently in game');
      } else {
        showError('Failed to fetch live game data');
      }
      console.error('Live game error:', error);
    }
  };

  const selectChampion = async (championId) => {
    setSelectedChampionId(championId);
    
    const championName = getChampionNameById(championId);
    if (championName) {
      // Fetch abilities
      setLoadingAbilities(true);
      try {
        const championAbilities = await fetchChampionAbilities(championName);
        setAbilities(championAbilities);
      } catch (error) {
        console.error('Error fetching abilities:', error);
        showError('Failed to fetch champion abilities');
        setAbilities([]);
      } finally {
        setLoadingAbilities(false);
      }

      // Fetch videos if we have myChampion
      if (liveGame?.myChampion) {
        await fetchVideosForChampion(championName, liveGame.myChampion.name);
      }
    }
  };

  const fetchVideosForChampion = async (selectedChampionName, myChampionName) => {
    setLoadingVideos(true);
    try {
      // Guide video search
      const guideQuery = `${selectedChampionName} guide abilities League of Legends`;
      const guideResults = await searchYouTubeVideos(guideQuery, 3);
      
      // Matchup video search  
      const matchupQuery = `${myChampionName} vs ${selectedChampionName} matchup League of Legends`;
      const matchupResults = await searchYouTubeVideos(matchupQuery, 3);
      
      setVideos({
        guide: guideResults.length > 0 ? guideResults[0] : null,
        matchup: matchupResults.length > 0 ? matchupResults[0] : null
      });
    } catch (error) {
      console.error('Error fetching videos:', error);
      setVideos({ guide: null, matchup: null });
    } finally {
      setLoadingVideos(false);
    }
  };

  const getChampionNameById = (championId) => {
    if (!liveGame) return null;
    
    const allPlayers = [...liveGame.allyTeam, ...liveGame.enemyTeam];
    if (liveGame.myChampion && championId === liveGame.myChampion.id) {
      return liveGame.myChampion.name;
    }
    
    const player = allPlayers.find(p => p.championId === championId);
    return player ? player.championName : null;
  };

  const getChampionIconUrl = (championKey) => {
    if (!championKey || !ddVersion) {
      return `https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion/Aatrox.png`;
    }
    return `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${championKey}.png`;
  };

  const handleAccountChange = (e) => {
    const accountName = e.target.value;
    setSelectedAccount(accountName);
    if (accountName) {
      setLastSelectedAccount(accountName);
      fetchLiveGameData(accountName);
    }
  };

  const handleAddAccount = () => {
    const accountName = prompt('Enter GameName#TAG (EUW1):');
    if (accountName && accountName.trim()) {
      try {
        saveAccount(accountName.trim());
        setSelectedAccount(accountName.trim());
        setAccounts(getAccounts());
        fetchLiveGameData(accountName.trim());
      } catch (error) {
        showError(error.message);
      }
    }
  };

  const handleDeleteAccount = () => {
    if (!selectedAccount) {
      showError('Please select an account to delete');
      return;
    }
    
    if (window.confirm(`Delete account "${selectedAccount}"?`)) {
      deleteAccount(selectedAccount);
      setAccounts(getAccounts());
      setSelectedAccount('');
      setLiveGame(null);
      setSelectedChampionId(null);
    }
  };

  const handleLearntChampion = () => {
    if (!selectedChampionId) return;
    
    const championName = getChampionNameById(selectedChampionId);
    if (championName) {
      incrementChampionLearning(championName);
      updateLearningRange();
    }
  };

  const handleForgotChampion = () => {
    if (!selectedChampionId) return;
    
    const championName = getChampionNameById(selectedChampionId);
    if (championName) {
      decrementChampionLearning(championName);
      updateLearningRange();
    }
  };

  const createChampionItem = (player, team) => {
    const isMyChampion = liveGame?.myChampion && player.championId === liveGame.myChampion.id;
    const isSelected = selectedChampionId === player.championId;
    const learningCount = getChampionLearningCount(player.championName);
    const badgeColor = getLearningBadgeColor(learningCount, learningRange.min, learningRange.max);
    
    let championKey = player.championKey;
    if (isMyChampion && liveGame.myChampion.key) {
      championKey = liveGame.myChampion.key;
    }

    return (
      <div 
        key={player.championId}
        className={`champion-item ${isSelected ? 'selected' : ''} ${isMyChampion ? 'my-champion' : ''}`}
        onClick={() => selectChampion(player.championId)}
      >
        <img
          className={`champion-portrait ${team}`}
          src={getChampionIconUrl(championKey)}
          alt={player.championName}
        />
        <div 
          className="learning-badge"
          style={{
            backgroundColor: badgeColor,
            color: learningCount === 0 ? '#ffffff' : '#000000'
          }}
        >
          {learningCount}
        </div>
      </div>
    );
  };

  const renderVideoContainer = (title, video, loading) => (
    <div className="video-container">
      {loading ? (
        <div className="loading">Loading {title.toLowerCase()}...</div>
      ) : video ? (
        <ReactPlayer
          url={`https://www.youtube.com/watch?v=${video.videoId}`}
          controls={true}
          width="100%"
          height="100%"
        />
      ) : (
        <div style={{ flex: 1, backgroundColor: '#1a252f', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#95a5a6' }}>
          No video found
        </div>
      )}
    </div>
  );

  const renderAbilities = () => {
    if (loadingAbilities) {
      return <div className="loading" style={{ gridColumn: '1 / -1', height: '100px' }}>Loading abilities...</div>;
    }

    return abilities.map((ability, index) => (
      <div key={index} className="ability-card">
        <div className="ability-header">
          <img className="ability-icon" src={ability.iconUrl} alt={ability.name} />
          <span className="ability-key">{ability.key}</span>
          <span className="ability-name">{ability.name}</span>
        </div>
        <div className="ability-cooldowns">
          {Array.isArray(ability.cooldowns) ? ability.cooldowns.join(' / ') + 's' : ability.cooldowns}
        </div>
        <div className="ability-description">{ability.description}</div>
      </div>
    ));
  };

  const selectedChampionName = selectedChampionId ? getChampionNameById(selectedChampionId) : null;

  return (
    <div className="App">
      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}
      
      <div className="top-menubar">
        <div className="menu-controls">
          <select 
            className="accounts-dropdown" 
            value={selectedAccount} 
            onChange={handleAccountChange}
          >
            <option value="">Select Account...</option>
            {accounts.map(account => (
              <option key={account.name} value={account.name}>
                {account.name} (EUW1)
              </option>
            ))}
          </select>
          
          <button className="btn" onClick={handleAddAccount}>
            Add Account
          </button>
          
          <button className="btn btn-danger" onClick={handleDeleteAccount}>
            Delete Account
          </button>
          
          <button className="btn" onClick={() => fetchLiveGameData(selectedAccount)}>
            Refresh
          </button>
        </div>
        
        <div className="learning-controls">
          <button className="btn btn-success" onClick={handleLearntChampion}>
            Learnt
          </button>
          <button className="btn btn-warning" onClick={handleForgotChampion}>
            Forgot
          </button>
        </div>
      </div>

      <div className="main-content">
        <div className="menu-left">
          <div className="champion-list">
            {liveGame?.allyTeam.map(player => createChampionItem(player, 'ally'))}
          </div>
        </div>

        <div className="center">
          <div className="center-header">
            <h2>{selectedChampionName || 'Select a champion'}</h2>
          </div>

          <div className="videos-row">
            {renderVideoContainer('Guide Video', videos.guide, loadingVideos)}
            {renderVideoContainer('Matchup Video', videos.matchup, loadingVideos)}
          </div>

          <div className="abilities-section">
            <div className="abilities-container">
              {renderAbilities()}
            </div>
          </div>
        </div>

        <div className="menu-right">
          <div className="champion-list">
            {liveGame?.enemyTeam.map(player => createChampionItem(player, 'enemy'))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
