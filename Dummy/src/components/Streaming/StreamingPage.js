import React, { useState } from 'react';
import StreamerView from './StreamerView';
import ViewerView from './ViewerView';
import './StreamingPage.css';

const StreamingPage = () => {
  const [mode, setMode] = useState(''); // 'stream' or 'watch'

  return (
    <div className="streaming-page">
      <h1>Live Streaming</h1>
      
      {!mode && (
        <div className="mode-selection">
          <h3>Choose your role:</h3>
          <div className="mode-buttons">
            <button onClick={() => setMode('stream')}>
              I want to Stream
            </button>
            <button onClick={() => setMode('watch')}>
              I want to Watch
            </button>
          </div>
        </div>
      )}

      {mode === 'stream' && (
        <div className="mode-view">
          <button className="back-button" onClick={() => setMode('')}>
            ← Back to Selection
          </button>
          <StreamerView />
        </div>
      )}

      {mode === 'watch' && (
        <div className="mode-view">
          <button className="back-button" onClick={() => setMode('')}>
            ← Back to Selection
          </button>
          <ViewerView />
        </div>
      )}
    </div>
  );
};

export default StreamingPage; 