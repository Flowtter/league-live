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
    timestamp: Date.now(),
  });
};

// Cache TTLs
const CACHE_TTL = {
  UGG: 60 * 1000, // 1 minute for u.gg
  YOUTUBE: 24 * 60 * 60 * 1000, // 24 hours for YouTube
  DATA_DRAGON: 60 * 60 * 1000, // 1 hour for Data Dragon
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
    const response = await axios.get(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`
    );
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
    operationName: 'GetLiveGame',
    variables: {
      riotUserName: gameName,
      riotTagLine: tagLine,
      regionId: 'euw1',
    },
    query,
  };

  const headers = {
    accept: '*/*',
    'accept-language': 'en-US,en;q=0.9',
    'content-type': 'application/json',
    origin: 'https://u.gg',
    referer: `https://u.gg/lol/profile/euw1/${gameName}-${tagLine.toLowerCase()}/live-game`,
    'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'user-agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
    'x-app-type': 'web',
  };

  try {
    const response = await axios.post('https://cors-anywhere.com/https://u.gg/api', payload, {
      headers,
    });

    if (response.data.errors) {
      throw new Error(response.data.errors[0].message);
    }

    const liveGame = response.data.data.getLiveGame;
    if (!liveGame) {
      throw new Error('Not currently in game');
    }

    // Combine teams and find current player
    const allPlayers = [...liveGame.teamA, ...liveGame.teamB];
    const currentPlayer = allPlayers.find(
      p =>
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
    const roleOrder = { top: 1, jungle: 2, mid: 3, adc: 4, supp: 5 };

    // Sort teams by role (include current player in ally team like Python version)
    const sortByRole = (a, b) =>
      (roleOrder[a.currentRole?.toLowerCase()] || 5) -
      (roleOrder[b.currentRole?.toLowerCase()] || 5);
    allyTeamRaw.sort(sortByRole);
    enemyTeamRaw.sort(sortByRole);

    // We need to get champion data to convert IDs to names
    const champions = await fetchChampionData(await fetchDataDragonVersion());

    const getChampionInfo = championId => {
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
        key: myChampionInfo.key,
      },
      allyTeam: allyTeamRaw.map(p => {
        const champInfo = getChampionInfo(p.championId);
        return {
          championId: p.championId,
          championName: champInfo.name,
          championKey: champInfo.key,
          summonerName: `${p.riotUserName}#${p.riotTagLine}`,
          role: p.currentRole,
        };
      }),
      enemyTeam: enemyTeamRaw.map(p => {
        const champInfo = getChampionInfo(p.championId);
        return {
          championId: p.championId,
          championName: champInfo.name,
          championKey: champInfo.key,
          summonerName: `${p.riotUserName}#${p.riotTagLine}`,
          role: p.currentRole,
        };
      }),
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
  const trySearch = async apiKey => {
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
        channelTitle: item.snippet.channelTitle,
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
      const response = await axios.get(
        `https://static.bigbrain.gg/assets/lol/riot_static/${version}/data/en_US/champion/${championId}.json`
      );
      const championData = response.data.data[championId];

      const abilities = [];

      // Passive
      if (championData.passive) {
        abilities.push({
          key: 'P',
          name: championData.passive.name,
          description: championData.passive.description || '',
          iconUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/passive/${championData.passive.image.full}`,
          cooldowns: ['Passive'],
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
          cooldowns: spell.cooldown,
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
    const response = await axios.get(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion/${championId}.json`
    );
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
        cooldowns: ['Passive'],
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
        cooldowns: spell.cooldownBurn ? spell.cooldownBurn.split('/') : ['?', '?', '?', '?', '?'],
      });
    });

    return abilities;
  } catch (error) {
    console.error('Error fetching abilities from Data Dragon:', error);
    throw error;
  }
}

