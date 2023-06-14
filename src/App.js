import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import TopBar from './components/TopBar';
import About from './components/About';
import CityPage from './origin/CityPage';
import { Analytics } from '@vercel/analytics/react';

import hamburgData from './data/hamburg.json';
import berlinData from './data/berlin.json';


const App = () => {
  return (
    <div>
      <TopBar />
      <Router>
        <Routes>
          <Route exact path="/" element={<Home />} />
          <Route path="/origin/hamburg" element={<CityPage cardsData={hamburgData} />} />
          <Route path="/origin/berlin" element={<CityPage cardsData={berlinData} />} />
          <Route path="/about" element={<About />} />
          {/* Add more routes for other pages */}
        </Routes>
      </Router>
      <Analytics />;
    </div>
  );
};

export default App;