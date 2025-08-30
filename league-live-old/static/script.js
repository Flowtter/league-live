// State management
let state = {
    selectedAccount: null,
    liveGame: null,
    myChampion: null,
    selectedAllyChampionId: null,
    selectedEnemyChampionId: null,
    selectedChampionId: null,
    ddVersion: null,
    videoCache: {},
    videoFetchTimer: null
};

// Utility functions
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function setCookie(name, value, days = 365) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function showError(message, duration = 5000) {
    const banner = document.getElementById('error-banner');
    banner.textContent = message;
    banner.classList.remove('hidden');
    
    setTimeout(() => {
        banner.classList.add('hidden');
    }, duration);
}

function hideError() {
    document.getElementById('error-banner').classList.add('hidden');
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Champion learning management
function getChampionLearningCount(championName) {
    const learningData = getCookie('champion_learning');
    const learning = learningData ? JSON.parse(learningData) : {};
    return learning[championName.toLowerCase()] || 0;
}

function incrementChampionLearning(championName) {
    const learningData = getCookie('champion_learning');
    const learning = learningData ? JSON.parse(learningData) : {};
    const key = championName.toLowerCase();
    learning[key] = (learning[key] || 0) + 1;
    setCookie('champion_learning', JSON.stringify(learning));
    return learning[key];
}

function decrementChampionLearning(championName) {
    const learningData = getCookie('champion_learning');
    const learning = learningData ? JSON.parse(learningData) : {};
    const key = championName.toLowerCase();
    learning[key] = Math.max(0, (learning[key] || 0) - 1);
    setCookie('champion_learning', JSON.stringify(learning));
    return learning[key];
}

function getLearningRange() {
    const learningData = getCookie('champion_learning');
    const learning = learningData ? JSON.parse(learningData) : {};
    const values = Object.values(learning).filter(v => v > 0);
    if (values.length === 0) return { min: 0, max: 0 };
    return { min: Math.min(...values), max: Math.max(...values) };
}

function getLearningBadgeColor(count, min, max) {
    if (count === 0) return '#666666'; // Gray for 0
    if (max === min) return '#2ecc71'; // Green if only one value
    
    // Interpolate from red (#e74c3c) to green (#2ecc71)
    const ratio = (count - min) / (max - min);
    
    // Red: #e74c3c = rgb(231, 76, 60)
    // Green: #2ecc71 = rgb(46, 204, 113)
    const red = Math.round(231 * (1 - ratio) + 46 * ratio);
    const green = Math.round(76 * (1 - ratio) + 204 * ratio);
    const blue = Math.round(60 * (1 - ratio) + 113 * ratio);
    
    return `rgb(${red}, ${green}, ${blue})`;
}

// Account management
function loadAccounts() {
    const accountsData = getCookie('lol_accounts');
    const accounts = accountsData ? JSON.parse(accountsData) : [];
    const lastSelected = getCookie('last_selected_account');
    
    const dropdown = document.getElementById('accounts-dropdown');
    dropdown.innerHTML = '<option value="">Select Account...</option>';
    
    accounts.forEach(account => {
        const option = document.createElement('option');
        option.value = account.name;
        option.textContent = `${account.name} (EUW1)`;
        dropdown.appendChild(option);
    });
    
    if (lastSelected && accounts.find(acc => acc.name === lastSelected)) {
        dropdown.value = lastSelected;
        state.selectedAccount = lastSelected;
        fetchLiveGame();
    }
}

function saveAccount(name) {
    if (!name.trim()) return false;
    
    const accountsData = getCookie('lol_accounts');
    const accounts = accountsData ? JSON.parse(accountsData) : [];
    
    if (accounts.find(acc => acc.name === name)) {
        showError('Account already exists');
        return false;
    }
    
    accounts.push({ name: name.trim() });
    setCookie('lol_accounts', JSON.stringify(accounts));
    setCookie('last_selected_account', name.trim());
    
    state.selectedAccount = name.trim();
    loadAccounts();
    fetchLiveGame();
    return true;
}

function deleteAccount(name) {
    const accountsData = getCookie('lol_accounts');
    const accounts = accountsData ? JSON.parse(accountsData) : [];
    
    const filteredAccounts = accounts.filter(acc => acc.name !== name);
    setCookie('lol_accounts', JSON.stringify(filteredAccounts));
    
    // If we deleted the currently selected account, clear selection
    if (state.selectedAccount === name) {
        state.selectedAccount = null;
        state.liveGame = null;
        setCookie('last_selected_account', '');
    }
    
    loadAccounts();
    updateUI();
}

// API calls
async function fetchLiveGame() {
    if (!state.selectedAccount) return;
    
    hideError();
    
    try {
        const response = await fetch(`/api/live?account=${encodeURIComponent(state.selectedAccount)}`);
        
        if (response.status === 404) {
            showError('Not currently in game');
            state.liveGame = null;
            updateUI();
            return;
        }
        
        if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After') || '60';
            showError(`Rate limited. Try again in ${retryAfter} seconds`);
            return;
        }
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        state.liveGame = await response.json();
        state.myChampion = state.liveGame.myChampion;
        state.ddVersion = state.liveGame.ddVersion;
        updateUI();
        
        // Auto-select first ally if none selected
        if (!state.selectedChampionId && state.liveGame.allyTeam.length > 0) {
            selectChampion(state.liveGame.allyTeam[0].championId, 'ally');
        }
        
    } catch (error) {
        console.error('Error fetching live game:', error);
        showError('Failed to fetch live game data');
    }
}

