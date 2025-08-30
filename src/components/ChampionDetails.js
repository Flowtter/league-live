import React, { useState, useEffect, useCallback } from 'react';
import ReactPlayer from 'react-player/youtube';
import { fetchChampionAbilities, searchYouTubeVideos } from '../utils/api';

function ChampionDetails({ championName, myChampionName }) {
  const [abilities, setAbilities] = useState([]);
  const [videos, setVideos] = useState({ guide: null, matchup: null });
  const [loadingAbilities, setLoadingAbilities] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);

  const fetchAbilities = useCallback(async () => {
    setLoadingAbilities(true);
    try {
      const championAbilities = await fetchChampionAbilities(championName);
      setAbilities(championAbilities);
    } catch (error) {
      console.error('Error fetching abilities:', error);
      setAbilities([]);
    } finally {
      setLoadingAbilities(false);
    }
  }, [championName]);

  const fetchVideos = useCallback(async () => {
    setLoadingVideos(true);
    try {
      // Guide video search
      const guideQuery = `${championName} guide abilities League of Legends`;
      const guideResults = await searchYouTubeVideos(guideQuery, 3);

      // Matchup video search (if we have a myChampion)
      let matchupResults = [];
      if (myChampionName) {
        const matchupQuery = `${myChampionName} vs ${championName} matchup League of Legends`;
        matchupResults = await searchYouTubeVideos(matchupQuery, 3);
      }

      setVideos({
        guide: guideResults.length > 0 ? guideResults[0] : null,
        matchup: matchupResults.length > 0 ? matchupResults[0] : null,
      });
    } catch (error) {
      console.error('Error fetching videos:', error);
      setVideos({ guide: null, matchup: null });
    } finally {
      setLoadingVideos(false);
    }
  }, [championName, myChampionName]);

  useEffect(() => {
    if (championName) {
      fetchAbilities();
      fetchVideos();
    }
  }, [championName, fetchAbilities, fetchVideos]);

  const renderVideoContainer = (title, video, loading) => (
    // do not display the title anymore
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
        <div
          style={{
            flex: 1,
            backgroundColor: '#1a252f',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#95a5a6',
          }}
        >
          No video found
        </div>
      )}
    </div>
  );

  const renderAbilities = () => {
    if (loadingAbilities) {
      return (
        <div className="loading" style={{ gridColumn: '1 / -1', height: '100px' }}>
          Loading abilities...
        </div>
      );
    }

    return abilities.map((ability, index) => (
      <div key={index} className="ability-card">
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
    ));
  };

  if (!championName) {
    return (
      <div className="champion-details">
        <div className="center-header">
          <h2>Select a champion</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="champion-details">
      <div className="center-header">
        <h2>{championName}</h2>
      </div>

      <div className="videos-row">
        {renderVideoContainer('Guide Video', videos.guide, loadingVideos)}
        {myChampionName && renderVideoContainer('Matchup Video', videos.matchup, loadingVideos)}
      </div>

      <div className="abilities-section">
        <br />
        <div className="abilities-container">{renderAbilities()}</div>
      </div>
    </div>
  );
}

export default ChampionDetails;
