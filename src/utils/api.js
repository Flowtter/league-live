import axios from 'axios';

// Cache system with different TTLs
const cache = new Map();

const getCacheKey = (prefix, ...args) => `${prefix}_${JSON.stringify(args)}`;

const isExpired = (timestamp, ttlMs) => Date.now() - timestamp > ttlMs;

const getFromCache = (key, ttlMs) => {
  const cached = cache.get(key);
  if (!cached) return null;
  
  if (isExpired(cached.timestamp, ttlMs)) {
    cache.delete(key);
    return null;
  }
  
  return cached.data;
};

const setCache = (key, data) => {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
};

// Cache TTLs
const CACHE_TTL = {
  UGG: 60 * 1000,        // 1 minute for u.gg
  YOUTUBE: 24 * 60 * 60 * 1000,  // 24 hours for YouTube
  DATA_DRAGON: 60 * 60 * 1000    // 1 hour for Data Dragon
};

// Data Dragon API utilities
export async function fetchDataDragonVersion() {
  const cacheKey = getCacheKey('dd_version');
  const cached = getFromCache(cacheKey, CACHE_TTL.DATA_DRAGON);
  if (cached) return cached;

  try {
    const response = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
    const version = response.data[0];
    setCache(cacheKey, version);
    return version;
  } catch (error) {
    console.error('Error fetching Data Dragon version:', error);
    throw error;
  }
}

export async function fetchChampionData(version) {
  const cacheKey = getCacheKey('champion_data', version);
  const cached = getFromCache(cacheKey, CACHE_TTL.DATA_DRAGON);
  if (cached) return cached;

  try {
    const response = await axios.get(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`);
    const data = response.data.data;
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error('Error fetching champion data:', error);
    throw error;
  }
}

// u.gg GraphQL API for live game data
export async function fetchLiveGame(accountName) {
  const cacheKey = getCacheKey('live_game', accountName);
  const cached = getFromCache(cacheKey, CACHE_TTL.UGG);
  if (cached) return cached;

  const [gameName, tagLine] = accountName.split('#');
  
  const query = `
    query GetLiveGame($regionId: String!, $riotUserName: String!, $riotTagLine: String!) {
      getLiveGame(regionId: $regionId, riotUserName: $riotUserName, riotTagLine: $riotTagLine) {
        gameLengthSeconds
        gameType
        queueId
        teamA {
          championId
          riotUserName
          riotTagLine
          currentRole
        }
        teamB {
          championId
          riotUserName
          riotTagLine
          currentRole
        }
      }
    }
  `;

  const payload = {
    operationName: "GetLiveGame",
    variables: {
      riotUserName: gameName,
      riotTagLine: tagLine,
      regionId: "euw1"
    },
    query
  };

  const headers = {
    'accept': '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    'origin': 'https://u.gg',
    'referer': `https://u.gg/lol/profile/euw1/${gameName}-${tagLine.toLowerCase()}/live-game`,
    'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
    'x-app-type': 'web'
  };

  try {
    const response = await axios.post('https://cors-anywhere.com/https://u.gg/api', payload, { headers });

    if (response.data.errors) {
      throw new Error(response.data.errors[0].message);
    }

    const liveGame = response.data.data.getLiveGame;
    if (!liveGame) {
      throw new Error('Not currently in game');
    }

    // Combine teams and find current player
    const allPlayers = [...liveGame.teamA, ...liveGame.teamB];
    const currentPlayer = allPlayers.find(p => 
      p.riotUserName.toLowerCase() === gameName.toLowerCase() && 
      p.riotTagLine.toLowerCase() === tagLine.toLowerCase()
    );

    if (!currentPlayer) {
      throw new Error('Player not found in game');
    }

    // Determine which team is allies vs enemies
    const isTeamA = liveGame.teamA.includes(currentPlayer);
    const allyTeamRaw = isTeamA ? liveGame.teamA : liveGame.teamB;
    const enemyTeamRaw = isTeamA ? liveGame.teamB : liveGame.teamA;

    // Role order mapping (matching FastAPI version)
    const roleOrder = { "top": 1, "jungle": 2, "mid": 3, "adc": 4, "supp": 5 };

    // Sort teams by role (include current player in ally team like Python version)
    const sortByRole = (a, b) => (roleOrder[a.currentRole?.toLowerCase()] || 5) - (roleOrder[b.currentRole?.toLowerCase()] || 5);
    allyTeamRaw.sort(sortByRole);
    enemyTeamRaw.sort(sortByRole);

    // We need to get champion data to convert IDs to names
    const champions = await fetchChampionData(await fetchDataDragonVersion());
    
    const getChampionInfo = (championId) => {
      for (const [key, champ] of Object.entries(champions)) {
        if (parseInt(champ.key) === championId) {
          return { name: champ.name, key: key };
        }
      }
      return { name: `Champion${championId}`, key: `Champion${championId}` };
    };

    const myChampionInfo = getChampionInfo(currentPlayer.championId);

    const result = {
      myChampion: {
        id: currentPlayer.championId,
        name: myChampionInfo.name,
        key: myChampionInfo.key
      },
      allyTeam: allyTeamRaw.map(p => {
        const champInfo = getChampionInfo(p.championId);
        return {
          championId: p.championId,
          championName: champInfo.name,
          championKey: champInfo.key,
          summonerName: `${p.riotUserName}#${p.riotTagLine}`,
          role: p.currentRole
        };
      }),
      enemyTeam: enemyTeamRaw.map(p => {
        const champInfo = getChampionInfo(p.championId);
        return {
          championId: p.championId,
          championName: champInfo.name,
          championKey: champInfo.key,
          summonerName: `${p.riotUserName}#${p.riotTagLine}`,
          role: p.currentRole
        };
      })
    };
    
    setCache(cacheKey, result);
    return result;
  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error('Not currently in game');
    }
    console.error('Error fetching live game:', error);
    throw error;
  }
}