const debouncedFetchVideos = debounce(fetchVideos, 250);

async function fetchVideos() {
    if (!state.myChampion || !state.selectedChampionId) return;
    
    const selectedChampionName = getChampionNameById(state.selectedChampionId);
    if (!selectedChampionName) return;
    
    const cacheKey = `${selectedChampionName}_${state.myChampion.name}`;
    
    if (state.videoCache[cacheKey]) {
        updateVideoIframes(state.videoCache[cacheKey]);
        return;
    }
    
    // Show loading state
    showVideoLoading();
    
    try {
        // Guide video is about the selected champion
        // Matchup video is myChampion vs selectedChampion
        let url = `/api/videos?selectedChampion=${encodeURIComponent(selectedChampionName)}&myChampion=${encodeURIComponent(state.myChampion.name)}`;
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch videos');
        
        const videos = await response.json();
        state.videoCache[cacheKey] = videos;
        updateVideoIframes(videos);
        
    } catch (error) {
        console.error('Error fetching videos:', error);
        showError('Failed to fetch videos');
        // Clear loading state on error
        hideVideoLoading();
    }
}

async function fetchCooldowns(championName) {
    if (!championName) return;
    
    // Show loading state for abilities
    showAbilitiesLoading();
    
    try {
        const response = await fetch(`/api/cooldowns?champion=${encodeURIComponent(championName)}`);
        if (!response.ok) throw new Error('Failed to fetch cooldowns');
        
        const abilities = await response.json();
        updateAbilities(abilities);
        
    } catch (error) {
        console.error('Error fetching cooldowns:', error);
        showError('Failed to fetch champion abilities');
        // Clear loading state on error
        hideAbilitiesLoading();
    }
}

// UI updates
function updateUI() {
    updateChampionMenus();
    updateSelectedChampionHeader();
}

function updateChampionMenus() {
    const allyContainer = document.getElementById('ally-champions');
    const enemyContainer = document.getElementById('enemy-champions');
    
    allyContainer.innerHTML = '';
    enemyContainer.innerHTML = '';
    
    if (!state.liveGame) return;
    
    // Allies
    state.liveGame.allyTeam.forEach(player => {
        const item = createChampionItem(player, 'ally');
        allyContainer.appendChild(item);
    });
    
    // Enemies
    state.liveGame.enemyTeam.forEach(player => {
        const item = createChampionItem(player, 'enemy');
        enemyContainer.appendChild(item);
    });
}

function createChampionItem(player, team) {
    const item = document.createElement('div');
    item.className = 'champion-item';
    
    // Check if this is the player's own champion
    const isMyChampion = state.myChampion && player.championId === state.myChampion.id;
    
    if (isMyChampion) {
        item.classList.add('my-champion');
    }
    
    // Allow selection of all champions including the player's own
    if (state.selectedChampionId === player.championId) {
        item.classList.add('selected');
    }
    
    item.addEventListener('click', () => {
        selectChampion(player.championId, team);
    });
    
    const portrait = document.createElement('img');
    portrait.className = `champion-portrait ${team}`;
    portrait.src = getChampionIconUrl(player.championKey, state.ddVersion);
    portrait.alt = player.championName;
    
    item.appendChild(portrait);
    
    // Always add learning badge
    const learningCount = getChampionLearningCount(player.championName);
    const range = getLearningRange();
    const badgeColor = getLearningBadgeColor(learningCount, range.min, range.max);
    
    const badge = document.createElement('div');
    badge.className = 'learning-badge';
    badge.textContent = learningCount;
    badge.style.backgroundColor = badgeColor;
    // Adjust text color for better contrast
    badge.style.color = learningCount === 0 ? '#ffffff' : '#000000';
    item.appendChild(badge);
    
    return item;
}

