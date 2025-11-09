import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { fetchDataDragonVersion, fetchChampionData } from '../utils/api';
import ChampionDetails from '../components/ChampionDetails';
import ChampionDropdown from '../components/ChampionDropdown';
import {
  getChampionLearningCount,
  incrementChampionLearning,
  decrementChampionLearning,
  getLearningRange,
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

function LearnPage() {
  const [champions, setChampions] = useState([]);
  const [selectedMyChampion, setSelectedMyChampion] = useState('');
  const [selectedLearnChampion, setSelectedLearnChampion] = useState('');
  const [ddVersion, setDdVersion] = useState(null);
  const [learningRange, setLearningRange] = useState({ min: 0, max: 0 });
  const [gridSearchTerm, setGridSearchTerm] = useState('');

  // Initialize
  useEffect(() => {
    loadChampions();
    loadDataDragonVersion();
  }, []);

  // Update learning range when needed
  const updateLearningRange = useCallback(() => {
    setLearningRange(getLearningRange());
  }, []);

  useEffect(() => {
    updateLearningRange();
  }, [updateLearningRange, champions]);

  const loadDataDragonVersion = async () => {
    try {
      const version = await fetchDataDragonVersion();
      setDdVersion(version);
    } catch (error) {
      console.error('Error loading Data Dragon version:', error);
      setDdVersion('13.24.1'); // Fallback
    }
  };

  const loadChampions = async () => {
    try {
      const version = await fetchDataDragonVersion();
      const championsData = await fetchChampionData(version);

      // Convert to array and sort alphabetically
      const championsList = Object.entries(championsData)
        .map(([key, champion]) => ({
          id: parseInt(champion.key),
          name: champion.name,
          key: key,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setChampions(championsList);
    } catch (error) {
      console.error('Error loading champions:', error);
    }
  };

  const getChampionIconUrl = championKey => {
    if (!championKey || !ddVersion) {
      return `https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion/Aatrox.png`;
    }
    return `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${championKey}.png`;
  };

  const handleLearntChampion = () => {
    if (!selectedLearnChampion) return;

    incrementChampionLearning(selectedLearnChampion);
    updateLearningRange();
  };

  const handleForgotChampion = () => {
    if (!selectedLearnChampion) return;

    decrementChampionLearning(selectedLearnChampion);
    updateLearningRange();
  };

  const filteredChampions = champions.filter(champion =>
    champion.name.toLowerCase().includes(gridSearchTerm.toLowerCase())
  );

  const createChampionItem = champion => {
    const isSelected = selectedLearnChampion === champion.name;
    const learningCount = getChampionLearningCount(champion.name);
    const badgeColor = getLearningBadgeColor(learningCount, learningRange.min, learningRange.max);

    return (
      <div
        key={champion.id}
        className={`champion-item ${isSelected ? 'selected' : ''}`}
        onClick={() => setSelectedLearnChampion(champion.name)}
      >
        <img
          className="champion-portrait"
          src={getChampionIconUrl(champion.key)}
          alt={champion.name}
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

  return (
    <div>
      <div className="top-menubar">
        <Navigation />
        <div className="menu-controls">
          <ChampionDropdown
            selectedChampion={selectedMyChampion}
            onChampionChange={setSelectedMyChampion}
            placeholder="Select Your Champion..."
          />
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
        <div className="learn-champions-grid">
          <div className="grid-search-container">
            <input
              type="text"
              className="grid-search-input"
              placeholder="Search champions..."
              value={gridSearchTerm}
              onChange={(e) => setGridSearchTerm(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="champions-grid-content">
            {filteredChampions.map(champion => createChampionItem(champion))}
          </div>
        </div>

        <div className="learn-details">
          <ChampionDetails
            championName={selectedLearnChampion}
            myChampionName={selectedMyChampion}
          />
        </div>
      </div>
    </div>
  );
}

export default LearnPage;
