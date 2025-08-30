import axios from 'axios';

// Data Dragon API utilities
export async function fetchDataDragonVersion() {
  try {
    const response = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
    return response.data[0];
  } catch (error) {
    console.error('Error fetching Data Dragon version:', error);
    throw error;
  }
}

export async function fetchChampionData(version) {
  try {
    const response = await axios.get(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`);
    return response.data.data;
  } catch (error) {
    console.error('Error fetching champion data:', error);
    throw error;
  }
}

// u.gg GraphQL API for live game data
export async function fetchLiveGame(accountName) {
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
    const response = await axios.post('https://u.gg/api', payload, { headers });

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

    return {
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
  try {
    if (!process.env.REACT_APP_YOUTUBE_API_KEY) {
      console.warn('YouTube API key not configured');
      return [];
    }

    const { YoutubeDataAPI } = await import('youtube-v3-api');
    const api = new YoutubeDataAPI(process.env.REACT_APP_YOUTUBE_API_KEY);
    
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
  } catch (error) {
    console.error('Error searching YouTube:', error);
    return [];
  }
}

// Champion abilities from BigBrain API
export async function fetchChampionAbilities(championName) {
  try {
    const response = await axios.get(`https://api.bigbrain.gg/api/champions/${championName.toLowerCase()}`);
    const champion = response.data;
    
    if (!champion || !champion.abilities) {
      throw new Error('Champion abilities not found');
    }

    const abilities = [];
    
    // Passive
    if (champion.abilities.passive) {
      abilities.push({
        key: 'P',
        name: champion.abilities.passive.name || 'Passive',
        description: champion.abilities.passive.description || '',
        iconUrl: `https://ddragon.leagueoflegends.com/cdn/13.24.1/img/passive/${champion.abilities.passive.image || 'default.png'}`,
        cooldowns: ['Passive']
      });
    }

    // Q, W, E, R abilities
    ['q', 'w', 'e', 'r'].forEach((key) => {
      const ability = champion.abilities[key];
      if (ability) {
        abilities.push({
          key: key.toUpperCase(),
          name: ability.name || `${key.toUpperCase()} Ability`,
          description: ability.description || '',
          iconUrl: `https://ddragon.leagueoflegends.com/cdn/13.24.1/img/spell/${ability.image || 'default.png'}`,
          cooldowns: ability.cooldown || ['?', '?', '?', '?', '?']
        });
      }
    });

    return abilities;
  } catch (error) {
    console.error('Error fetching champion abilities:', error);
    // Fallback to Data Dragon
    return await fetchAbilitiesFromDataDragon(championName);
  }
}

// Fallback to Data Dragon for abilities
async function fetchAbilitiesFromDataDragon(championName) {
  try {
    const version = await fetchDataDragonVersion();
    const response = await axios.get(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion/${championName}.json`);
    const champion = response.data.data[championName];
    
    if (!champion) {
      throw new Error('Champion not found');
    }

    const abilities = [];
    
    // Passive
    if (champion.passive) {
      abilities.push({
        key: 'P',
        name: champion.passive.name,
        description: champion.passive.description.replace(/<[^>]*>/g, '').replace(/\\{\\{[^}]*\\}\\}/g, '[VALUE]'),
        iconUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/passive/${champion.passive.image.full}`,
        cooldowns: ['Passive']
      });
    }

    // Q, W, E, R abilities
    champion.spells.forEach((spell, index) => {
      const keys = ['Q', 'W', 'E', 'R'];
      abilities.push({
        key: keys[index],
        name: spell.name,
        description: spell.description.replace(/<[^>]*>/g, '').replace(/\\{\\{[^}]*\\}\\}/g, '[VALUE]'),
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