import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { fetchDataDragonVersion, fetchChampionData, fetchChampionAbilities, fetchSkillOrder } from '../utils/api';
import ChampionDropdown from '../components/ChampionDropdown';

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

// Levenshtein distance function
function levenshteinDistance(str1, str2) {
  const matrix = [];
  const len1 = str1.length;
  const len2 = str2.length;

  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[len2][len1];
}

// Streak color function - red (0) to green (5+)
function getStreakColor(streak) {
  if (streak === 0) return '#e74c3c'; // Red
  if (streak >= 5) return '#27ae60';  // Green

  // Interpolate between red and green for streaks 1-4
  const ratio = streak / 5;
  const red = Math.round(231 * (1 - ratio) + 39 * ratio);   // 231 -> 39
  const green = Math.round(76 * (1 - ratio) + 174 * ratio); // 76 -> 174
  const blue = Math.round(60 * (1 - ratio) + 96 * ratio);   // 60 -> 96

  return `rgb(${red}, ${green}, ${blue})`;
}

function MinigamePage() {
  const [champions, setChampions] = useState([]);
  const [currentChallenge, setCurrentChallenge] = useState(null);
  const [userGuess, setUserGuess] = useState('');
  const [gameState, setGameState] = useState('playing'); // 'playing', 'revealed'
  const [streak, setStreak] = useState(() => {
    const savedStreak = localStorage.getItem('minigame_streak');
    return savedStreak ? parseInt(savedStreak, 10) : 0;
  });
  const [allAbilities, setAllAbilities] = useState([]);
  const [skillOrder, setSkillOrder] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cooldownActive, setCooldownActive] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [championScores, setChampionScores] = useState(() => {
    const saved = localStorage.getItem('minigame_champion_scores');
    return saved ? JSON.parse(saved) : {};
  });
  const [ddVersion, setDdVersion] = useState(null);
  const [gridSearchTerm, setGridSearchTerm] = useState('');
  const [cooldownDisabled, setCooldownDisabled] = useState(() => {
    const saved = localStorage.getItem('minigame_cooldown_disabled');
    return saved ? JSON.parse(saved) : false;
  });
  const [hardcoreMode, setHardcoreMode] = useState(() => {
    const saved = localStorage.getItem('minigame_hardcore_mode');
    return saved ? JSON.parse(saved) : false;
  });
  const [cooldownGuess, setCooldownGuess] = useState('');

  useEffect(() => {
    loadChampions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save streak to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('minigame_streak', streak.toString());
  }, [streak]);

  // Save champion scores to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('minigame_champion_scores', JSON.stringify(championScores));
  }, [championScores]);

  // Save cooldown disabled setting to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('minigame_cooldown_disabled', JSON.stringify(cooldownDisabled));
  }, [cooldownDisabled]);

  // Save hardcore mode setting to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('minigame_hardcore_mode', JSON.stringify(hardcoreMode));
  }, [hardcoreMode]);

  const loadChampions = async () => {
    try {
      const version = await fetchDataDragonVersion();
      const championsData = await fetchChampionData(version);

      const championsList = Object.entries(championsData)
        .map(([key, champion]) => ({
          id: parseInt(champion.key),
          name: champion.name,
          key: key,
          tags: champion.tags || [],
          primaryRole: champion.tags ? champion.tags[0] : 'Unknown'
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setChampions(championsList);
      setDdVersion(version);

      // Start first challenge
      if (championsList.length > 0) {
        generateNewChallenge(championsList);
      }
    } catch (error) {
      console.error('Error loading champions:', error);
    }
  };

  const anonymizeText = (text, abilityKey, championName) => {
    // Replace only the current challenge champion's name with bold *****
    const regex = new RegExp(championName, 'gi');
    const anonymized = text.replace(regex, '<strong>*****</strong>');

    // Add ability type prefix
    const abilityType = abilityKey === 'P' ? 'Passive' :
                       abilityKey === 'Q' ? 'Q Ability' :
                       abilityKey === 'W' ? 'W Ability' :
                       abilityKey === 'E' ? 'E Ability' :
                       abilityKey === 'R' ? 'Ultimate' : 'Ability';

    return `${abilityType}: ${anonymized}`;
  };

  const generateNewChallenge = async (championsList) => {
    setLoading(true);
    try {
      const randomChampion = championsList[Math.floor(Math.random() * championsList.length)];
      const [abilities, skillOrderData] = await Promise.all([
        fetchChampionAbilities(randomChampion.name),
        fetchSkillOrder(randomChampion.name)
      ]);

      if (abilities.length > 0) {
        const randomAbility = abilities[Math.floor(Math.random() * abilities.length)];

        // Clear input states FIRST before setting new challenge
        setUserGuess('');
        setCooldownGuess('');

        setCurrentChallenge({
          champion: randomChampion,
          ability: randomAbility,
          anonymizedDescription: anonymizeText(randomAbility.description, randomAbility.key, randomChampion.name)
        });
        setAllAbilities(abilities);
        setSkillOrder(skillOrderData);
        setGameState('playing');
      }
    } catch (error) {
      console.error('Error generating challenge:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitGuess = (championNameOrEvent = null) => {
    if (!currentChallenge) return;

    // Determine if we got a champion name (from Enter key) or an event (from button click)
    let guessToCheck;
    if (championNameOrEvent && typeof championNameOrEvent === 'string') {
      // Called from Enter key with champion name
      guessToCheck = championNameOrEvent.trim();
    } else {
      // Called from button click (event object) or no parameter
      guessToCheck = userGuess ? userGuess.trim() : '';
    }

    if (!guessToCheck) return;

    const guess = guessToCheck.toLowerCase();
    const correct = currentChallenge.champion.name.toLowerCase();
    const distance = levenshteinDistance(guess, correct);
    let isCorrect = guess === correct || distance <= 2;

    // In hardcore mode, also validate cooldown guess
    if (hardcoreMode && isCorrect) {
      const cooldownCorrect = validateCooldownGuess(cooldownGuess, currentChallenge.ability.cooldowns);
      isCorrect = isCorrect && cooldownCorrect;
    }

    if (isCorrect) {
      setStreak(prev => prev + 1);
      // +2 points for correct answer
      updateChampionScore(currentChallenge.champion.name, 2);
    } else {
      setStreak(0);
      // Start cooldown for wrong answers
      if (!cooldownDisabled) {
        startCooldown();
      }

      // -1 for the champion that was guessed (if it's a valid champion)
      const guessedChampion = champions.find(c =>
        c.name.toLowerCase() === guess
      );
      if (guessedChampion) {
        updateChampionScore(guessedChampion.name, -1);
      }

      // -1 for the correct champion
      updateChampionScore(currentChallenge.champion.name, -1);
    }

    setCurrentChallenge(prev => ({
      ...prev,
      isCorrect
    }));

    setGameState('revealed');
  };

  const handleDontKnow = () => {
    if (!currentChallenge) return;

    setStreak(0);
    // Start cooldown for skipped answers
    if (!cooldownDisabled) {
      startCooldown();
    }

    // -1 for the correct champion when skipping
    updateChampionScore(currentChallenge.champion.name, -1);

    setCurrentChallenge(prev => ({
      ...prev,
      isCorrect: false,
      wasSkipped: true
    }));

    setGameState('revealed');
  };

  const updateChampionScore = (championName, points) => {
    setChampionScores(prev => ({
      ...prev,
      [championName]: (prev[championName] || 0) + points
    }));
  };

  const startCooldown = () => {
    setCooldownActive(true);
    setCooldownSeconds(10);

    const interval = setInterval(() => {
      setCooldownSeconds(prev => {
        if (prev <= 1) {
          setCooldownActive(false);
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const getChampionIconUrl = (championKey) => {
    if (!championKey || !ddVersion) {
      return `https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion/Aatrox.png`;
    }
    return `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${championKey}.png`;
  };

  const getMasteryLevel = (score) => {
    if (score < -2) return { level: 'Iron', tier: 1, color: '#5A4A42', threshold: -2 };
    if (score < 0) return { level: 'Bronze', tier: 2, color: '#8B4513', threshold: 0 };
    if (score < 1) return { level: 'Silver', tier: 3, color: '#8A8A8A', threshold: 1 };
    if (score < 2) return { level: 'Gold', tier: 4, color: '#FFD700', threshold: 2 };
    if (score < 3) return { level: 'Platinum', tier: 5, color: '#0F7B7C', threshold: 3 };
    if (score < 4) return { level: 'Emerald', tier: 6, color: '#00A86B', threshold: 4 };
    if (score < 5) return { level: 'Diamond', tier: 7, color: '#3E90D9', threshold: 5 };
    if (score < 7) return { level: 'Master', tier: 8, color: '#9932CC', threshold: 7 };
    if (score < 10) return { level: 'Grandmaster', tier: 9, color: '#DC143C', threshold: 10 };
    return { level: 'Challenger', tier: 10, color: '#F4A460', threshold: 15 };
  };


  const validateCooldownGuess = (guess, actualCooldowns) => {
    if (!guess || !actualCooldowns) return false;

    const guessNum = parseFloat(guess);
    if (isNaN(guessNum)) return false;

    // Get level 1 cooldown (first value in array or the single value)
    let level1Cooldown;
    if (Array.isArray(actualCooldowns)) {
      level1Cooldown = actualCooldowns[0];
    } else {
      // Parse single value or range like "12 / 11 / 10 / 9 / 8"
      const cooldownStr = actualCooldowns.toString();
      const firstValue = cooldownStr.split('/')[0].trim();
      level1Cooldown = parseFloat(firstValue);
    }

    if (isNaN(level1Cooldown)) return false;

    // Allow ±1 second tolerance
    return Math.abs(guessNum - level1Cooldown) <= 1;
  };

  const getCollectionProgress = () => {
    const roleProgress = {};
    const roleMap = {
      'Fighter': 'Fighter',
      'Tank': 'Tank',
      'Assassin': 'Assassin',
      'Mage': 'Mage',
      'Marksman': 'Marksman',
      'Support': 'Support'
    };

    // Initialize progress for each role
    Object.values(roleMap).forEach(role => {
      roleProgress[role] = { total: 0, mastered: 0, totalScore: 0 };
    });

    champions.forEach(champion => {
      const role = roleMap[champion.primaryRole] || 'Other';
      if (roleProgress[role]) {
        roleProgress[role].total += 1;
        const score = championScores[champion.name] || 0;
        roleProgress[role].totalScore += score;

        // Consider "mastered" if Emerald level or higher (4+ points)
        if (score >= 4) {
          roleProgress[role].mastered += 1;
        }
      }
    });

    return roleProgress;
  };

  const filteredChampions = champions.filter(champion =>
    champion.name.toLowerCase().includes(gridSearchTerm.toLowerCase())
  );

  const createChampionItem = champion => {
    const score = championScores[champion.name] || 0;
    const mastery = getMasteryLevel(score);

    return (
      <div
        key={champion.id}
        className="champion-item"
        title={`${champion.name} - ${mastery.level} (${score} points)`}
      >
        <img
          className="champion-portrait"
          src={getChampionIconUrl(champion.key)}
          alt={champion.name}
          style={{
            border: `3px solid ${mastery.color}`,
            borderRadius: '8px'
          }}
        />
        <div
          className={`mastery-badge ${mastery.tier >= 7 ? 'high-tier' : ''}`}
          style={{
            backgroundColor: mastery.color,
            color: mastery.tier <= 2 ? '#ffffff' : '#000000',
          }}
        >
          {mastery.level === 'Grandmaster' ? 'GM' : mastery.level === 'Challenger' ? 'CH' : mastery.level.charAt(0)}
        </div>
        <div className="score-display">
          {score}
        </div>
      </div>
    );
  };

  const handleNewChallenge = () => {
    if (champions.length > 0) {
      generateNewChallenge(champions);
    }
  };

  // Clean Enter key handling
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        const championInput = document.querySelector('.champion-dropdown-container input');
        const cooldownInput = document.querySelector('.cooldown-input');
        const activeElement = document.activeElement;

        // If typing for a champ and not hardcore mode, validate the option
        if (activeElement === championInput && !hardcoreMode && gameState === 'playing') {
          // Don't interfere - let ChampionDropdown handle selection, then submit
          setTimeout(() => {
            handleSubmitGuess();
          }, 10);
          return;
        }

        // If typing for a champ in hardcore mode, switch to cooldown
        if (activeElement === championInput && hardcoreMode && gameState === 'playing') {
          // Don't prevent default - let ChampionDropdown handle the selection first
          // Then move to cooldown input after selection is complete
          setTimeout(() => {
            if (cooldownInput) {
              cooldownInput.focus();
            }
          }, 10);
          return;
        }

        // If in cooldown input, submit the guess
        if (activeElement === cooldownInput && gameState === 'playing') {
          e.preventDefault();
          handleSubmitGuess();
          return;
        }

        // If in revealed state, start new challenge
        if (gameState === 'revealed' && !cooldownActive) {
          e.preventDefault();
          handleNewChallenge();
          return;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [hardcoreMode, gameState, cooldownActive]); // eslint-disable-line react-hooks/exhaustive-deps


  const renderSkillOrder = () => {
    if (skillOrder.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <div style={{ color: '#95a5a6', fontStyle: 'italic', marginBottom: '10px' }}>
            No skill order found
          </div>
        </div>
      );
    }

    // Create 18x4 grid (18 levels, 4 abilities)
    const levels = Array.from({ length: 18 }, (_, i) => i + 1);
    const skills = ['Q', 'W', 'E', 'R'];

    return (
      <div className="skill-order-grid">
        {/* Header row with levels */}
        <div className="skill-level-header">
          <div className="skill-label" style={{ visibility: 'hidden' }}></div>
          {levels.map(level => (
            <div key={level} className="level-number">
              {level}
            </div>
          ))}
        </div>

        {/* Skill rows */}
        {skills.map(skill => (
          <div key={skill} className="skill-row">
            <div className="skill-label">{skill}</div>
            {levels.map(level => {
              const isLeveled = skillOrder[level - 1] === skill;
              return (
                <div
                  key={`${skill}-${level}`}
                  className={`skill-cell ${isLeveled ? 'active' : ''}`}
                >
                  {isLeveled ? skill : ''}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div>
        <div className="top-menubar">
          <Navigation />
          <div className="menu-controls">
          </div>

          <div className="streak-display">
            <div className="cooldown-toggle">
              <span>Hardcore:</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={hardcoreMode}
                  onChange={(e) => setHardcoreMode(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>
            <div className="cooldown-toggle">
              <span>No Cooldown:</span>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={cooldownDisabled}
                  onChange={(e) => setCooldownDisabled(e.target.checked)}
                />
                <span className="slider"></span>
              </label>
            </div>
            <span>Streak: </span>
            <span
              className="streak-counter"
              style={{ backgroundColor: getStreakColor(streak) }}
            >
              {streak}
            </span>
          </div>
        </div>

        <div className="main-content">
          <div className="learn-champions-grid">
            <div className="collection-progress">
              <h4>Collection Progress</h4>
              <div className="role-progress-container">
                {Object.entries(getCollectionProgress()).map(([role, progress]) => (
                  <div key={role} className="role-progress">
                    <div className="role-header">
                      <span className="role-name">{role}</span>
                      <span className="role-stats">{progress.mastered}/{progress.total}</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${progress.total > 0 ? (progress.mastered / progress.total) * 100 : 0}%`,
                          backgroundColor: progress.mastered === progress.total && progress.total > 0 ? '#27ae60' : '#3498db'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

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
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '400px'
            }}>
              <div className="loading">Loading new challenge...</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="top-menubar">
        <Navigation />
        <div className="menu-controls">
        </div>

        <div className="streak-display">
          <div className="cooldown-toggle">
            <span>Hardcore:</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={hardcoreMode}
                onChange={(e) => setHardcoreMode(e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>
          <div className="cooldown-toggle">
            <span>No Cooldown:</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={cooldownDisabled}
                onChange={(e) => setCooldownDisabled(e.target.checked)}
              />
              <span className="slider"></span>
            </label>
          </div>
          <span>Streak: </span>
          <span
            className="streak-counter"
            style={{ backgroundColor: getStreakColor(streak) }}
          >
            {streak}
          </span>
        </div>
      </div>

      <div className="main-content">
        <div className="learn-champions-grid">
          <div className="collection-progress">
            <h4>Collection Progress</h4>
            <div className="role-progress-container">
              {Object.entries(getCollectionProgress()).map(([role, progress]) => (
                <div key={role} className="role-progress">
                  <div className="role-header">
                    <span className="role-name">{role}</span>
                    <span className="role-stats">{progress.mastered}/{progress.total}</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${progress.total > 0 ? (progress.mastered / progress.total) * 100 : 0}%`,
                        backgroundColor: progress.mastered === progress.total && progress.total > 0 ? '#27ae60' : '#3498db'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

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
          {currentChallenge && (
            <div className="challenge-container">
              <div className="ability-challenge">

                <div className="ability-description-box">
                  <div
                    className="ability-description"
                    dangerouslySetInnerHTML={{
                      __html: currentChallenge.anonymizedDescription
                    }}
                  />
                </div>

                {gameState === 'playing' && (
                  <div className="guess-section">
                    <ChampionDropdown
                      key={currentChallenge ? `${currentChallenge.champion.name}-${currentChallenge.ability.key}` : 'loading'}
                      selectedChampion={userGuess}
                      onChampionChange={setUserGuess}
                      placeholder="Enter champion name..."
                      onEnterPress={hardcoreMode ? (championName) => {
                        // In hardcore mode, Enter just selects the champion
                        // The champion is already selected by handleChampionSelect
                        // No action needed here, just let the selection happen
                      } : handleSubmitGuess}
                      onTabPress={hardcoreMode ? (championName) => {
                        // In hardcore mode, Tab moves to cooldown input
                        if (championName && championName.trim()) {
                          setTimeout(() => {
                            const cooldownInput = document.querySelector('.cooldown-input');
                            if (cooldownInput) {
                              cooldownInput.focus();
                            }
                          }, 10);
                        }
                      } : null}
                      autoFocus={true}
                    />
                    {hardcoreMode && (
                      <div className="hardcore-input">
                        <input
                          type="number"
                          className="cooldown-input"
                          placeholder="Cooldown (sec)"
                          value={cooldownGuess}
                          onChange={(e) => setCooldownGuess(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSubmitGuess();
                            }
                          }}
                          step="0.1"
                          min="0"
                          max="300"
                          autoFocus={false}
                        />
                      </div>
                    )}
                    <div className="guess-buttons">
                      <button
                        className="btn btn-success"
                        onClick={handleSubmitGuess}
                        disabled={!userGuess.trim() || (hardcoreMode && !cooldownGuess.trim())}
                      >
                        Submit
                      </button>
                      <button
                        className="btn btn-warning"
                        onClick={handleDontKnow}
                      >
                        I don't know
                      </button>
                    </div>
                  </div>
                )}

                {gameState === 'revealed' && (
                  <div className="reveal-section">
                    <div className={`answer-result ${currentChallenge.isCorrect ? 'correct' : 'incorrect'}`}>
                      <h4>
                        {currentChallenge.isCorrect ? '✓' : currentChallenge.wasSkipped ? '⚬' : '✗'}
                        Answer: {currentChallenge.champion.name}
                      </h4>
                      <p>Ability: {currentChallenge.ability.name} ({currentChallenge.ability.key})</p>
                    </div>

                    <div className="abilities-section">
                      <div className="abilities-container">
                        {/* Skill order as first card */}
                        <div className="ability-card" key="skill-order">
                          {renderSkillOrder()}
                        </div>

                        {/* Ability cards */}
                        {allAbilities.map((ability, index) => {
                          const isChallengeAbility = ability.key === currentChallenge.ability.key;
                          return (
                            <div key={`ability-${index}`} className={`ability-card ${isChallengeAbility ? 'challenge-ability' : ''}`}>
                              <div className="ability-header">
                                <img className="ability-icon" src={ability.iconUrl} alt={ability.name} />
                                <span className="ability-key">{ability.key}</span>
                                <span className="ability-name">{ability.name}</span>
                              </div>
                              <div className="ability-cooldowns">
                                {Array.isArray(ability.cooldowns)
                                  ? ability.cooldowns.join(' / ') + 's'
                                  : ability.cooldowns}
                              </div>
                              <div
                                className="ability-description"
                                dangerouslySetInnerHTML={{ __html: ability.description }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      className="btn btn-success"
                      onClick={handleNewChallenge}
                      disabled={cooldownActive}
                      style={{ marginTop: '20px' }}
                    >
                      {cooldownActive ? `Next Challenge (${cooldownSeconds}s)` : 'Next Challenge'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MinigamePage;
