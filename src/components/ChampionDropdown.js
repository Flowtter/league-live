import React, { useState, useEffect } from 'react';
import { fetchDataDragonVersion, fetchChampionData } from '../utils/api';

function ChampionDropdown({
  selectedChampion,
  onChampionChange,
  placeholder = 'Select Champion...',
}) {
  const [champions, setChampions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChampions();
  }, []);

  const loadChampions = async () => {
    try {
      const version = await fetchDataDragonVersion();
      const championsData = await fetchChampionData(version);

      // Convert to array and sort alphabetically
      const championsList = Object.values(championsData).sort((a, b) =>
        a.name.localeCompare(b.name)
      );

      setChampions(championsList);
    } catch (error) {
      console.error('Error loading champions:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <select className="accounts-dropdown" disabled>
        <option>Loading champions...</option>
      </select>
    );
  }

  return (
    <select
      className="accounts-dropdown"
      value={selectedChampion || ''}
      onChange={e => onChampionChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {champions.map(champion => (
        <option key={champion.key} value={champion.name}>
          {champion.name}
        </option>
      ))}
    </select>
  );
}

export default ChampionDropdown;