// Skill order from leagueofgraphs.com with u.gg fallback
export async function fetchSkillOrder(championName, forceRefresh = false) {
  const cacheKey = getCacheKey('skill_order', championName);

  // Skip cache if forceRefresh is true (for retry button)
  if (!forceRefresh) {
    const cached = getFromCache(cacheKey, CACHE_TTL.DATA_DRAGON);
    if (cached) {
      console.log(`[SkillOrder] Found cached data for ${championName}:`, cached);
      return cached;
    }
  } else {
    console.log(`[SkillOrder] Force refresh requested, skipping cache for ${championName}`);
  }

  const cleanChampionName = championName.toLowerCase().replace(/[^a-z]/g, '');
  console.log(`[SkillOrder] Clean champion name: ${cleanChampionName}`);

  // Try LeagueOfGraphs first (single attempt)
  try {
    const url = `https://cors-anywhere.com/https://www.leagueofgraphs.com/champions/skills-orders/${cleanChampionName}`;
    console.log(`[SkillOrder] LeagueOfGraphs URL: ${url}`);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    console.log(
      `[SkillOrder] LeagueOfGraphs response status: ${response.status}, data length: ${response.data?.length || 0}`
    );

    const skillOrder = parseSkillOrder(response.data);
    console.log(`[SkillOrder] LeagueOfGraphs parsed skill order for ${championName}:`, skillOrder);

    if (skillOrder.length > 0) {
      setCache(cacheKey, skillOrder);
      return skillOrder;
    }
  } catch (error) {
    console.warn(`[SkillOrder] LeagueOfGraphs failed for ${championName}:`, {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });
  }

  // Fallback to u.gg
  console.log(`[SkillOrder] LeagueOfGraphs failed, trying u.gg fallback for ${championName}`);

  try {
    const uggUrl = `https://cors-anywhere.com/https://u.gg/lol/champions/${cleanChampionName}/build`;
    console.log(`[SkillOrder] u.gg URL: ${uggUrl}`);

    const response = await axios.get(uggUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    console.log(
      `[SkillOrder] u.gg response status: ${response.status}, data length: ${response.data?.length || 0}`
    );

    const skillOrder = parseUggSkillOrder(response.data);
    console.log(`[SkillOrder] u.gg parsed skill order for ${championName}:`, skillOrder);

    setCache(cacheKey, skillOrder);
    return skillOrder;
  } catch (error) {
    console.error(`[SkillOrder] u.gg fallback failed for ${championName}:`, {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
    });

    const emptyResult = [];
    setCache(cacheKey, emptyResult);
    return emptyResult;
  }
}

function parseSkillOrder(htmlContent) {
  console.log(`[SkillOrder] Parsing HTML content, length: ${htmlContent?.length || 0}`);

  const skillOrder = new Array(18).fill('');

  // Try multiple regex patterns to handle different HTML structures
  const patterns = [
    // Pattern 1: Original pattern
    /<td class="skillCell[^"]*"[^>]*>([\s\S]*?)<\/td>/g,
    // Pattern 2: More flexible class matching
    /<td[^>]*class="[^"]*skillCell[^"]*"[^>]*>([\s\S]*?)<\/td>/g,
    // Pattern 3: Even more flexible
    /<td[^>]*skillCell[^>]*>([\s\S]*?)<\/td>/g,
  ];

  let allCellMatches = [];
  let patternUsed = -1;

  // Try each pattern until we find matches
  for (let i = 0; i < patterns.length; i++) {
    const matches = [...htmlContent.matchAll(patterns[i])];
    if (matches.length > 0) {
      allCellMatches = matches;
      patternUsed = i + 1;
      console.log(
        `[SkillOrder] Pattern ${patternUsed} matched ${matches.length} skillCell elements`
      );
      break;
    }
  }

  if (allCellMatches.length === 0) {
    console.log(`[SkillOrder] No skillCell elements found with any pattern`);

    // Check if this is a dynamically loaded page (look for AJAX indicators)
    const hasAjaxManager =
      htmlContent.includes('LoLGAjaxManager') || htmlContent.includes('ajaxManager');
    const hasSkillsPage = htmlContent.includes('"page":"skills-orders"');

    if (hasAjaxManager && hasSkillsPage) {
      console.log(
        `[SkillOrder] Detected AJAX-based page - skill order data is loaded dynamically, not in initial HTML`
      );
      console.log(
        `[SkillOrder] LeagueOfGraphs uses JavaScript to load skill order data after page load`
      );

      // This is expected for LeagueOfGraphs - they load data via AJAX
      console.log(
        `[SkillOrder] Returning empty array - consider using alternative data source or headless browser`
      );
      return [];
    }

    // If it's not an AJAX page, continue with debugging
    const qMatches = htmlContent.match(/[>]Q[<]/g) || [];
    const wMatches = htmlContent.match(/[>]W[<]/g) || [];
    const eMatches = htmlContent.match(/[>]E[<]/g) || [];
    const rMatches = htmlContent.match(/[>]R[<]/g) || [];
    console.log(
      `[SkillOrder] Found skills in HTML: Q=${qMatches.length}, W=${wMatches.length}, E=${eMatches.length}, R=${rMatches.length}`
    );

    // Look for table-related elements
    const tableMatches = htmlContent.match(/<table[^>]*>/gi) || [];
    const tdMatches = htmlContent.match(/<td[^>]*>/gi) || [];
    console.log(
      `[SkillOrder] Found ${tableMatches.length} tables and ${tdMatches.length} td elements`
    );

    return [];
  }

  const allActiveCells = [];
  let activeCellCount = 0;

  for (let cellIndex = 0; cellIndex < allCellMatches.length; cellIndex++) {
    const match = allCellMatches[cellIndex];
    const cellContent = match[1].trim();
    const isActive = match[0].includes('active');

    console.log(
      `[SkillOrder] Cell ${cellIndex}: content="${cellContent}", active=${isActive}, fullMatch="${match[0].substring(0, 100)}..."`
    );

    if (isActive && ['Q', 'W', 'E', 'R'].includes(cellContent)) {
      // Only take the first 18 active cells
      if (activeCellCount < 18) {
        const position = cellIndex % 18; // Each skill has 18 columns
        allActiveCells.push({
          skill: cellContent,
          position: position,
        });
        activeCellCount++;
        console.log(
          `[SkillOrder] Added active cell ${activeCellCount}: ${cellContent} at position ${position}`
        );
      } else {
        console.log(`[SkillOrder] Stopping after finding 18 active cells`);
        break; // Stop after finding 18 active cells
      }
    }
  }

  console.log(`[SkillOrder] Total active cells found: ${activeCellCount}`);

  // Map the active cells to the skill order array
  allActiveCells.forEach(({ skill, position }) => {
    if (position < 18 && skillOrder[position] === '') {
      skillOrder[position] = skill;
    }
  });

  // Remove empty slots and return only filled positions
  const finalOrder = skillOrder.filter(skill => skill !== '');
  console.log(`[SkillOrder] Final skill order (${finalOrder.length} skills):`, finalOrder);

  const result = finalOrder.length >= 6 ? finalOrder : [];
  console.log(`[SkillOrder] Returning result:`, result);

  return result;
}

