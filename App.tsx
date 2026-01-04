import React from 'react';
import FightingGame from './components/FightingGame';

function App() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-bold text-white mb-2 hidden md:block">Zen Strike: Arcade Edition</h1>
        <p className="text-slate-400 text-sm">React + Canvas + Tailwind | No Engine</p>
      </header>
      
      <FightingGame />
      
      <footer className="mt-8 text-center text-xs text-slate-600">
        <p>Built with React & TypeScript. AI Commentary powered by Gemini.</p>
      </footer>
    </div>
  );
}

export default App;