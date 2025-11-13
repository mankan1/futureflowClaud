import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const WS_URL = `ws://localhost:3000/ws`;
const API_BASE = `http://localhost:3000`;

const OptionsFlowUI = () => {
  const [connected, setConnected] = useState(false);
  const [flows, setFlows] = useState([]);
  const [positions, setPositions] = useState([]);
  const [signals, setSignals] = useState({});
  const [autoTradeEnabled, setAutoTradeEnabled] = useState(false);
  const [stats, setStats] = useState({
    totalPnL: 0,
    winRate: 0,
    totalTrades: 0,
    openPositions: 0,
  });
  const [ws, setWs] = useState(null);

  useEffect(() => {
    connectWebSocket();
    fetchAutoTradeStatus();

    // cleanup
    return () => {
      if (ws) ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectWebSocket = () => {
    const websocket = new WebSocket(WS_URL);

    websocket.onopen = () => {
      setConnected(true);
      websocket.send(
        JSON.stringify({
          action: 'subscribe',
          futuresSymbols: ['/ES', '/NQ'],
          equitySymbols: ['SPY', 'QQQ', 'AAPL', 'TSLA'],
        }),
      );
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'TRADE') {
        setFlows((prev) => [data, ...prev].slice(0, 100));
      } else if (data.type === 'PRINT') {
        setFlows((prev) => [data, ...prev].slice(0, 100));
      } else if (
        data.type === 'AUTO_TRADE_EXECUTED' ||
        data.type === 'AUTO_TRADE_CLOSED'
      ) {
        fetchAutoTradeStatus();
      } else if (
        data.type === 'SIMULATED_TRADE' ||
        data.type === 'PAPER_TRADE' ||
        data.type === 'SIMULATED_TRADE_CLOSED'
      ) {
        fetchAutoTradeStatus();
      }
    };

    websocket.onclose = () => setConnected(false);

    setWs(websocket);
  };

  const fetchAutoTradeStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/auto-trade/status`);
      const data = await response.json();
      setAutoTradeEnabled(data.enabled);
      setPositions(data.positions || []);
      setSignals(data.signals || {});

      const allPositions = data.recentOrders || [];
      const closedPositions = allPositions.filter((p) => p.status === 'CLOSED');
      const wins = closedPositions.filter((p) => (p.pnl || 0) > 0).length;
      const totalPnL = closedPositions.reduce(
        (sum, p) => sum + (p.dollarPnl || 0),
        0,
      );

      setStats({
        totalPnL,
        winRate:
          closedPositions.length > 0
            ? (wins / closedPositions.length) * 100
            : 0,
        totalTrades: closedPositions.length,
        openPositions:
          data.positions?.filter((p) => p.status === 'OPEN').length || 0,
      });
    } catch (error) {
      console.error('Failed to fetch status:', error);
    }
  };

  const toggleAutoTrade = async () => {
    const endpoint = autoTradeEnabled ? '/auto-trade/disable' : '/auto-trade/enable';
    try {
      await fetch(`${API_BASE}${endpoint}`, { method: 'POST' });
      fetchAutoTradeStatus();
    } catch (e) {
      console.error('Failed to toggle auto-trade:', e);
    }
  };

  const placeSimulatedTrade = async (symbol, side) => {
    try {
      await fetch(`${API_BASE}/auto-trade/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, side }),
      });
      fetchAutoTradeStatus();
    } catch (error) {
      console.error('Failed to place simulated trade:', error);
    }
  };

  const getStanceColor = (score = 0) => {
    if (score > 30) return '#10b981'; // green
    if (score < -30) return '#ef4444'; // red
    return '#f59e0b'; // amber
  };

  const getClassificationBadge = (classifications) => {
    if (!classifications || classifications.length === 0) return null;

    const colors = {
      SWEEP: '#ef4444',
      BLOCK: '#f59e0b',
      NOTABLE: '#10b981',
    };

    return classifications.map((c) => (
      <span
        key={c}
        className="px-2 py-1 rounded text-xs font-bold mr-1"
        style={{ backgroundColor: colors[c] || '#6b7280', color: 'white' }}
      >
        {c}
      </span>
    ));
  };

  // Aggregate flows by symbol for sentiment chart
  const flowsBySymbol = flows.reduce((acc, flow) => {
    const sym = flow.symbol || 'UNKNOWN';
    if (!acc[sym]) acc[sym] = { bullish: 0, bearish: 0, neutral: 0 };

    if (flow.stanceScore > 30) acc[sym].bullish += 1;
    else if (flow.stanceScore < -30) acc[sym].bearish += 1;
    else acc[sym].neutral += 1;

    return acc;
  }, {});

  const sentimentChartData = Object.entries(flowsBySymbol).map(
    ([symbol, data]) => ({
      symbol,
      bullish: data.bullish,
      bearish: data.bearish,
      neutral: data.neutral,
    }),
  );

  // P&L over time
  const closedForPnl = positions.filter((p) => p.status === 'CLOSED');
  const pnlChartData = closedForPnl.map((p, i) => {
    const cum = closedForPnl
      .slice(0, i + 1)
      .reduce((sum, pos) => sum + (pos.dollarPnl || 0), 0);

    return {
      trade: i + 1,
      pnl: p.dollarPnl || 0,
      cumulative: cum,
    };
  });

  const openPositions = positions.filter((p) => p.status === 'OPEN');

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-green-400">
              🚀 IBKR Options Flow Tracker
            </h1>
            <p className="text-gray-400 mt-1">
              Real-time institutional flow analysis with auto-trading
            </p>
          </div>

          <div className="flex items-center space-x-4">
            {/* Connection pill */}
            <div
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg ${
                connected ? 'bg-green-900' : 'bg-red-900'
              }`}
            >
              <div
                className={`w-3 h-3 rounded-full ${
                  connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                }`}
              />
              <span className="font-semibold">
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>

            {/* Auto trade button (grey when off, green when on) */}
            <button
              onClick={toggleAutoTrade}
              className={`px-6 py-2 rounded-lg font-bold transition-all ${
                autoTradeEnabled
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-gray-600 hover:bg-gray-700'
              }`}
            >
              Auto-Trade: {autoTradeEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Total P&amp;L</div>
            <div
              className={`text-2xl font-bold ${
                stats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'
              }`}
            >
              ${stats.totalPnL.toFixed(2)}
            </div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Win Rate</div>
            <div className="text-2xl font-bold text-blue-400">
              {stats.winRate.toFixed(1)}%
            </div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Total Trades</div>
            <div className="text-2xl font-bold text-purple-400">
              {stats.totalTrades}
            </div>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
            <div className="text-gray-400 text-sm mb-1">Open Positions</div>
            <div className="text-2xl font-bold text-yellow-400">
              {stats.openPositions}
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Sentiment chart */}
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-bold mb-4 text-green-400">
            Flow Sentiment by Symbol
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={sentimentChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="symbol" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                }}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Legend />
              <Bar dataKey="bullish" fill="#10b981" name="Bullish" />
              <Bar dataKey="bearish" fill="#ef4444" name="Bearish" />
              <Bar dataKey="neutral" fill="#f59e0b" name="Neutral" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* PnL chart */}
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="text-lg font-bold mb-4 text-green-400">
            Cumulative P&amp;L
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={pnlChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="trade" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                }}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="cumulative"
                stroke="#8b5cf6"
                strokeWidth={2}
                name="Cumulative P&L"
              />
              <Line
                type="monotone"
                dataKey="pnl"
                stroke="#3b82f6"
                strokeWidth={1}
                name="Trade P&L"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Active positions */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
          <h3 className="text-lg font-bold mb-4 text-green-400 flex items-center justify-between">
            <span>📊 Active Positions</span>
            <span className="text-sm text-gray-400">
              {openPositions.length} open
            </span>
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {openPositions.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                No open positions
              </div>
            ) : (
              openPositions.map((pos, i) => {
                const pnl =
                  pos.current && pos.entry
                    ? (((pos.current - pos.entry) / pos.entry) * 100).toFixed(2)
                    : '0.00';
                const pnlColor =
                  parseFloat(pnl) >= 0 ? 'text-green-400' : 'text-red-400';

                return (
                  <div
                    key={`${pos.symbol}-${pos.strike}-${i}`}
                    className="bg-gray-900 p-3 rounded border border-gray-700"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="font-bold text-white">
                          {pos.symbol} {pos.type} ${pos.strike}
                        </div>
                        <div className="text-xs text-gray-400">
                          {pos.contracts} contracts • {pos.side}
                        </div>
                      </div>
                      <div className={`text-right ${pnlColor} font-bold`}>
                        {pnl}%
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-gray-400">
                      <div>Entry: ${pos.entry?.toFixed(2)}</div>
                      <div>Current: ${pos.current?.toFixed(2)}</div>
                      <div>Target: ${pos.profitTarget?.toFixed(2)}</div>
                    </div>
                    <div className="mt-2 w-full bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          parseFloat(pnl) >= 0 ? 'bg-green-500' : 'bg-red-500'
                        }`}
                        style={{
                          width: `${Math.min(Math.abs(parseFloat(pnl)) * 2, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Live flow feed */}
        <div className="col-span-2 bg-gray-800 rounded-lg border border-gray-700 p-4">
          <h3 className="text-lg font-bold mb-4 text-green-400 flex items-center justify-between">
            <span>🌊 Live Options Flow</span>
            <span className="text-sm text-gray-400">
              {flows.length} recent
            </span>
          </h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {flows.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                Waiting for flow data...
              </div>
            ) : (
              flows.map((flow, i) => {
                const key =
                  flow.timestamp ||
                  `${flow.symbol}-${flow.conid || i}-${i}`;
                const stanceScore = flow.stanceScore || 0;
                const volOi = flow.volOiRatio ?? null;

                return (
                  <div
                    key={key}
                    className="bg-gray-900 p-3 rounded border border-gray-700 hover:border-green-700 transition-all"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-lg text-white">
                          {flow.symbol}
                        </span>
                        <span className="text-gray-400">
                          {flow.type || flow.right}
                        </span>
                        {flow.strike && (
                          <span className="text-gray-300">${flow.strike}</span>
                        )}
                        {flow.classifications &&
                          getClassificationBadge(flow.classifications)}
                      </div>
                      <div className="text-right">
                        <div
                          className="font-bold"
                          style={{ color: getStanceColor(stanceScore) }}
                        >
                          {(flow.stanceLabel || 'NEUTRAL') +
                            ' ' +
                            stanceScore.toFixed(0)}
                        </div>
                        <div className="text-xs text-gray-400">
                          Conf: {(flow.confidence || 0).toFixed(0)}%
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-xs mb-2">
                      <div>
                        <div className="text-gray-400">Direction</div>
                        <div
                          className={`font-semibold ${
                            flow.direction === 'BTO' ||
                            flow.direction === 'BTC'
                              ? 'text-green-400'
                              : 'text-orange-400'
                          }`}
                        >
                          {flow.direction}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400">Size</div>
                        <div className="text-white">
                          {flow.size || flow.tradeSize}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400">Premium</div>
                        <div className="text-white">
                          $
                          {flow.premium
                            ? (flow.premium / 1_000_000).toFixed(2) + 'M'
                            : '0.00'}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-400">Vol/OI</div>
                        <div
                          className={`font-semibold ${
                            volOi != null && volOi >= 2
                              ? 'text-yellow-400'
                              : 'text-gray-400'
                          }`}
                        >
                          {volOi != null ? volOi.toFixed(2) : '--'}
                        </div>
                      </div>
                    </div>

                    {flow.greeks && (
                      <div className="grid grid-cols-4 gap-2 text-xs text-gray-500">
                        <div>Δ: {flow.greeks.delta?.toFixed(3)}</div>
                        <div>γ: {flow.greeks.gamma?.toFixed(4)}</div>
                        <div>θ: {flow.greeks.theta?.toFixed(3)}</div>
                        <div>IV: {(flow.greeks.iv * 100)?.toFixed(1)}%</div>
                      </div>
                    )}

                    <div className="mt-2 text-xs text-gray-500">
                      {flow.timestamp
                        ? new Date(flow.timestamp).toLocaleTimeString()
                        : ''}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Quick simulated trades */}
      <div className="mt-6 bg-gray-800 rounded-lg border border-gray-700 p-4">
        <h3 className="text-lg font-bold mb-4 text-green-400">
          🎯 Quick Simulated Trades
        </h3>
        <div className="grid grid-cols-4 gap-4">
          {['SPY', 'QQQ', 'AAPL', 'TSLA'].map((symbol) => (
            <div
              key={symbol}
              className="bg-gray-900 p-4 rounded border border-gray-700"
            >
              <div className="text-center mb-3">
                <div className="font-bold text-lg text-white">{symbol}</div>
                {signals[symbol] && (
                  <div className="text-xs mt-1">
                    <span className="text-gray-400">
                      Signals: {signals[symbol].count}
                    </span>
                    <div
                      className="font-semibold"
                      style={{
                        color: getStanceColor(signals[symbol].avgStance),
                      }}
                    >
                      {signals[symbol].avgStance?.toFixed(0)}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => placeSimulatedTrade(symbol, 'BULL')}
                  className="flex-1 bg-green-600 hover:bg-green-700 px-3 py-2 rounded font-bold text-sm transition-all"
                >
                  Bull
                </button>
                <button
                  onClick={() => placeSimulatedTrade(symbol, 'BEAR')}
                  className="flex-1 bg-red-600 hover:bg-red-700 px-3 py-2 rounded font-bold text-sm transition-all"
                >
                  Bear
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OptionsFlowUI;

