import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Settings, Twitch, Youtube, Music2, Radio, Eye, EyeOff, Save, CheckCircle, AlertCircle, Loader } from 'lucide-react';

const API_BASE = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3001/api/v1';

interface Credentials {
  twitch: { clientId: string; clientSecret: string; channelName: string; accessToken: string; refreshToken: string };
  youtube: { clientId: string; clientSecret: string; channelId: string; refreshToken: string };
  tiktok: { clientKey: string; clientSecret: string };
  obs: { host: string; port: number; password: string };
  openai: { apiKey: string; model: string; ttsVoice: string };
  discord: { webhookUrl: string; clipWebhookUrl: string };
}

const EMPTY: Credentials = {
  twitch: { clientId: '', clientSecret: '', channelName: '', accessToken: '', refreshToken: '' },
  youtube: { clientId: '', clientSecret: '', channelId: '', refreshToken: '' },
  tiktok: { clientKey: '', clientSecret: '' },
  obs: { host: 'localhost', port: 4455, password: '' },
  openai: { apiKey: '', model: 'gpt-4o', ttsVoice: 'nova' },
  discord: { webhookUrl: '', clipWebhookUrl: '' },
};

function Field({ label, placeholder, type = 'text', value, onChange, hint }: {
  label: string; placeholder?: string; type?: 'text' | 'password' | 'number' | 'url';
  value: string; onChange: (v: string) => void; hint?: string;
}): React.ReactElement {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div>
      <label className="text-xs font-medium text-gray-400 block mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={isPassword && !show ? 'password' : 'text'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input w-full text-sm pr-10"
        />
        {isPassword && (
          <button type="button" onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

function Section({ title, icon: Icon, children }: {
  title: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="card">
      <div className="card-header mb-4">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <Icon className="w-4 h-4 text-brand-400" />
          {title}
        </h3>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function SettingsPage(): React.ReactElement {
  const [form, setForm] = useState<Credentials>(EMPTY);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const { data: loaded, isLoading } = useQuery({
    queryKey: ['settings', 'credentials'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/settings/credentials`);
      if (!res.ok) throw new Error('Failed to load settings');
      return res.json() as Promise<Credentials>;
    },
  });

  useEffect(() => {
    if (loaded) setForm(loaded);
  }, [loaded]);

  const saveMutation = useMutation({
    mutationFn: async (creds: Credentials) => {
      const res = await fetch(`${API_BASE}/settings/credentials`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      if (!res.ok) throw new Error('Save failed');
      return res.json();
    },
    onSuccess: () => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
    onError: () => {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
  });

  function set<S extends keyof Credentials>(section: S, field: keyof Credentials[S], value: string): void {
    setForm((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  }

  const SaveIcon = saveStatus === 'saved' ? CheckCircle
    : saveStatus === 'error' ? AlertCircle
    : saveMutation.isPending ? Loader
    : Save;

  const saveLabel = saveStatus === 'saved' ? 'Saved!'
    : saveStatus === 'error' ? 'Error saving'
    : saveMutation.isPending ? 'Saving…'
    : 'Save Changes';

  const saveBtnClass = saveStatus === 'saved' ? 'btn bg-green-600 hover:bg-green-600 text-white'
    : saveStatus === 'error' ? 'btn bg-red-600 hover:bg-red-600 text-white'
    : 'btn-primary';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-6 h-6 animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-sm text-gray-400 mt-0.5">Credentials are saved to the server and applied immediately</p>
        </div>
        <button
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending}
          className={`${saveBtnClass} gap-2`}
        >
          <SaveIcon className={`w-4 h-4 ${saveMutation.isPending ? 'animate-spin' : ''}`} />
          {saveLabel}
        </button>
      </div>

      <Section title="Twitch" icon={Twitch}>
        <Field label="Client ID" value={form.twitch.clientId}
          onChange={(v) => set('twitch', 'clientId', v)} placeholder="abc123..." />
        <Field label="Client Secret" type="password" value={form.twitch.clientSecret}
          onChange={(v) => set('twitch', 'clientSecret', v)} />
        <Field label="Channel Name" value={form.twitch.channelName}
          onChange={(v) => set('twitch', 'channelName', v)} placeholder="yourchannelname" />
        <Field label="Access Token" type="password" value={form.twitch.accessToken}
          onChange={(v) => set('twitch', 'accessToken', v)} />
        <Field label="Refresh Token" type="password" value={form.twitch.refreshToken}
          onChange={(v) => set('twitch', 'refreshToken', v)} />
      </Section>

      <Section title="YouTube" icon={Youtube}>
        <Field label="OAuth Client ID" value={form.youtube.clientId}
          onChange={(v) => set('youtube', 'clientId', v)} />
        <Field label="OAuth Client Secret" type="password" value={form.youtube.clientSecret}
          onChange={(v) => set('youtube', 'clientSecret', v)} />
        <Field label="Channel ID" value={form.youtube.channelId}
          onChange={(v) => set('youtube', 'channelId', v)} placeholder="UCxxxxxxxx" />
        <Field label="Refresh Token" type="password" value={form.youtube.refreshToken}
          onChange={(v) => set('youtube', 'refreshToken', v)} />
      </Section>

      <Section title="TikTok" icon={Music2}>
        <Field label="Client Key" value={form.tiktok.clientKey}
          onChange={(v) => set('tiktok', 'clientKey', v)} />
        <Field label="Client Secret" type="password" value={form.tiktok.clientSecret}
          onChange={(v) => set('tiktok', 'clientSecret', v)} />
      </Section>

      <Section title="OBS WebSocket" icon={Radio}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Host" value={form.obs.host}
            onChange={(v) => set('obs', 'host', v)} placeholder="localhost" />
          <Field label="Port" value={String(form.obs.port)}
            onChange={(v) => set('obs', 'port', v)} placeholder="4455" />
        </div>
        <Field label="Password" type="password" value={form.obs.password}
          onChange={(v) => set('obs', 'password', v)}
          hint="Leave empty if OBS authentication is disabled" />
      </Section>

      <Section title="OpenAI" icon={Settings}>
        <Field label="API Key" type="password" value={form.openai.apiKey}
          onChange={(v) => set('openai', 'apiKey', v)} placeholder="sk-..." />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-400 block mb-1.5">Model</label>
            <select value={form.openai.model} onChange={(e) => set('openai', 'model', e.target.value)}
              className="input w-full text-sm">
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o Mini</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-400 block mb-1.5">TTS Voice</label>
            <select value={form.openai.ttsVoice} onChange={(e) => set('openai', 'ttsVoice', e.target.value)}
              className="input w-full text-sm">
              {['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Section title="Discord" icon={Settings}>
        <Field label="Stream Alert Webhook" type="password" value={form.discord.webhookUrl}
          onChange={(v) => set('discord', 'webhookUrl', v)}
          hint="Paste the full Discord webhook URL" />
        <Field label="Clip Alert Webhook" type="password" value={form.discord.clipWebhookUrl}
          onChange={(v) => set('discord', 'clipWebhookUrl', v)} />
      </Section>
    </div>
  );
}
