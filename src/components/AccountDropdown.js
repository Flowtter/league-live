import React, { useState, useEffect, useRef } from 'react';

function AccountDropdown({
  accounts,
  selectedAccount,
  onAccountChange,
  placeholder = 'Select Account...',
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    setSearchTerm(selectedAccount || '');
  }, [selectedAccount]);

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

  const filteredAccounts = accounts.filter(account =>
    account.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    setIsOpen(true);

    if (value === '') {
      onAccountChange('');
      setHighlightedIndex(-1);
    } else {
      setHighlightedIndex(0);
    }
  };

  const handleAccountSelect = (accountName) => {
    setSearchTerm(accountName);
    onAccountChange(accountName);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
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
        prev < filteredAccounts.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev =>
        prev > 0 ? prev - 1 : filteredAccounts.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredAccounts.length) {
        handleAccountSelect(filteredAccounts[highlightedIndex].name);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
      inputRef.current?.blur();
    }
  };

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
          {filteredAccounts.length > 0 ? (
            filteredAccounts.map((account, index) => (
              <div
                key={account.name}
                className={`champion-dropdown-item ${
                  index === highlightedIndex ? 'highlighted' : ''
                }`}
                onClick={() => handleAccountSelect(account.name)}
              >
                {account.name} (EUW1)
              </div>
            ))
          ) : (
            <div className="champion-dropdown-item no-results">
              No accounts found
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AccountDropdown;