function selectChampion(championId, team) {
    // Clear previous selections
    state.selectedAllyChampionId = null;
    state.selectedEnemyChampionId = null;
    
    // Set new selection
    state.selectedChampionId = championId;
    if (team === 'ally') {
        state.selectedAllyChampionId = championId;
    } else {
        state.selectedEnemyChampionId = championId;
    }
    
    // Fetch cooldowns for any selected champion (ally or enemy)
    const selectedName = getChampionNameById(championId);
    if (selectedName) {
        fetchCooldowns(selectedName);
    }
    
    // Update videos for any selection (ally or enemy)
    debouncedFetchVideos();
    
    updateUI();
    updateSelectedChampionHeader();
}

function updateSelectedChampionHeader() {
    const header = document.getElementById('selected-champion-name');
    
    if (state.selectedChampionId) {
        const championName = getChampionNameById(state.selectedChampionId);
        header.textContent = championName || 'Unknown Champion';
    } else {
        header.textContent = 'Select a champion';
    }
    
    // Fetch videos when champion selection changes
    if (state.myChampion) {
        debouncedFetchVideos();
    }
}

function showVideoLoading() {
    const guideIframe = document.getElementById('guide-video');
    const matchupIframe = document.getElementById('matchup-video');
    
    guideIframe.style.display = 'none';
    matchupIframe.style.display = 'none';
    
    // Create loading indicators if they don't exist
    if (!document.getElementById('guide-loading')) {
        const guideContainer = guideIframe.parentElement;
        const guideLoading = document.createElement('div');
        guideLoading.id = 'guide-loading';
        guideLoading.className = 'loading';
        guideLoading.textContent = 'Loading guide...';
        guideContainer.appendChild(guideLoading);
    }
    
    if (!document.getElementById('matchup-loading')) {
        const matchupContainer = matchupIframe.parentElement;
        const matchupLoading = document.createElement('div');
        matchupLoading.id = 'matchup-loading';
        matchupLoading.className = 'loading';
        matchupLoading.textContent = 'Loading matchup...';
        matchupContainer.appendChild(matchupLoading);
    }
    
    document.getElementById('guide-loading').style.display = 'flex';
    document.getElementById('matchup-loading').style.display = 'flex';
}

function hideVideoLoading() {
    const guideIframe = document.getElementById('guide-video');
    const matchupIframe = document.getElementById('matchup-video');
    const guideLoading = document.getElementById('guide-loading');
    const matchupLoading = document.getElementById('matchup-loading');
    
    guideIframe.style.display = 'block';
    matchupIframe.style.display = 'block';
    
    if (guideLoading) guideLoading.style.display = 'none';
    if (matchupLoading) matchupLoading.style.display = 'none';
}

function updateVideoIframes(videos) {
    const guideIframe = document.getElementById('guide-video');
    const matchupIframe = document.getElementById('matchup-video');
    
    if (videos.guide) {
        let guideUrl = `https://www.youtube.com/embed/${videos.guide.videoId}?rel=0&showinfo=0&modestbranding=1`;
        // Add abilities timestamp if available
        if (videos.guide.abilitiesStart) {
            guideUrl += `&start=${videos.guide.abilitiesStart}`;
        }
        guideIframe.src = guideUrl;
    } else {
        guideIframe.src = '';
    }
    
    if (videos.matchup) {
        matchupIframe.src = `https://www.youtube.com/embed/${videos.matchup.videoId}?rel=0&showinfo=0&modestbranding=1`;
    } else {
        matchupIframe.src = '';
        if (videos.fallbackReason) {
            console.log('Matchup fallback:', videos.fallbackReason);
        }
    }
    
    // Hide loading indicators
    hideVideoLoading();
}