// YouTube search API using youtube-v3-api package (v1.1.1)
export async function searchYouTubeVideos(query, maxResults = 5) {
  const cacheKey = getCacheKey('youtube', query, maxResults);
  const cached = getFromCache(cacheKey, CACHE_TTL.YOUTUBE);
  if (cached) return cached;
  const trySearch = async (apiKey) => {
    const { YoutubeDataAPI } = await import('youtube-v3-api');
    const api = new YoutubeDataAPI(apiKey);
    
    const response = await api.searchAll(query, maxResults);
    
    return response.items
      .filter(item => item.id && item.id.kind === 'youtube#video')
      .map(item => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails?.default?.url,
        publishedAt: item.snippet.publishedAt,
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle
      }));
  };

  try {
    if (!process.env.REACT_APP_YOUTUBE_API_KEY && !process.env.REACT_APP_YOUTUBE_API_KEY_BACKUP) {
      console.warn('YouTube API keys not configured');
      return [];
    }

    // Try main API key first
    if (process.env.REACT_APP_YOUTUBE_API_KEY) {
      try {
        const result = await trySearch(process.env.REACT_APP_YOUTUBE_API_KEY);
        setCache(cacheKey, result);
        return result;
      } catch (error) {
        console.warn('Main YouTube API key failed, trying backup:', error.message);
      }
    }

    // Fallback to backup API key
    if (process.env.REACT_APP_YOUTUBE_API_KEY_BACKUP) {
      try {
        const result = await trySearch(process.env.REACT_APP_YOUTUBE_API_KEY_BACKUP);
        setCache(cacheKey, result);
        return result;
      } catch (error) {
        console.error('Backup YouTube API key also failed:', error.message);
      }
    }

    const emptyResult = [];
    setCache(cacheKey, emptyResult);
    return emptyResult;
  } catch (error) {
    console.error('Error searching YouTube:', error);
    return [];
  }
}

// Champion abilities from BigBrain API (with proper champion ID lookup)
export async function fetchChampionAbilities(championName) {
  const cacheKey = getCacheKey('champion_abilities', championName);
  const cached = getFromCache(cacheKey, CACHE_TTL.DATA_DRAGON);
  if (cached) return cached;

  try {
    // First, get the champion ID (key) from Data Dragon
    const version = await fetchDataDragonVersion();
    const champions = await fetchChampionData(version);
    
    // Find the champion ID (key) from the name
    let championId = null;
    for (const [champKey, champData] of Object.entries(champions)) {
      if (champData.name.toLowerCase() === championName.toLowerCase()) {
        championId = champKey;
        break;
      }
    }
    
    if (!championId) {
      throw new Error('Champion not found');
    }

    // Try BigBrain API first (cleaner descriptions)
    try {
      const response = await axios.get(`https://static.bigbrain.gg/assets/lol/riot_static/${version}/data/en_US/champion/${championId}.json`);
      const championData = response.data.data[championId];
      
      const abilities = [];
      
      // Passive
      if (championData.passive) {
        abilities.push({
          key: 'P',
          name: championData.passive.name,
          description: championData.passive.description || '',
          iconUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/passive/${championData.passive.image.full}`,
          cooldowns: ['Passive']
        });
      }

      // Q, W, E, R abilities
      const spellKeys = ['Q', 'W', 'E', 'R'];
      championData.spells.forEach((spell, index) => {
        abilities.push({
          key: spellKeys[index],
          name: spell.name,
          description: spell.description, // Keep HTML from BigBrain
          iconUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${spell.image.full}`,
          cooldowns: spell.cooldown
        });
      });

      setCache(cacheKey, abilities);
      return abilities;
    } catch (bigBrainError) {
      // Fallback to Data Dragon
      const fallbackAbilities = await fetchAbilitiesFromDataDragon(championId, version);
      setCache(cacheKey, fallbackAbilities);
      return fallbackAbilities;
    }
  } catch (error) {
    console.error('Error fetching champion abilities:', error);
    throw error;
  }
}

// Fallback to Data Dragon for abilities
async function fetchAbilitiesFromDataDragon(championId, version) {
  try {
    const response = await axios.get(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion/${championId}.json`);
    const champion = response.data.data[championId];
    
    if (!champion) {
      throw new Error('Champion not found');
    }

    const abilities = [];
    
    // Passive
    if (champion.passive) {
      abilities.push({
        key: 'P',
        name: champion.passive.name,
        description: champion.passive.description.replace(/\{\{[^}]*\}\}/g, '[VALUE]'), // Keep HTML, remove mustache
        iconUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/passive/${champion.passive.image.full}`,
        cooldowns: ['Passive']
      });
    }

    // Q, W, E, R abilities
    const spellKeys = ['Q', 'W', 'E', 'R'];
    champion.spells.forEach((spell, index) => {
      abilities.push({
        key: spellKeys[index],
        name: spell.name,
        description: spell.tooltip.replace(/\{\{[^}]*\}\}/g, '[VALUE]'), // Keep HTML, remove mustache
        iconUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${spell.image.full}`,
        cooldowns: spell.cooldownBurn ? spell.cooldownBurn.split('/') : ['?', '?', '?', '?', '?']
      });
    });

    return abilities;
  } catch (error) {
    console.error('Error fetching abilities from Data Dragon:', error);
    throw error;
  }
}
