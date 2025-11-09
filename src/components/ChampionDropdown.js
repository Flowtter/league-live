import React, { useState, useEffect, useRef } from 'react';
import { fetchDataDragonVersion, fetchChampionData } from '../utils/api';

function ChampionDropdown({
  selectedChampion,
  onChampionChange,
  placeholder = 'Select Champion...',
  onEnterPress,
  onTabPress,
  autoFocus = false,
}) {
  const [champions, setChampions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [ddVersion, setDdVersion] = useState(null);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    loadChampions();
  }, []);

  useEffect(() => {
    // Auto-focus the input when component mounts if autoFocus is enabled
    if (autoFocus && inputRef.current && !loading) {
      inputRef.current.focus();
      setIsOpen(true);
    }
  }, [loading, autoFocus]);

  useEffect(() => {
    setSearchTerm(selectedChampion || '');
  }, [selectedChampion]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadChampions = async () => {
    try {
      const version = await fetchDataDragonVersion();
      const championsData = await fetchChampionData(version);

      const championsList = Object.entries(championsData)
        .map(([key, champion]) => ({
          ...champion,
          key: key
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setChampions(championsList);
      setDdVersion(version);
    } catch (error) {
      console.error('Error loading champions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getChampionIconUrl = (championKey) => {
    if (!championKey || !ddVersion) {
      return `https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion/Aatrox.png`;
    }
    return `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${championKey}.png`;
  };

  const filteredChampions = champions.filter(champion =>
    champion.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setIsOpen(true);

    if (value === '') {
      onChampionChange('');
      setHighlightedIndex(-1);
    } else {
      // Auto-highlight first filtered result when searching
      setHighlightedIndex(0);
    }
  };

  const handleChampionSelect = (championName) => {
    setSearchTerm(championName);
    onChampionChange(championName);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
    // If no search term, highlight first champion
    if (!searchTerm && filteredChampions.length > 0) {
      setHighlightedIndex(0);
    }
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        setIsOpen(true);
        return;
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        prev < filteredChampions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        prev > 0 ? prev - 1 : filteredChampions.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredChampions.length) {
        const selectedChampionName = filteredChampions[highlightedIndex].name;
        handleChampionSelect(selectedChampionName);
        // Call onEnterPress callback after selection with the champion name
        if (onEnterPress) {
          setTimeout(() => onEnterPress(selectedChampionName), 0);
        }
      }
    } else if (e.key === 'Tab') {
      // Handle Tab key - close dropdown and call onTabPress if available
      if (onTabPress) {
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);

        // If there's a highlighted champion, select it first
        if (highlightedIndex >= 0 && highlightedIndex < filteredChampions.length) {
          const selectedChampionName = filteredChampions[highlightedIndex].name;
          handleChampionSelect(selectedChampionName);
          setTimeout(() => onTabPress(selectedChampionName), 0);
        } else {
          // No selection, just call onTabPress with current search term
          setTimeout(() => onTabPress(searchTerm), 0);
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
      inputRef.current?.blur();
    }
  };

  if (loading) {
    return (
      <input
        className="accounts-dropdown"
        disabled
        placeholder="Loading champions..."
      />
    );
  }

  return (
    <div className="champion-dropdown-container" ref={dropdownRef}>
      <input
        ref={inputRef}
        type="text"
        className="accounts-dropdown"
        value={searchTerm}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />

      {isOpen && (
        <div className="champion-dropdown-list">
          {filteredChampions.length > 0 ? (
            filteredChampions.map((champion, index) => (
              <div
                key={champion.key}
                className={`champion-dropdown-item ${
                  index === highlightedIndex ? 'highlighted' : ''
                }`}
                onClick={() => handleChampionSelect(champion.name)}
              >
                <img
                  className="champion-dropdown-icon"
                  src={getChampionIconUrl(champion.key)}
                  alt={champion.name}
                />
                <span className="champion-dropdown-name">{champion.name}</span>
              </div>
            ))
          ) : (
            <div className="champion-dropdown-item no-results">
              No champions found
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ChampionDropdown;