function parseUggSkillOrder(htmlContent) {
  console.log(`[SkillOrder] Parsing u.gg HTML content, length: ${htmlContent?.length || 0}`);

  const skillOrder = new Array(18).fill('');

  try {
    // Find all skill-order-row elements
    const skillRowMatches = htmlContent.matchAll(
      /<div class="skill-order-row">(.*?)<\/div><\/div><\/div>/gs
    );

    let processedRows = 0;
    for (const rowMatch of skillRowMatches) {
      const rowContent = rowMatch[1];

      // Extract the skill letter (Q, W, E, R)
      const skillLabelMatch = rowContent.match(
        /<div class="skill-label bottom-right">([QWER])<\/div>/
      );
      if (!skillLabelMatch) continue;

      const skillLetter = skillLabelMatch[1];
      console.log(`[SkillOrder] u.gg processing skill: ${skillLetter}`);

      // Find all skill-up divs with numbers
      const skillUpMatches = rowContent.matchAll(
        /<div class="skill-up[^"]*"><div>(\d+)<\/div><\/div>/g
      );

      for (const skillUpMatch of skillUpMatches) {
        const level = parseInt(skillUpMatch[1]);
        if (level >= 1 && level <= 18) {
          skillOrder[level - 1] = skillLetter; // Convert to 0-based index
          console.log(`[SkillOrder] u.gg Level ${level}: ${skillLetter}`);
        }
      }

      processedRows++;
    }

    console.log(`[SkillOrder] u.gg processed ${processedRows} skill rows`);
    console.log(`[SkillOrder] u.gg full 18-level array:`, skillOrder);

    // Remove empty slots and get current skills
    const finalOrder = skillOrder.filter(skill => skill !== '');
    console.log(`[SkillOrder] u.gg parsed skill order (${finalOrder.length} skills):`, finalOrder);

    // Fill missing skills to complete the build (Q=5, W=5, E=5, R=3)
    const completeOrder = [...finalOrder];
    const targetCounts = { Q: 5, W: 5, E: 5, R: 3 };
    const currentCounts = { Q: 0, W: 0, E: 0, R: 0 };

    // Count current skills
    completeOrder.forEach(skill => currentCounts[skill]++);
    console.log(`[SkillOrder] u.gg current distribution:`, currentCounts);

    // Fill missing skills in priority order: Q, W, E, R
    const fillOrder = ['Q', 'W', 'E', 'R'];
    for (const skill of fillOrder) {
      const needed = targetCounts[skill] - currentCounts[skill];
      if (needed > 0) {
        console.log(`[SkillOrder] u.gg adding ${needed} missing ${skill} skills`);
        for (let i = 0; i < needed; i++) {
          completeOrder.push(skill);
        }
        currentCounts[skill] += needed;
      }
    }

    console.log(`[SkillOrder] u.gg final distribution:`, currentCounts);
    console.log(
      `[SkillOrder] u.gg complete skill order (${completeOrder.length} skills):`,
      completeOrder
    );

    const result = completeOrder.length >= 6 ? completeOrder : [];
    console.log(`[SkillOrder] u.gg returning result:`, result);

    return result;
  } catch (error) {
    console.error(`[SkillOrder] Error parsing u.gg skill order:`, error);

    // Return complete fallback build if parsing completely fails
    console.log(`[SkillOrder] u.gg parsing failed, returning fallback skill order`);
    const fallbackOrder = [
      'Q',
      'E',
      'W',
      'Q',
      'Q',
      'R',
      'Q',
      'E',
      'Q',
      'E',
      'R',
      'E',
      'E',
      'W',
      'W',
      'R',
      'W',
      'W',
    ];
    console.log(`[SkillOrder] u.gg fallback order:`, fallbackOrder);
    return fallbackOrder;
  }
}
