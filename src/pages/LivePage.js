import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { fetchLiveGame, fetchDataDragonVersion } from '../utils/api';
import ChampionDetails from '../components/ChampionDetails';
import AccountDropdown from '../components/AccountDropdown';
import {
  getAccounts,
  saveAccount,
  deleteAccount,
  getLastSelectedAccount,
  setLastSelectedAccount,
  getChampionLearningCount,
  incrementChampionLearning,
  decrementChampionLearning,
  getLearningBadgeColor,
} from '../utils/storage';

function Navigation() {
  const location = useLocation();

  return (
    <div className="nav-menu">
      <Link
        to="/live"
        className={`nav-link ${location.pathname === '/live' || location.pathname === '/' ? 'active' : ''}`}
      >
        Live
      </Link>
      <Link to="/learn" className={`nav-link ${location.pathname === '/learn' ? 'active' : ''}`}>
        Learn
      </Link>
      <Link to="/random" className={`nav-link ${location.pathname === '/random' ? 'active' : ''}`}>
        Random
      </Link>
      <Link to="/minigame" className={`nav-link ${location.pathname === '/minigame' ? 'active' : ''}`}>
        Minigame
      </Link>
    </div>
  );
}

function LivePage() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [liveGame, setLiveGame] = useState(null);
  const [selectedChampionId, setSelectedChampionId] = useState(null);
  const [ddVersion, setDdVersion] = useState(null);
  const [error, setError] = useState('');
  const [learningRange, setLearningRange] = useState({ min: 0, max: 0 });

  // Initialize
  // Update learning range based on current game champions only
  const updateLearningRange = useCallback(() => {
    if (!liveGame) {
      setLearningRange({ min: 0, max: 0 });
      return;
    }

    // Get learning scores for all champions in the current game
    const allPlayers = [...liveGame.allyTeam, ...liveGame.enemyTeam];
    const scores = allPlayers.map(player => getChampionLearningCount(player.championName));

    // Calculate local min/max for the current game
    const min = Math.min(...scores);
    const max = Math.max(...scores);

    setLearningRange({ min, max });
  }, [liveGame]);

  const loadAccountsFromStorage = useCallback(() => {
    const loadedAccounts = getAccounts();
    setAccounts(loadedAccounts);

    const lastSelected = getLastSelectedAccount();
    if (lastSelected && loadedAccounts.find(acc => acc.name === lastSelected)) {
      setSelectedAccount(lastSelected);
      fetchLiveGameData(lastSelected);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDataDragonVersion = useCallback(async () => {
    try {
      const version = await fetchDataDragonVersion();
      setDdVersion(version);
    } catch (error) {
      console.error('Error loading Data Dragon version:', error);
      setDdVersion('13.24.1'); // Fallback
    }
  }, []);

  useEffect(() => {
    loadAccountsFromStorage();
    loadDataDragonVersion();
  }, [loadAccountsFromStorage, loadDataDragonVersion]);

  useEffect(() => {
    updateLearningRange();
  }, [updateLearningRange, liveGame]);

  const showError = (message, duration = 5000) => {
    setError(message);
    setTimeout(() => setError(''), duration);
  };

  const fetchLiveGameData = async accountName => {
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

  const selectChampion = championId => {
    setSelectedChampionId(championId);
  };

  const getChampionNameById = championId => {
    if (!liveGame) return null;

    const allPlayers = [...liveGame.allyTeam, ...liveGame.enemyTeam];
    if (liveGame.myChampion && championId === liveGame.myChampion.id) {
      return liveGame.myChampion.name;
    }

    const player = allPlayers.find(p => p.championId === championId);
    return player ? player.championName : null;
  };

  const getChampionIconUrl = championKey => {
    if (!championKey || !ddVersion) {
      return `https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion/Aatrox.png`;
    }
    return `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${championKey}.png`;
  };

  const handleAccountChange = accountName => {
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
            color: learningCount === 0 ? '#ffffff' : '#000000',
          }}
        >
          {learningCount}
        </div>
      </div>
    );
  };

  const selectedChampionName = selectedChampionId ? getChampionNameById(selectedChampionId) : null;

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}

      <div className="top-menubar">
        <Navigation />
        <div className="menu-controls">
          <AccountDropdown
            accounts={accounts}
            selectedAccount={selectedAccount}
            onAccountChange={handleAccountChange}
            placeholder="Select Account..."
          />

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
          <ChampionDetails
            championName={selectedChampionName}
            myChampionName={liveGame?.myChampion?.name}
          />
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

export default LivePage;
