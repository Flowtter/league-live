// Account management
export function getAccounts() {
  const accountsData = localStorage.getItem('lol_accounts');
  return accountsData ? JSON.parse(accountsData) : [];
}

export function saveAccount(name) {
  if (!name.trim()) return false;
  
  const accounts = getAccounts();
  
  if (accounts.find(acc => acc.name === name)) {
    throw new Error('Account already exists');
  }
  
  accounts.push({ name: name.trim() });
  localStorage.setItem('lol_accounts', JSON.stringify(accounts));
  localStorage.setItem('last_selected_account', name.trim());
  
  return true;
}

export function deleteAccount(name) {
  const accounts = getAccounts();
  const filteredAccounts = accounts.filter(acc => acc.name !== name);
  
  localStorage.setItem('lol_accounts', JSON.stringify(filteredAccounts));
  
  // If we deleted the currently selected account, clear selection
  const lastSelected = getLastSelectedAccount();
  if (lastSelected === name) {
    localStorage.setItem('last_selected_account', '');
  }
  
  return filteredAccounts;
}

export function getLastSelectedAccount() {
  return localStorage.getItem('last_selected_account') || '';
}

export function setLastSelectedAccount(name) {
  localStorage.setItem('last_selected_account', name);
}

// Champion learning management
export function getChampionLearningCount(championName) {
  const learningData = localStorage.getItem('champion_learning');
  const learning = learningData ? JSON.parse(learningData) : {};
  return learning[championName.toLowerCase()] || 0;
}

export function incrementChampionLearning(championName) {
  const learningData = localStorage.getItem('champion_learning');
  const learning = learningData ? JSON.parse(learningData) : {};
  const key = championName.toLowerCase();
  learning[key] = (learning[key] || 0) + 1;
  localStorage.setItem('champion_learning', JSON.stringify(learning));
  return learning[key];
}

export function decrementChampionLearning(championName) {
  const learningData = localStorage.getItem('champion_learning');
  const learning = learningData ? JSON.parse(learningData) : {};
  const key = championName.toLowerCase();
  learning[key] = Math.max(0, (learning[key] || 0) - 1);
  localStorage.setItem('champion_learning', JSON.stringify(learning));
  return learning[key];
}

export function getLearningRange() {
  const learningData = localStorage.getItem('champion_learning');
  const learning = learningData ? JSON.parse(learningData) : {};
  const values = Object.values(learning).filter(v => v > 0);
  if (values.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

export function getLearningBadgeColor(count, min, max) {
  if (count === 0) return '#666666'; // Gray for 0
  if (max === min) return '#2ecc71'; // Green if only one value
  if (max === min && max === 1) return '#2ecc71'; // Green if only one value
  
  // Interpolate from red (#e74c3c) to green (#2ecc71)
  const ratio = (count - min) / (max - min);
  
  // Red: #e74c3c = rgb(231, 76, 60)
  // Green: #2ecc71 = rgb(46, 204, 113)
  const red = Math.round(231 * (1 - ratio) + 46 * ratio);
  const green = Math.round(76 * (1 - ratio) + 204 * ratio);
  const blue = Math.round(60 * (1 - ratio) + 113 * ratio);
  
  return `rgb(${red}, ${green}, ${blue})`;
}
