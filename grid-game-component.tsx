import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';

const PLAYER_COLORS = ['bg-blue-500', 'bg-orange-500'];
const REVEAL_TIME = 2000; // 2 seconds

const GridGame = () => {
  const [gameState, setGameState] = useState('START');
  const [gridSize, setGridSize] = useState(10);
  const [grid, setGrid] = useState([]);
  const [currentPlayer, setCurrentPlayer] = useState('PLAYER1');
  const [playerCells, setPlayerCells] = useState({ PLAYER1: [], CPU1: [] });
  const [scores, setScores] = useState({ PLAYER1: 0, CPU1: 0 });
  const [combos, setCombos] = useState({ PLAYER1: [], CPU1: [] });
  const [scoreMultipliers, setScoreMultipliers] = useState({ PLAYER1: 1, CPU1: 1 });
  const [isRevealing, setIsRevealing] = useState(false);

  const initializeGame = useCallback(() => {
    const totalCells = gridSize * gridSize;
    const newGrid = Array.from({ length: totalCells }, (_, i) => ({
      value: i + 1,
      revealed: false,
      owner: null,
      tempRevealed: false
    }));
    for (let i = newGrid.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newGrid[i], newGrid[j]] = [newGrid[j], newGrid[i]];
    }
    setGrid(newGrid);
    setCurrentPlayer('PLAYER1');
    setPlayerCells({ PLAYER1: [], CPU1: [] });
    setScores({ PLAYER1: 0, CPU1: 0 });
    setCombos({ PLAYER1: [], CPU1: [] });
    setScoreMultipliers({ PLAYER1: 1, CPU1: 1 });
    setGameState('PLAYING');
  }, [gridSize]);

  const isValidMove = useCallback((index) => {
    if (grid[index].revealed) return false;
    if (playerCells[currentPlayer].length === 0) return true;
    return getSurroundingIndices(index).some(i => playerCells[currentPlayer].includes(i));
  }, [grid, playerCells, currentPlayer]);

  const getSurroundingIndices = useCallback((index) => {
    const row = Math.floor(index / gridSize);
    const col = index % gridSize;
    return [
      index - gridSize - 1, index - gridSize, index - gridSize + 1,
      index - 1, index + 1,
      index + gridSize - 1, index + gridSize, index + gridSize + 1
    ].filter(i => {
      const r = Math.floor(i / gridSize);
      const c = i % gridSize;
      return r >= 0 && r < gridSize && c >= 0 && c < gridSize && 
             Math.abs(r - row) <= 1 && Math.abs(c - col) <= 1;
    });
  }, [gridSize]);

  const handleCellClick = useCallback((index) => {
    if (isRevealing || currentPlayer !== 'PLAYER1' || !isValidMove(index)) return;
    makeMove(index);
  }, [isRevealing, currentPlayer, isValidMove]);

  const makeMove = useCallback((index) => {
    const newGrid = [...grid];
    newGrid[index].revealed = true;
    newGrid[index].owner = currentPlayer;
    setGrid(newGrid);

    const newPlayerCells = { ...playerCells, [currentPlayer]: [...playerCells[currentPlayer], index] };
    setPlayerCells(newPlayerCells);

    updateCombo(grid[index].value);
    updateScore(grid[index].value);
    revealSurroundingCells(index);
  }, [grid, playerCells, currentPlayer]);

  const updateCombo = useCallback((value) => {
    const isEven = value % 2 === 0;
    const isFive = value % 5 === 0;
    const newCombos = combos[currentPlayer].filter(combo => 
      (combo.type === 'EVEN' && isEven) || 
      (combo.type === 'ODD' && !isEven) ||
      (combo.type === 'FIVE' && isFive)
    ).map(combo => ({ ...combo, count: combo.count + 1 }));

    if (newCombos.length === 0 || (isFive && !newCombos.some(c => c.type === 'FIVE'))) {
      if (isFive) newCombos.push({ type: 'FIVE', count: 1 });
      if (isEven) newCombos.push({ type: 'EVEN', count: 1 });
      else newCombos.push({ type: 'ODD', count: 1 });
    }

    setCombos({ ...combos, [currentPlayer]: newCombos });
    updateScoreMultiplier(newCombos);
  }, [combos, currentPlayer]);

  const updateScoreMultiplier = useCallback((playerCombos) => {
    const multiplier = playerCombos.reduce((total, combo) => total * Math.pow(2, combo.count - 1), 1);
    setScoreMultipliers(prev => ({ ...prev, [currentPlayer]: multiplier }));
  }, [currentPlayer]);

  const updateScore = useCallback((value) => {
    setScores(prev => ({
      ...prev,
      [currentPlayer]: prev[currentPlayer] + value * scoreMultipliers[currentPlayer]
    }));
  }, [currentPlayer, scoreMultipliers]);

  const revealSurroundingCells = useCallback((index) => {
    setIsRevealing(true);
    const surroundingIndices = getSurroundingIndices(index);
    setGrid(prev => prev.map((cell, i) => 
      surroundingIndices.includes(i) && !cell.revealed ? { ...cell, tempRevealed: true } : cell
    ));

    setTimeout(() => {
      setGrid(prev => prev.map(cell => ({ ...cell, tempRevealed: false })));
      setIsRevealing(false);
      setCurrentPlayer(prev => prev === 'PLAYER1' ? 'CPU1' : 'PLAYER1');
    }, REVEAL_TIME);
  }, [getSurroundingIndices]);

  useEffect(() => {
    if (currentPlayer === 'CPU1' && gameState === 'PLAYING') {
      setTimeout(makeCPUMove, 500);
    }
  }, [currentPlayer, gameState]);

  const makeCPUMove = useCallback(() => {
    const availableMoves = grid.reduce((moves, cell, index) => 
      isValidMove(index) ? [...moves, index] : moves, []);

    if (availableMoves.length > 0) {
      const randomMove = availableMoves[Math.floor(Math.random() * availableMoves.length)];
      makeMove(randomMove);
    } else {
      setGameState('GAME_OVER');
    }
  }, [grid, isValidMove, makeMove]);

  const renderGrid = () => {
    return (
      <div 
        className="grid gap-1 p-2 w-full"
        style={{ 
          gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
          gridTemplateRows: `repeat(${gridSize}, 1fr)`
        }}
      >
        {grid.map((cell, index) => (
          <div
            key={index}
            className={`cell flex items-center justify-center text-xs font-bold cursor-pointer
              ${cell.revealed ? PLAYER_COLORS[cell.owner === 'PLAYER1' ? 0 : 1] : 'bg-gray-200'}
              ${isValidMove(index) && !cell.revealed ? 'ring-2 ring-green-500' : ''}
              ${cell.tempRevealed ? 'bg-yellow-200' : ''}
            `}
            style={{ aspectRatio: '1 / 1' }}
            onClick={() => handleCellClick(index)}
          >
            {(cell.revealed || cell.tempRevealed) ? cell.value : ''}
          </div>
        ))}
      </div>
    );
  };

  const renderPlayerInfo = () => {
    return (
      <div className="flex justify-between w-full mb-4">
        {['PLAYER1', 'CPU1'].map(player => (
          <div key={player} className={`player-box p-2 ${currentPlayer === player ? 'bg-green-100' : ''}`}>
            <h2 className="text-sm font-bold">{player}</h2>
            <p className="text-xs">Score: {scores[player]}</p>
            <p className="text-xs">Multiplier: {scoreMultipliers[player]}x</p>
            <p className="text-xs">
              Combo: {combos[player].map(c => `${c.count}x${c.type}`).join(', ')}
            </p>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="game-container max-w-md mx-auto p-4 h-screen flex flex-col justify-center items-center">
      <h1 className="text-2xl font-bold mb-4">FOE Game</h1>
      {gameState === 'START' ? (
        <>
          <div className="mb-4 w-full">
            <label htmlFor="grid-size" className="block mb-2">Select Grid Size:</label>
            <select
              id="grid-size"
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
              className="block w-full mb-4 p-2 border rounded"
            >
              <option value="5">5x5</option>
              <option value="10">10x10</option>
            </select>
          </div>
          <Button onClick={initializeGame} className="w-full mb-4">Start Game</Button>
        </>
      ) : (
        <>
          {renderPlayerInfo()}
          {renderGrid()}
          <div className="mt-4">Current Player: {currentPlayer}</div>
          <Button onClick={() => setGameState('START')} className="mt-4">Reset Game</Button>
        </>
      )}
      {gameState === 'GAME_OVER' && (
        <div className="mt-4 p-2 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded">
          Game Over! {scores.PLAYER1 > scores.CPU1 ? 'You win!' : 'CPU wins!'}
        </div>
      )}
    </div>
  );
};

export default GridGame;
