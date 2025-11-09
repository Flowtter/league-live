import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import LivePage from './pages/LivePage';
import LearnPage from './pages/LearnPage';
import RandomPage from './pages/RandomPage';
import MinigamePage from './pages/MinigamePage';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<LivePage />} />
          <Route path="/live" element={<LivePage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/random" element={<RandomPage />} />
          <Route path="/minigame" element={<MinigamePage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
