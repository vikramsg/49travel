import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import TopBar from './components/TopBar';
import About from './components/About';
import Hamburg from './origin/Hamburg';
import { Analytics } from '@vercel/analytics/react';


const App = () => {
  return (
    <div>
      <TopBar />
      <Router>
        <Routes>
          <Route exact path="/" element={<Home />} />
          <Route path="/origin/hamburg" element={<Hamburg />} />
          <Route path="/about" element={<About />} />
          {/* Add more routes for other pages */}
        </Routes>
      </Router>
      <Analytics />;
    </div>
  );
};

export default App;