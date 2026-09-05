import { useEffect, useState } from 'react';

const copy = {
  ru: {
    title: 'Дипломатическая рабочая станция',
    build: 'Среда разработки',
    description: 'Начальная оболочка приложения. Игровые модули ещё не подключены.',
    checking: 'Проверяем соединение…',
    connected: 'Сервер доступен',
    disconnected: 'Нет соединения. Проверьте, что API запущен, и повторите проверку.',
    retry: 'Проверить соединение',
    privacy: 'Проверка соединения не обращается к ИИ и не требует ключа.',
  },
  en: {
    title: 'Diplomatic workstation',
    build: 'Development environment',
    description: 'Application startup shell. Game modules are not connected yet.',
    checking: 'Checking connection…',
    connected: 'Server connected',
    disconnected: 'No connection. Check that the API is running and try again.',
    retry: 'Check connection',
    privacy: 'Connection checks do not call AI or require a key.',
  },
};

export function Startup() {
  const [locale, setLocale] = useState<'ru' | 'en'>('ru');
  const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [attempt, setAttempt] = useState(0);
  const text = copy[locale];

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    let active = true;
    setStatus('checking');
    void fetch('/api/health', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const data: unknown = await response.json();
        if (!response.ok || typeof data !== 'object' || data === null ||
            !('status' in data) || data.status !== 'ok') throw new Error('Health check failed');
        if (active) setStatus('connected');
      })
      .catch(() => { if (active) setStatus('disconnected'); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  return (
    <main className="startup-desktop">
      <section className="startup-window" aria-labelledby="app-title">
        <header className="startup-titlebar">{text.title}</header>
        <div className="startup-body">
          <p className="startup-build">{text.build}</p>
          <h1 id="app-title">Astra Realpolitik</h1>
          <p>{text.description}</p>
          <div className="startup-connection">
            <p role="status" aria-live="polite">{text[status]}</p>
            <button disabled={status === 'checking'} onClick={() => setAttempt((value) => value + 1)}>
              {text.retry}
            </button>
          </div>
          <p className="startup-note">{text.privacy}</p>
        </div>
        <footer className="startup-footer">
          <span>RU / EN</span>
          <button onClick={() => setLocale(locale === 'ru' ? 'en' : 'ru')}>
            {locale === 'ru' ? 'English' : 'Русский'}
          </button>
        </footer>
      </section>
    </main>
  );
}
