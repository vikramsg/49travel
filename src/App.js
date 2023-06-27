import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import TopBar from './components/TopBar';
import About from './components/About';
import CityPage from './origin/CityPage';
import { Analytics } from '@vercel/analytics/react';

import hamburgData from './data/hamburg.json';
import berlinData from './data/berlin.json';
import munichData from './data/munich.json';
import cologneData from './data/cologne.json';
import stuttgartData from './data/stuttgart.json';
import frankfurtData from './data/frankfurt.json';


const App = () => {
  return (
    <div>
      <TopBar />
      <Router>
        <Routes>
          <Route exact path="/" element={<Home />} />
          <Route path="/origin/hamburg" element={<CityPage cardsData={hamburgData} />} />
          <Route path="/origin/berlin" element={<CityPage cardsData={berlinData} />} />
          <Route path="/origin/munich" element={<CityPage cardsData={munichData} />} />
          <Route path="/origin/cologne" element={<CityPage cardsData={cologneData} />} />
          <Route path="/origin/stuttgart" element={<CityPage cardsData={stuttgartData} />} />
          <Route path="/origin/frankfurt" element={<CityPage cardsData={frankfurtData} />} />
          <Route path="/about" element={<About />} />
          {/* Add more routes for other pages */}
        </Routes>
      </Router>
      <Analytics />;
    </div>
  );
};

export default App;