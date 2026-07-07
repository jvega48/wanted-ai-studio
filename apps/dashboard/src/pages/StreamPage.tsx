import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Radio, Square, Volume2, VolumeX, MessageSquare, Monitor } from 'lucide-react';
import { streamApi } from '../api/stream.js';
import { useAppStore } from '../stores/useAppStore.js';

const SCENE_PRESETS = ['Main', 'BRB', 'Just Chatting', 'Game', 'Outro', 'Starting Soon'];

export function StreamPage(): React.ReactElement {
  const qc = useQueryClient();
  const { stream } = useAppStore();
  const [activeScene, setActiveScene] = useState('Main');
  const [muted, setMuted] = useState(false);
  const [chatInput, setChatInput] = useState('');

  const { data: sessions = [] } = useQuery({
    queryKey: ['stream', 'sessions'],
    queryFn: () => streamApi.sessions({ limit: 1 }),
  });

  const startMutation = useMutation({
    mutationFn: () => streamApi.start({ platforms: ['TWITCH', 'YOUTUBE'], title: 'Live Stream', gameTitle: 'Just Chatting' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stream'] }),
  });

  const stopMutation = useMutation({
    mutationFn: () => streamApi.stop(sessions[0]?.id ?? ''),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stream'] }),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Stream Control</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMuted(!muted)}
            className={`btn-secondary gap-2 ${muted ? 'text-red-400 border-red-500/30' : ''}`}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            {muted ? 'Muted' : 'Mute'}
          </button>

          {stream.isLive ? (
            <button
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
              className="btn-danger gap-2"
            >
              <Square className="w-4 h-4" />
              End Stream
            </button>
          ) : (
            <button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="btn-primary gap-2"
            >
              <Radio className="w-4 h-4" />
              Go Live
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Stream preview placeholder + scene switcher */}
        <div className="xl:col-span-2 space-y-4">
          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Monitor className="w-4 h-4 text-brand-400" />
                OBS Preview
              </h3>
              {stream.isLive && <span className="badge-live">LIVE</span>}
            </div>
            <div className="aspect-video bg-black/60 rounded-xl flex items-center justify-center border border-white/5">
              <div className="text-center text-gray-500">
                <Monitor className="w-12 h-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">OBS preview requires Studio connection</p>
                <p className="text-xs mt-1 text-gray-600">Connect via Settings → OBS</p>
              </div>
            </div>
          </div>

          {/* Scene switcher */}
          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold text-white">Scenes</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SCENE_PRESETS.map((scene) => (
                <button
                  key={scene}
                  onClick={() => setActiveScene(scene)}
                  className={`py-3 px-4 rounded-xl text-sm font-medium transition-all border ${
                    activeScene === scene
                      ? 'bg-brand-600/20 border-brand-500/50 text-brand-300'
                      : 'bg-white/3 border-white/5 text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {scene}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chat panel */}
        <div className="card flex flex-col" style={{ maxHeight: '70vh' }}>
          <div className="card-header flex-shrink-0">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-brand-400" />
              Live Chat
            </h3>
            {stream.isLive && (
              <span className="text-xs text-gray-400">{stream.chatRate.toFixed(1)}/min</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {!stream.isLive ? (
              <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
                Chat appears when live
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
                Chat messages will appear here via WebSocket
              </div>
            )}
          </div>

          <div className="flex-shrink-0 pt-3 border-t border-white/5">
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && chatInput.trim()) setChatInput('');
                }}
                placeholder="Send as moderator..."
                className="input flex-1 text-sm"
                disabled={!stream.isLive}
              />
              <button
                onClick={() => { if (chatInput.trim()) setChatInput(''); }}
                disabled={!stream.isLive || !chatInput.trim()}
                className="btn-primary px-3"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
