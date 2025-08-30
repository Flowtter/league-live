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
    </div>
  );
}

function RandomPage() {
  const [champions, setChampions] = useState([]);
  const [selectedMyChampion, setSelectedMyChampion] = useState('');
  const [randomChampion, setRandomChampion] = useState('');
  const [learningRange, setLearningRange] = useState({ min: 0, max: 0 });

  // Update learning range when needed
  const updateLearningRange = useCallback(() => {
    setLearningRange(getLearningRange());
  }, []);

  const loadChampions = useCallback(async () => {
    try {
      const version = await fetchDataDragonVersion();
      const championsData = await fetchChampionData(version);

      // Convert to array
      const championsList = Object.values(championsData).map(champion => champion.name);
      setChampions(championsList);

      // Set random champion on load
      if (championsList.length > 0) {
        const randomIndex = Math.floor(Math.random() * championsList.length);
        setRandomChampion(championsList[randomIndex]);
      }
    } catch (error) {
      console.error('Error loading champions:', error);
    }
  }, []);

  // Initialize
  useEffect(() => {
    loadChampions();
    updateLearningRange();
  }, [loadChampions, updateLearningRange]);

  const getRandomChampion = () => {
    if (champions.length === 0) return;

    const randomIndex = Math.floor(Math.random() * champions.length);
    setRandomChampion(champions[randomIndex]);
  };

  const handleLearntChampion = () => {
    if (!randomChampion) return;

    incrementChampionLearning(randomChampion);
    updateLearningRange();
  };

  const handleForgotChampion = () => {
    if (!randomChampion) return;

    decrementChampionLearning(randomChampion);
    updateLearningRange();
  };

  const getChampionScore = () => {
    if (!randomChampion) return 0;
    return getChampionLearningCount(randomChampion);
  };

  const getChampionBadgeColor = () => {
    const score = getChampionScore();
    return getLearningBadgeColor(score, learningRange.min, learningRange.max);
  };

  const championScore = getChampionScore();
  const badgeColor = getChampionBadgeColor();

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

          <button className="btn" onClick={getRandomChampion}>
            Random Champion
          </button>

          {randomChampion && (
            <div className="champion-score-display">
              <span>Score: </span>
              <span
                className="score-badge"
                style={{
                  backgroundColor: badgeColor,
                  color: championScore === 0 ? '#ffffff' : '#000000',
                }}
              >
                {championScore}
              </span>
            </div>
          )}
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

      <div className="main-content" style={{ padding: '20px' }}>
        <ChampionDetails championName={randomChampion} myChampionName={selectedMyChampion} />
      </div>
    </div>
  );
}

export default RandomPage;