function showAbilitiesLoading() {
    const container = document.getElementById('abilities-container');
    container.innerHTML = '';
    
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.textContent = 'Loading abilities...';
    loading.style.gridColumn = '1 / -1'; // Span all columns
    loading.style.height = '100px';
    container.appendChild(loading);
}

function hideAbilitiesLoading() {
    const container = document.getElementById('abilities-container');
    const loading = container.querySelector('.loading');
    if (loading) {
        container.removeChild(loading);
    }
}

function updateAbilities(abilities) {
    const container = document.getElementById('abilities-container');
    container.innerHTML = '';
    
    abilities.forEach(ability => {
        const card = document.createElement('div');
        card.className = 'ability-card';
        
        const header = document.createElement('div');
        header.className = 'ability-header';
        
        const icon = document.createElement('img');
        icon.className = 'ability-icon';
        icon.src = ability.iconUrl;
        icon.alt = ability.name;
        
        const key = document.createElement('span');
        key.className = 'ability-key';
        key.textContent = ability.key;
        
        const name = document.createElement('span');
        name.className = 'ability-name';
        name.textContent = ability.name;
        
        header.appendChild(icon);
        header.appendChild(key);
        header.appendChild(name);
        
        const cooldowns = document.createElement('div');
        cooldowns.className = 'ability-cooldowns';
        cooldowns.textContent = ability.cooldowns.join(' / ') + 's';
        
        const description = document.createElement('div');
        description.className = 'ability-description';
        // Use description field (from BigBrain API) or fallback to cleaned tooltip
        let cleanDescription = ability.description || ability.tooltip || '';
        
        if (!ability.description && ability.tooltip) {
            // Clean HTML tags and mustache templates for Data Dragon fallback
            cleanDescription = ability.tooltip
                .replace(/<[^>]*>/g, '') // Remove HTML tags
                .replace(/\{\{\s*[^}]+\s*\}\}/g, '[VALUE]') // Replace mustache templates with [VALUE]
                .replace(/\s+/g, ' ') // Replace multiple spaces with single space
                .trim();
        }
        
        description.textContent = cleanDescription;
        
        card.appendChild(header);
        card.appendChild(cooldowns);
        card.appendChild(description);
        
        container.appendChild(card);
    });
}

// Helper functions
function getChampionNameById(championId) {
    if (!state.liveGame) return null;
    
    const allPlayers = [...state.liveGame.allyTeam, ...state.liveGame.enemyTeam];
    const player = allPlayers.find(p => p.championId === championId);
    return player ? player.championName : null;
}

function getChampionIconUrl(championKey, ddVersion) {
    if (!championKey || !ddVersion) {
        return `https://ddragon.leagueoflegends.com/cdn/13.24.1/img/champion/Aatrox.png`;
    }
    return `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${championKey}.png`;
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadAccounts();
    
    // Account dropdown change
    document.getElementById('accounts-dropdown').addEventListener('change', (e) => {
        if (e.target.value) {
            state.selectedAccount = e.target.value;
            setCookie('last_selected_account', e.target.value);
            fetchLiveGame();
        }
    });
    
    // Add account button
    document.getElementById('add-account-btn').addEventListener('click', () => {
        const accountName = prompt('Enter GameName#TAG (EUW1):');
        if (accountName && accountName.trim()) {
            saveAccount(accountName.trim());
        }
    });
    
    // Delete account button
    document.getElementById('delete-account-btn').addEventListener('click', () => {
        if (!state.selectedAccount) {
            showError('Please select an account to delete');
            return;
        }
        
        if (confirm(`Delete account "${state.selectedAccount}"?`)) {
            deleteAccount(state.selectedAccount);
        }
    });
    
    // Learnt button
    document.getElementById('learnt-btn').addEventListener('click', () => {
        if (!state.selectedChampionId) return;
        
        const championName = getChampionNameById(state.selectedChampionId);
        if (championName) {
            incrementChampionLearning(championName);
            updateUI(); // Refresh to show updated badge
        }
    });
    
    // Forgot button
    document.getElementById('forgot-btn').addEventListener('click', () => {
        if (!state.selectedChampionId) return;
        
        const championName = getChampionNameById(state.selectedChampionId);
        if (championName) {
            decrementChampionLearning(championName);
            updateUI(); // Refresh to show updated badge
        }
    });
    
    // Refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
        if (state.selectedAccount) {
            fetchLiveGame();
        } else {
            showError('Please select an account first');
        }
    });
    
    
});